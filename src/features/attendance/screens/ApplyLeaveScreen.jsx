// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/screens/ApplyLeaveScreen.jsx — "Apply for leave".
//
// Web ancestor: ApplyLeaveDrawer inside roles/employee/screens/LeaveDashboard.
// A ROUTE presented as a modal (tabs.employee.js), drawing its own chrome with
// `FormSheet` and a PINNED footer — same shape, and the same reasons, as
// CorrectionFormScreen: a form whose submit scrolls away is a form people lose.
//
// ── NEVER COUNT THE DAYS HERE ───────────────────────────────────────────────
//
// The backend applies holidays, weekly offs, the sandwich rule and the unpaid
// split, and returns `total_days` / `paid_days` / `unpaid_days` with a
// day-by-day breakdown. A number worked out on the phone would be a SECOND,
// WRONG answer sitting next to the right one — somebody asks for Fri–Mon, the
// form says 4, the approval says 2, and now the form is a liar.
//
// So the span below is a HINT and says so in words ("about N days"). It feeds
// two warnings and is never sent and never shown as the answer. The real
// figure arrives in the submit response and goes in the toast.
//
// ── THE BALANCE WARNING COUNTS PENDING REQUESTS TOO ─────────────────────────
//
// A pending request has not been deducted yet, so `current_balance` overstates
// what is actually free. Somebody with 2 days left and 2 days pending has 0,
// and finding that out from a rejection a week later is the worst version of
// it. Pending requests of the same type are subtracted — the web's "phantom
// hold", same arithmetic.
//
// It is a WARNING, never a block: the backend splits the overflow into unpaid
// days and approves anyway, which is a legitimate thing to want.
//
// ── §11 · THE BUTTON STAYS LIVE ─────────────────────────────────────────────
//
// Nothing is red before somebody claims to be finished, the press checks and
// TRAVELS to the first problem on screen, and Submit is disabled only for a
// request already in flight.
//
// ── THE ATTACHMENT IS A LINK, NOT A FILE PICKER ─────────────────────────────
//
// The web offers both a link and a document the person already has in the
// portal; `document_id` needs a picker over /documents, which belongs to the
// Docs tab and isn't built. A link is the half that works today, so it is the
// half that ships — §2: what we lack is absent, not broken. Required only
// when the leave type says so and the span crosses its threshold, which is
// the same rule the server enforces (DOCUMENT_REQUIRED).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { leaveAPI } from '../../../api';
import { useFormFocus } from '../../../hooks/useFormFocus';
import { useResource } from '../../../hooks/useResource';
import { revealer, submitState } from '../../../lib/formGuard';
import { LEAVE_REASON_MAX, validateLeaveRequest } from '../../../lib/validation';
import { parseYMDLocal, todayYMD } from '../../../lib/dates';
import { formatDayCount } from '../../../lib/format';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../../lib/events';
import { leaveErrorMessage } from '../../../lib/errors/leaveErrors';
import { normalizeStatusKey } from '../../../lib/enums';
import { num, toList } from '../../../lib/normalize';
import { color, space, text } from '../../../theme/tokens';
import {
  Button, DateField, Field, FormGrid, FormSheet, InlineAlert, Select, SkeletonBlock,
  TextField, Toggle, showToast,
} from '../../../ui';

const HALF_DAY_OPTIONS = [
  { value: 'first_half', label: 'First half' },
  { value: 'second_half', label: 'Second half' },
];

/* `getMyLeaveTypes` returns either a flat leave type or a per-user config
   wrapper `{ leave_type, … }`. One shape in, one shape out, here. */
function toTypeOption(item) {
  const lt = item?.leave_type ? item.leave_type : item;
  const id = lt?.id || lt?._id || item?.leave_type_id;
  if (!id || !lt?.name) return null;
  return {
    value: id,
    label: lt.name,
    threshold: num(lt.requires_document_threshold ?? item?.requires_document_threshold, 0),
  };
}

