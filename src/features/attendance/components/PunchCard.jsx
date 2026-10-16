// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/PunchCard.jsx — the whole point of Home.
//
// Ported from the web AttendanceCard. Three server states (idle · working ·
// done) and the overlays on idle; the ring, the live clock and the two punch
// buttons. Spec: NativeRef/40-screens/02-home-and-punch.md §4–§8.
//
// ── THE RULES THAT MATTER (and break most often) ─────────────────────────────
//
//   • THE STATE COMES FROM THE SERVER (T-H2). `today.status` decides which
//     buttons show. We never re-derive it from `clock_out_time` — that breaks
//     the overnight carry-over. The clock fields are read ONLY for the live
//     number, never for the state machine.
//
//   • A PUNCH IS NEVER QUEUED OFFLINE (T-H1). Offline → the button stays live
//     and fails with one clear sentence on press. No optimistic "clocked in".
//
//   • LOCATION NEVER BLOCKS THE PUNCH (§6). Every GEO_STATUS other than GRANTED
//     still sends the punch, without coordinates; the server flags it. A
//     location failure that disabled the button would strand someone at the
//     gate.
//
//   • THE GEOFENCE RESULT IS NEVER AN ERROR (§5). All four outcomes are a 200.
//     geofenceNotice() owns the wording and the tone — never rose, never
//     "couldn't clock you in", never a rolled-back punch.
//
//   • STATE RECONCILIATION IS NOT A FAILURE (§6). "You're already clocked in"
//     means our view was stale: refresh and show nothing. No red, no toast.
//
//   • WORK MODE SHOWS ONLY FOR A HYBRID CONTRACT (§5). Sending it otherwise
//     raises a claim-mismatch flag against the person, so everyone else sends
//     nothing and the server decides.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { attendanceAPI } from '../../../api';
import { useLiveWorked } from '../../../hooks/useTodayAttendance';
import { emitAttendanceChanged, ATTENDANCE_EVENTS } from '../../../lib/events';
import {
  getPunchLocation,
  locationPayload,
  locationMessage,
  GEO_STATUS,
} from '../../../lib/location';
import {
  choosesWorkMode,
  geofenceNotice,
  normalizeWorkMode,
  permittedWorkModes,
} from '../../../lib/geofence';
// Imported from the module, not the barrel: lib/errors/index.js exposes these
// through its registry (errorPresentation) rather than re-exporting them, so a
// barrel import would resolve to undefined and crash on the first punch.
import { attendanceErrorMessage, isStateReconciliation } from '../../../lib/errors/attendanceErrors';
import { WORK_MODE_VALUES, normalizeStatusKey } from '../../../lib/enums';
import { fmtClockMinutes, fmtClockTime } from '../../../lib/dates';
import { color, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, ButtonRow, Card, FieldHelp, InlineAlert, Select, StatusBadge,
} from '../../../ui';
import { useToast, useConfirm } from '../../../ui';
import { ProgressRing } from './ProgressRing';

const WORK_MODE_KEY = 'hrclouds_attendance_work_mode';
const WORK_MODE_LABEL = { office: 'Office', remote: 'Remote', hybrid: 'Hybrid', field: 'Field' };

/* ── Reading the server state ─────────────────────────────────────────────────
   `today.status` is authoritative (T-H2). This maps the vocabulary the gateway
   uses to our three card states; an unknown or absent status falls back to the
   clock fields, which is all we have left — but never ahead of the status. */
function punchState(today, isClockedIn) {
  const s = normalizeStatusKey(today?.status);
  if (['clocked_in', 'working', 'present', 'in', 'on_break', 'break', 'checked_in'].includes(s)) {
    return 'working';
  }
  if (['clocked_out', 'completed', 'done', 'checked_out', 'out', 'present_completed'].includes(s)) {
    return 'done';
  }
  if (['not_clocked_in', 'idle', 'yet_to_clock_in', 'pending', 'absent'].includes(s)) {
    return 'idle';
  }
  if (isClockedIn) return 'working';
  if (today?.clock_out_time || today?.clock_out || today?.last_out_time) return 'done';
  return 'idle';
}

/* Shift length in minutes, from "HH:MM" start/end. null when no shift is
   assigned — the ring then stays empty and the clock is a plain elapsed one. */
function shiftMinutes(shift) {
  const toMin = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const start = toMin(shift?.start_time);
  const end = toMin(shift?.end_time);
  if (start == null || end == null) return null;
  // An end before start is an overnight shift; add a day.
  const span = end >= start ? end - start : end + 24 * 60 - start;
  return span > 0 ? span : null;
}

/* The idle overlay, from today.day_status. Exact copy per §5; an unknown
   context says nothing rather than inventing a sentence. */
