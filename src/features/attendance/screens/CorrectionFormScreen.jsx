// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/screens/CorrectionFormScreen.jsx — "Request a correction".
//
// Spec: NativeRef/40-screens/03-time.md § CorrectionForm. Web ancestor:
// RegularizationFormModal inside roles/employee/components/RegularizationCard.
//
// It is a ROUTE presented as a modal (tabs.employee.js gives it
// `presentation: 'modal'`, which also turns the native header off) and it
// draws its own chrome with `FormSheet` — the title, the X, and a FOOTER THAT
// IS PINNED. A form whose submit scrolls away is a form people lose.
//
// ── §11 · THE BUTTON STAYS LIVE. THE PRESS DOES THE CHECKING ────────────────
//
// Nothing is red before somebody has claimed to be finished (`attempted`), the
// press never reaches the API on an unfinished form, and it TRAVELS to the
// first problem — `useFormFocus` measures each field's y, so "first" means
// first on screen, not first in the problems object. A dead button can only
// sulk; it cannot point at the box.
//
// Send is disabled for ONE thing — a request already in flight — because that
// is the only thing a second press cannot fix (lib/formGuard.js `submitState`).
//
// ── THE CHECKS ARE THE WEB'S, NOT A SECOND COPY ─────────────────────────────
//
// `validateRegularization()` in lib/validation.js is the ported web validator
// and it returns BOTH the problems and the payload — including the ISO
// datetimes, which matters: for an overnight correction the backend cannot
// tell from a bare "HH:mm" that the clock-out belongs to the next day, so the
// wire carries full local datetimes (api/attendance.api.js).
//
// Two of its keys are not field names. `times` is the §11 pattern for a step
// that isn't one box ("give at least one time"), shown under the PAIR it
// belongs to; it registers its own position so the travel can still reach it.
//
// ── WHY THE "NEXT DAY" SWITCH APPEARS AND DISAPPEARS ────────────────────────
//
// It is only a question when the clock-out could plausibly be on the next day
// — when it is earlier than the clock-in, or when there is no clock-in to
// compare it with. Showing it on every form invites people to tick it for a
// 9-to-6 day and turn a correct request into a 21-hour one.
//
// ── ONE ⓘ, AND IT ALREADY EXISTS ────────────────────────────────────────────
//
// `attendance.regularization` → `work_mode`, in fieldHelp.employee.json. The
// date, the times and the reason are ordinary fields (§10 row 1) and get
// nothing. Four ⓘ on a five-field form is wallpaper.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { useFormFocus } from '../../../hooks/useFormFocus';
import { revealer, submitState } from '../../../lib/formGuard';
import {
  REGULARIZATION_REASON_MAX, validateRegularization,
} from '../../../lib/validation';
import { WORK_MODES } from '../../../lib/enums';
import { addDaysYMD, todayYMD } from '../../../lib/dates';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../../lib/events';
import { attendanceErrorMessage } from '../../../lib/errors/attendanceErrors';
import { color, text } from '../../../theme/tokens';
import {
  Button, DateField, Field, FieldError, FormGrid, FormSheet, InlineAlert,
  Select, TextField, TimeField, Toggle, showToast,
} from '../../../ui';

const WORK_MODE_OPTIONS = [
  // "Keep as recorded" is the default and it is a REAL answer, not a blank:
  // most corrections are about a time, and forcing a work-mode choice would
  // make people change something they did not mean to.
  { value: '', label: 'Keep as recorded' },
  ...WORK_MODES,
];