/** Calendar days between two YMDs, inclusive. A HINT — see the header. */
function spanOf(form) {
  if (form.is_half_day) return 0.5;
  const s = parseYMDLocal(form.start_date);
  const e = parseYMDLocal(form.end_date);
  if (!s || !e || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

export default function ApplyLeaveScreen({ navigation }) {
  const scroller = useRef(null);
  const focus = useFormFocus(scroller);

  const [form, setForm] = useState({
    leave_type_id: '',
    start_date: '',
    end_date: '',
    is_half_day: false,
    half_day_type: 'first_half',
    reason: '',
    document_url: '',
    document_id: '',
  });
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  const types = useResource(() => leaveAPI.getMyLeaveTypes(), {
    select: (data) => toList(data, ['leave_types', 'types']).map(toTypeOption).filter(Boolean),
    initial: [],
  });
  const balances = useResource(() => leaveAPI.getMyBalances(new Date().getFullYear()), {
    select: (data) => toList(data, ['balances', 'leave_balances']),
    initial: [],
  });
  const requests = useResource(() => leaveAPI.getMyRequests(), {
    select: (data) => toList(data, ['requests', 'leave_requests', 'leaves']),
    initial: [],
  });

  const typeOptions = types.data || [];
  const selectedType = typeOptions.find((t) => t.value === form.leave_type_id) || null;

  const set = useCallback((key, value) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // A half day is ONE day. Locking the end date to the start removes the
      // only way to make this request invalid, rather than validating it.
      if (key === 'is_half_day' && value === true) next.end_date = f.start_date;
      if (key === 'start_date' && f.is_half_day) next.end_date = value;
      // Nobody picks an end date before the start on purpose. Carrying the
      // start forward is right far more often than an error message.
      if (key === 'start_date' && !f.is_half_day && (!f.end_date || f.end_date < value)) {
        next.end_date = value;
      }
      return next;
    });
    setFailure('');
  }, []);

  const { errors: baseProblems, payload } = useMemo(() => validateLeaveRequest(form), [form]);

  const span = useMemo(() => spanOf(form), [form]);

  /* What is genuinely free of this leave type: the balance, less anything
     already asked for and not yet decided. */
  const freeDays = useMemo(() => {
    if (!selectedType) return null;
    const bal = (balances.data || []).find(
      (b) => (b?.leave_type_id || b?.leave_type?.id) === selectedType.value,
    );
    if (!bal) return null;
    const held = (requests.data || []).reduce((sum, r) => {
      const id = r?.leave_type_id || r?.leave_type?.id;
      const st = normalizeStatusKey(r?.status);
      const counts = st === 'pending' || st === 'cancellation_pending';
      return id === selectedType.value && counts ? sum + num(r?.total_days, 0) : sum;
    }, 0);
    return num(bal.current_balance, 0) - held;
  }, [selectedType, balances.data, requests.data]);

  const threshold = selectedType?.threshold || 0;
  const needsDocument = threshold > 0 && span > threshold;
  const hasDocument = !!form.document_url.trim() || !!form.document_id;

  const problems = useMemo(() => (
    needsDocument && !hasDocument
      ? { ...baseProblems, document_url: `This leave type needs a supporting document for more than ${formatDayCount(threshold, { lower: true })}.` }
      : baseProblems
  ), [baseProblems, needsDocument, hasDocument, threshold]);

  const show = revealer(attempted);
  const { disabled, disabledReason } = submitState({ busy });

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
      const res = await leaveAPI.submitRequest(payload);
      // THE SERVER'S COUNT, never ours. This is the first time anybody sees
      // the real number of days, including the unpaid split.
      const saved = res?.data?.leaveRequest || res?.data || res?.leaveRequest || {};
      const total = saved?.total_days;
      const unpaid = num(saved?.unpaid_days, 0);
      const count = total != null ? formatDayCount(total, { lower: true }) : '';

      emitAttendanceChanged(ATTENDANCE_EVENTS.LEAVE, { action: 'submit' });
      showToast(
        unpaid > 0
          ? `Leave sent for ${count}, of which ${formatDayCount(unpaid, { lower: true })} unpaid.`
          : count
            ? `Leave sent for ${count}. Your manager reviews it next.`
            : 'Leave sent. Your manager reviews it next.',
        'success',
      );
      navigation.goBack();
    } catch (err) {
      setFailure(leaveErrorMessage(err, 'We couldn’t send your leave request.'));
    } finally {
      setBusy(false);
    }
  }, [busy, focus, problems, payload, navigation]);

  // No leave types at all means no policy has been assigned. There is nothing
  // to fill in, so the form says so instead of offering an empty picker (§2).
  const noTypes = !types.loading && typeOptions.length === 0;

  return (
    <FormSheet
      title="Apply for leave"
      subtitle="Your manager reviews it before it’s booked."
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
              disabled={disabled || noTypes}
              disabledReason={noTypes ? 'No leave policy on your account yet.' : disabledReason}
              fullWidth
            />
          </View>
        </>
      )}
    >
      {failure ? <InlineAlert tone="rose">{failure}</InlineAlert> : null}

      {noTypes ? (
        <InlineAlert tone="amber">
          There’s no leave policy on your account yet, so there’s nothing to apply for. Ask your HR team to assign one.
        </InlineAlert>
      ) : null}

      <FormGrid>
        <Field
          wide
          required
          label="Which leave"
          error={show(problems.leave_type_id)}
          register={focus.register('leave_type_id')}
        >
          {types.loading ? (
            <SkeletonBlock height={46} />
          ) : (
            <Select
              title="Which leave"
              options={typeOptions}
              value={form.leave_type_id}
              onChange={(v) => set('leave_type_id', v)}
              placeholder="Pick a leave type"
            />
          )}
        </Field>

        {/* Not inside a `Field`: Field clones its child with `invalid` and
            `registerFocus`, and a switch has neither. Same as the next-day
            switch on CorrectionFormScreen. */}
        <View style={{ width: '100%' }}>
          <Toggle
            label="Half day"
            caption="One day only, first or second half."
            value={form.is_half_day}
            onValueChange={(v) => set('is_half_day', v)}
          />
        </View>

        {form.is_half_day ? (
          <Field wide label="Which half" register={focus.register('half_day_type')}>
            <Select
              title="Which half"
              options={HALF_DAY_OPTIONS}
              value={form.half_day_type}
              onChange={(v) => set('half_day_type', v)}
            />
          </Field>
        ) : null}

        <Field
          required
          label={form.is_half_day ? 'The day' : 'First day'}
          error={show(problems.start_date)}
          register={focus.register('start_date')}
        >
          <DateField
            value={form.start_date}
            onChange={(v) => set('start_date', v)}
            placeholder="Pick a day"
          />
        </Field>

        {/* Hidden while half-day is on: it is locked to the start date, and a
            second picker that cannot be moved is a box people fight with. */}
        {form.is_half_day ? null : (
          <Field
            required
            label="Last day"
            error={show(problems.end_date)}
            register={focus.register('end_date')}
          >
            <DateField
              value={form.end_date}
              onChange={(v) => set('end_date', v)}
              min={form.start_date || todayYMD()}
              placeholder="Pick a day"
            />
          </Field>
        )}

        <Field
          wide
          label="Reason"
          error={show(problems.reason)}
          register={focus.register('reason')}
          labelRight={(
            <Text style={[text.caption, { fontVariant: ['tabular-nums'] }]}>
              {`${form.reason.length}/${LEAVE_REASON_MAX}`}
            </Text>
          )}
        >
          <TextField
            value={form.reason}
            onChangeText={(v) => set('reason', v)}
            placeholder="e.g. Family wedding out of town"
            multiline
            maxLength={LEAVE_REASON_MAX}
          />
        </Field>

        {/* Only asked for when it is wanted. An attachment box on every leave
            request reads as a requirement nobody can meet. */}
        {threshold > 0 ? (
          <Field
            wide
            required={needsDocument}
            label="Supporting document"
            hint={`Needed for more than ${formatDayCount(threshold, { lower: true })} of this leave.`}
            error={show(problems.document_url)}
            register={focus.register('document_url')}
          >
            <TextField
              value={form.document_url}
              onChangeText={(v) => set('document_url', v)}
              placeholder="Paste a link to the certificate or letter"
              autoCapitalize="none"
              keyboardType="url"
            />
          </Field>
        ) : null}
      </FormGrid>

      {/* The two things worth saying before somebody presses send, and both
          are warnings rather than errors — the server accepts either. */}
      {freeDays !== null && span > 0 && span > freeDays ? (
        <InlineAlert tone="amber">
          {`You have about ${formatDayCount(freeDays, { lower: true })} of this leave free, counting what’s already waiting for approval. Anything over that is usually taken as unpaid.`}
        </InlineAlert>
      ) : null}

      <Text style={[text.caption, { color: color.textMuted, marginTop: space[1] }]}>
        Weekends, holidays and your weekly offs aren’t deducted — the exact number of days is worked out when you send this.
      </Text>
    </FormSheet>
  );
}

export { ApplyLeaveScreen };