function idleOverlay(today, shift) {
  const ctx = normalizeStatusKey(today?.day_status || today?.day_context);
  if (ctx === 'holiday') {
    const name = today?.holiday_name || today?.day_status_label;
    return name
      ? `Today is a holiday — ${name}. You can still clock in if you're working.`
      : 'Today is a holiday. You can still clock in if you’re working.';
  }
  if (ctx === 'weekly_off' || ctx === 'weekoff' || ctx === 'week_off') return 'Today is your weekly off.';
  if (ctx === 'on_leave' || ctx === 'leave') return 'You’re on leave today.';
  if (shift?.start_time) return `Your shift starts at ${fmtClockTime(shift.start_time, '')}.`.replace(' .', '.');
  return null;
}

/* Best-effort office name for the geofence line. Never returns an id — an
   unmatched id yields "" and geofenceNotice drops the name clause (T-H8). */
function resolveOfficeName(contract, geofence) {
  const id = geofence?.matched_location_id;
  if (!id || !contract) return '';
  const pools = [contract.locations, contract.offices, contract.field_locations, contract.assignments];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    const hit = pool.find((p) => (p?.id ?? p?.location_id) === id);
    if (hit) return hit.name || hit.location_name || '';
  }
  return '';
}

export function PunchCard({ today, shift, contract, refresh }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { workedMinutes, onBreak, isClockedIn, breaksKnown } = useLiveWorked(today);

  const state = punchState(today, isClockedIn);
  const busyState = useState(null); // which action is in flight, e.g. 'in' | 'out' | 'break'
  const [busy, setBusy] = busyState;
  const [failure, setFailure] = useState(null);

  // Work mode — only a hybrid contract gets the choice.
  const showWorkMode = choosesWorkMode(contract?.work_mode);
  const modeOptions = useMemo(
    () => permittedWorkModes(contract?.work_mode).map((m) => ({ value: m, label: WORK_MODE_LABEL[m] || m })),
    [contract?.work_mode],
  );
  const [workMode, setWorkMode] = useState(() => normalizeWorkMode(contract?.work_mode));

  // Remember the last hybrid choice across launches, validated on read.
  useEffect(() => {
    if (!showWorkMode) return;
    let alive = true;
    AsyncStorage.getItem(WORK_MODE_KEY)
      .then((saved) => {
        if (alive && saved && WORK_MODE_VALUES.includes(saved)
          && permittedWorkModes(contract?.work_mode).includes(saved)) {
          setWorkMode(saved);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [showWorkMode, contract?.work_mode]);

  const onChangeWorkMode = useCallback((m) => {
    setWorkMode(m);
    AsyncStorage.setItem(WORK_MODE_KEY, m).catch(() => {});
  }, []);

  // The one place a geofence line is drawn — and only when there's something
  // worth saying (geofenceNotice returns null for an unevaluated check).
  const notice = useMemo(
    () => geofenceNotice(today?.geofence, resolveOfficeName(contract, today?.geofence)),
    [today?.geofence, contract],
  );

  const ringProgress = useMemo(() => {
    const len = shiftMinutes(shift);
    return len ? workedMinutes / len : 0;
  }, [shift, workedMinutes]);

  /* ── The shared punch runner ────────────────────────────────────────────────
     Every button funnels through this so the four cross-cutting rules live in
     one place: state-reconciliation is silent, the error is mapped (never raw),
     and every success refreshes and emits. */
  const run = useCallback(async (key, fn, onOk) => {
    if (busy) return;
    setBusy(key);
    setFailure(null);
    try {
      await fn();
      await refresh();
      emitAttendanceChanged(ATTENDANCE_EVENTS.PUNCH);
      onOk?.();
    } catch (err) {
      // "You're already clocked in/out" — our view was stale, not a failure.
      if (isStateReconciliation(err)) {
        await refresh();
        return;
      }
      setFailure(attendanceErrorMessage(err, 'That didn’t go through. Please try again.'));
    } finally {
      setBusy(null);
    }
  }, [busy, refresh, setBusy]);

  const clockIn = useCallback(() => run('in', async () => {
    // Location is best-effort and NEVER blocks the punch (§6). A non-GRANTED
    // status still sends, without coordinates; the server flags it.
    const fix = await getPunchLocation({ prompt: true });
    if (fix?.status && fix.status !== GEO_STATUS.GRANTED) {
      const msg = locationMessage(fix.status);
      if (msg) showToast(msg);
    }
    const payload = {
      source: 'mobile',
      client_timestamp: new Date().toISOString(),
      ...(showWorkMode ? { work_mode: workMode } : null),
      ...locationPayload(fix),
    };
    await attendanceAPI.clockIn(payload);
  }, () => {
    const at = fmtClockTime(today?.clock_in_time, '');
    showToast(at ? `Clocked in at ${at}.` : 'Clocked in.');
  }), [run, showWorkMode, workMode, showToast, today?.clock_in_time]);

  const clockOut = useCallback(async () => {
    // Confirm FIRST, and AWAIT it — an unawaited confirm fires the API before
    // the person answers (§6).
    const worked = fmtClockMinutes(workedMinutes, { short: true }, '');
    const ok = await confirm({
      title: 'Clock out now?',
      message: worked ? `You've worked ${worked} today.` : undefined,
      confirmText: 'Clock out',
    });
    if (!ok) return;
    run('out', async () => {
      const fix = await getPunchLocation({ prompt: true });
      await attendanceAPI.clockOut({
        source: 'mobile',
        client_timestamp: new Date().toISOString(),
        ...locationPayload(fix),
      });
    }, () => showToast('Clocked out.'));
  }, [confirm, run, workedMinutes, showToast]);

  const startBreak = useCallback(
    () => run('break', () => attendanceAPI.breakStart({ source: 'mobile' }), () => showToast('Break started.')),
    [run, showToast],
  );
  const endBreak = useCallback(
    () => run('break', () => attendanceAPI.breakEnd({ source: 'mobile' }), () => showToast('Welcome back.')),
    [run, showToast],
  );

  /* ── The centre of the ring ───────────────────────────────────────────────── */
  const bigTime = state === 'working'
    ? (fmtClockMinutes(workedMinutes, { short: true }, '0m'))
    : state === 'done'
      ? (fmtClockMinutes(workedMinutes, { short: true }, '0m'))
      : null;

  const caption = state === 'working'
    ? (onBreak ? 'On a break' : `Working since ${fmtClockTime(today?.clock_in_time, '')}`.trim())
    : state === 'done'
      ? 'Day complete'
      : 'Not clocked in yet';

  const overlay = state === 'idle' ? idleOverlay(today, shift) : null;

  return (
    <Card>
      <View style={{ alignItems: 'center', gap: space[3] }}>
        <ProgressRing progress={ringProgress} size={112} stroke={9}>
          <View style={{ alignItems: 'center' }}>
            <Text style={[text.metric, { fontSize: 24, lineHeight: 28, fontVariant: ['tabular-nums'] }]}>
              {bigTime || '—'}
            </Text>
          </View>
        </ProgressRing>

        <Text style={[text.small, { color: color.textSecondary, textAlign: 'center' }]}>
          {caption}
        </Text>

        <StatusBadge
          kind="record"
          status={state === 'working' ? (onBreak ? 'on_break' : 'present') : state === 'done' ? 'completed' : 'absent'}
        />
      </View>

      {/* The shift window on idle, so the empty ring has a frame of reference. */}
      {state === 'idle' && shift?.start_time ? (
        <Text style={[text.caption, { textAlign: 'center', color: color.textMuted, marginTop: space[2] }]}>
          {`Shift ${fmtClockTime(shift.start_time, '')} – ${fmtClockTime(shift.end_time, '')}`}
        </Text>
      ) : null}

      {overlay ? (
        <InlineAlert tone="indigo" style={{ marginTop: space[4] }}>{overlay}</InlineAlert>
      ) : null}

      {/* Work mode — hybrid contracts only. */}
      {showWorkMode && state !== 'done' ? (
        <View style={{ marginTop: space[4], gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={text.label}>Worked from</Text>
            <FieldHelp surface="attendance.punch" field="work_mode" />
          </View>
          <Select
            title="Worked from"
            options={modeOptions}
            value={workMode}
            onChange={onChangeWorkMode}
          />
        </View>
      ) : null}

      {/* The geofence line — with its ⓘ, and only when the notice shows. */}
      {notice ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2], marginTop: space[4] }}>
          <View style={{ flex: 1 }}>
            <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
          </View>
          <View style={{ marginTop: space[2] }}>
            <FieldHelp surface="attendance.punch" field="geofence" />
          </View>
        </View>
      ) : null}

      {failure ? (
        <InlineAlert tone="rose" style={{ marginTop: space[4] }}>{failure}</InlineAlert>
      ) : null}

      {/* ── The buttons ──────────────────────────────────────────────────────── */}
      <View style={{ marginTop: space[5] }}>
        {state === 'idle' ? (
          <Button
            title="Clock in"
            onPress={clockIn}
            loading={busy === 'in'}
            disabled={!!busy}
            fullWidth
            size="lg"
            icon={icons.punch}
          />
        ) : null}

        {state === 'working' ? (
          <View style={{ gap: space[3] }}>
            <Button
              title="Clock out"
              onPress={clockOut}
              loading={busy === 'out'}
              disabled={!!busy}
              fullWidth
              size="lg"
              variant="danger"
            />
            <ButtonRow>
              {/* End Break shows only while a break is open; when breaks are
                  unknown we show BOTH rather than guess (T-H4). */}
              {(onBreak || !breaksKnown) ? (
                <Button
                  title="End break"
                  onPress={endBreak}
                  loading={busy === 'break'}
                  disabled={!!busy}
                  variant="breakEnd"
                />
              ) : null}
              {(!onBreak || !breaksKnown) ? (
                <Button
                  title="Start break"
                  onPress={startBreak}
                  loading={busy === 'break'}
                  disabled={!!busy}
                  variant="breakStart"
                />
              ) : null}
            </ButtonRow>
          </View>
        ) : null}

        {state === 'done' ? (
          <Text style={[text.caption, { textAlign: 'center', color: color.textSecondary }]}>
            {'You’re clocked out for the day. Tap any day below to see the details.'}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

export default PunchCard;