export default function CorrectionFormScreen({ navigation, route }) {
  const scroller = useRef(null);
  const focus = useFormFocus(scroller);

  // Only a day that has PASSED can be corrected, so the picker cannot even
  // offer today — which is better than a date field that accepts a value and
  // then refuses it (§11).
  const maxDate = addDaysYMD(todayYMD(), -1);

  // Opened from a day ("this one is wrong") the date arrives prefilled. A
  // prefill that isn't correctable is ignored rather than shown and rejected.
  const rawPrefill = route?.params?.date;
  const prefill = typeof rawPrefill === 'string' && rawPrefill <= maxDate ? rawPrefill : '';
  const [form, setForm] = useState({
    date: prefill,
    clockIn: '',
    clockOut: '',
    outNextDay: false,
    work_mode: '',
    reason: '',
  });
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  const set = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    // A failure is about the request that was sent, not the one being typed.
    setFailure('');
  }, []);

  const { errors: problems, payload } = useMemo(
    () => validateRegularization(form),
    [form],
  );

  const show = revealer(attempted);
  const { disabled, disabledReason } = submitState({ busy });

  // Only a question when the clock-out could genuinely be the next day.
  const askNextDay = !!form.clockOut
    && (!form.clockIn || form.clockOut <= form.clockIn || form.outNextDay);

  const close = useCallback(() => {
    if (busy) return;
    navigation.goBack();
  }, [busy, navigation]);

  const send = useCallback(async () => {
    if (busy) return;
    if (focus.focusFirstProblem(problems)) {
      setAttempted(true);
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      await attendanceAPI.submitRegularization(payload);
      // The list refreshes FROM THE EVENT, not from a second fetch wired into
      // the close handler (CLAUDE.md §7).
      emitAttendanceChanged(ATTENDANCE_EVENTS.REGULARIZATION, { action: 'submit' });
      showToast('Correction sent. Your manager reviews it next.', 'success');
      navigation.goBack();
    } catch (err) {
      setFailure(attendanceErrorMessage(err, 'We couldn’t send your request.'));
    } finally {
      setBusy(false);
    }
  }, [busy, focus, problems, payload, navigation]);

  return (
    <FormSheet
      title="Request a correction"
      subtitle="Your manager reviews it before your attendance changes."
      onClose={close}
      scrollRef={scroller}
      footer={(
        <>
          <View style={{ flex: 1 }}>
            <Button title="Cancel" variant="outline" onPress={close} disabled={busy} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Send request"
              onPress={send}
              loading={busy}
              disabled={disabled}
              disabledReason={disabledReason}
              fullWidth
            />
          </View>
        </>
      )}
    >
      {failure ? <InlineAlert tone="rose">{failure}</InlineAlert> : null}

      <FormGrid>
        <Field
          wide
          required
          label="Which day"
          error={show(problems.date)}
          hint="Only a day that has already passed, and only inside your policy’s correction window."
          register={focus.register('date')}
        >
          <DateField
            value={form.date}
            onChange={(v) => set('date', v)}
            max={maxDate}
            placeholder="Pick the day"
          />
        </Field>

        {/* Side by side: two time pickers in one column push the reason box
            below the fold on a 390pt phone, and §3's rule for four or more
            fields is gridded, not scrolled. */}
        <Field label="Clock in" error={show(problems.clockIn)} register={focus.register('clockIn')}>
          <TimeField value={form.clockIn} onChange={(v) => set('clockIn', v)} />
        </Field>

        <Field label="Clock out" error={show(problems.clockOut)} register={focus.register('clockOut')}>
          <TimeField value={form.clockOut} onChange={(v) => set('clockOut', v)} />
        </Field>

        {/* The pair's own message: "give at least one time" belongs to neither
            box, so it sits under both of them. */}
        <View style={{ width: '100%' }} onLayout={focus.register('times').onLayout}>
          {askNextDay ? (
            <Toggle
              label="Clock-out was the next day"
              caption="For a shift that ended after midnight."
              value={form.outNextDay}
              onValueChange={(v) => set('outNextDay', v)}
            />
          ) : null}
          {show(problems.times) ? <FieldError>{problems.times}</FieldError> : null}
        </View>

        <Field
          wide
          label="Worked from"
          help={{ surface: 'attendance.regularization', field: 'work_mode' }}
          error={show(problems.work_mode)}
          hint="Applied to the day if the correction is approved."
          register={focus.register('work_mode')}
        >
          <Select
            title="Worked from"
            options={WORK_MODE_OPTIONS}
            value={form.work_mode}
            onChange={(v) => set('work_mode', v)}
          />
        </Field>

        <Field
          wide
          required
          label="What actually happened"
          error={show(problems.reason)}
          register={focus.register('reason')}
          labelRight={(
            <Text style={[text.caption, { fontVariant: ['tabular-nums'] }]}>
              {`${form.reason.length}/${REGULARIZATION_REASON_MAX}`}
            </Text>
          )}
        >
          <TextField
            value={form.reason}
            onChangeText={(v) => set('reason', v)}
            placeholder="e.g. Forgot to clock out after the client meeting"
            multiline
            maxLength={REGULARIZATION_REASON_MAX}
          />
        </Field>
      </FormGrid>

      <Text style={[text.caption, { color: color.textMuted }]}>
        Your manager reads the reason, so say what happened rather than what you want changed.
      </Text>
    </FormSheet>
  );
}

export { CorrectionFormScreen };
