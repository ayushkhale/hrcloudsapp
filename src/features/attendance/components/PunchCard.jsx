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
//
// ── IT IS A FLAT SECTION, NOT A CARD, AND NOT THE PURPLE HERO ────────────────
//
// It was a brand gradient (Home opened on a slab of purple no other screen in
// either product has), then a white card with a border and a shadow. It is now
// neither: a plain section on the screen's own white, because Home is three
// stacked sections and three bordered, shadowed boxes on a grey wash is three
// frames around content that needed none. Dropping the box also drops its
// padding, so this content now aligns to the SCREEN gutter rather than sitting
// 32pt in from the edge.
//
// Two consequences to remember:
//   • The buttons use their ORDINARY variants. `onHero` / `onHeroGhost`
//     (white-on-purple) are for a dark surface and must not come back here —
//     on white they are an invisible button.
//   • There is NO chevron to the attendance screen on this card any more. It
//     sat inside the ring's row looking like part of the ring. The Time tab is
//     one tap away in the bar at the bottom of the screen.
//
// ── PROSE BECAME TILES ───────────────────────────────────────────────────────
//
// "Clocked in at 01:31 am." is a sentence somebody has to read. `CLOCKED IN /
// 01:31 am` in a soft tile is a thing they can see. The state line, the
// day-complete line and the break sentence are all gone; what they said is in
// the tiles beside the ring, which is also the only place those facts appear,
// so there is nothing left on this card saying the same thing twice.
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
import { fmtClockTime, fmtHours, fmtMinutes, fmtTime } from '../../../lib/dates';
import { color, palette, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, FieldHelp, InlineAlert, Pill, StatusBadge,
} from '../../../ui';
import { useToast, useConfirm } from '../../../ui';
import { haptic } from '../../../ui/haptics';
import { ProgressRing } from './ProgressRing';
import { WorkModePicker } from './WorkModePicker';
import { PunchPhotoCapture } from './PunchPhotoCapture';
import { useAuth } from '../../../state/AuthContext';
import { punchWithDeviceProof } from '../../devices/deviceKey';
// The tile every attendance fact takes, shared with the Time screen's lists.
import { Stat } from './StatTiles';

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

/* ── The shift, unwrapped ─────────────────────────────────────────────────────
   `/attendance/shift` answers a WRAPPER — { assignment, shift, rotation,
   weekly_offs } — not a bare shift (it says so in attendance.api.js). Reading
   `start_time` straight off it is always undefined, which silently cost this
   card BOTH the progress ring and the shift line. The web card unwraps it the
   same way and falls through to `/today`'s own copy when there is no
   assignment; a null result means "no shift", which is a valid state. */
function resolveShift(shiftData, today) {
  const wrapped = !!shiftData && typeof shiftData === 'object' && 'shift' in shiftData;
  const assigned = wrapped ? shiftData.shift : shiftData;
  return assigned || today?.shift || null;
}

/* The shift WINDOW: "9:00 am – 6:00 pm". Not its name — the window is what the
   ring is measured against, and at phone width "Morning Shift · 10:00 am – 0…"
   truncated away the only half that meant anything. */
function shiftWindow(shift) {
  if (!shift?.start_time || !shift?.end_time) return 'No shift assigned';
  return `${fmtClockTime(shift.start_time, '')} – ${fmtClockTime(shift.end_time, '')}`;
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

export function PunchCard({ today, shift: shiftData, contract, refresh }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { workedMinutes, breakMinutes, onBreak, isClockedIn, breaksKnown } = useLiveWorked(today);

  const shift = useMemo(() => resolveShift(shiftData, today), [shiftData, today]);
  const state = punchState(today, isClockedIn);
  const busyState = useState(null); // which action is in flight, e.g. 'in' | 'out' | 'break'
  const [busy, setBusy] = busyState;

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
     and every success refreshes and emits.

     ── A FAILED PUNCH IS A TOAST (2026-10-17) ──────────────────────────────

     It used to render an InlineAlert under the card. Two reasons it moved,
     and the second is the one that mattered:

       1. The card changed height when a punch failed, pushing the whole
          dashboard down under the thing somebody had just pressed.
       2. The success path was already a toast ("Clocked in at 9:04"), so a
          failure arriving somewhere else meant the answer to "did that
          work?" appeared in one of two places depending on the answer. Same
          question, same place (CLAUDE.md §3 — a failed WRITE is a toast).

     Device-trust rejections land here too, which is where the user saw the
     server's raw "a registered trusted device is required"; the copy for
     those now lives in lib/errors/attendanceErrors.js.

     ── A RECONCILIATION IS STILL AN ANSWER (2026-10-18) ────────────────────

     This used to `return` silently when the server said ALREADY_CLOCKED_IN /
     NOT_CLOCKED_IN / NO_ACTIVE_BREAK, on the reasoning that nothing had gone
     wrong — the card was just stale, and refreshing it was the whole fix.

     THAT IS NOT WHAT IT LOOKED LIKE. Somebody pressed Clock Out, answered a
     confirm, watched the spinner run, and got nothing: no toast, no error,
     and a card that quietly rearranged itself. "Clock out silently fails and
     doesn't even show the real error" is exactly right, and it is the worst
     outcome of the three, because a person who gets no answer presses again.

     Silence is only honest when NOTHING changed. Here the card changed under
     them, so it says so — as `info`, not `error`, because the mapped copy is
     "You weren't clocked in. Your status has been refreshed", which is news
     rather than a failure. The refresh happens FIRST, so the toast and the
     card tell the same story.

     ── THE PUNCH IS DONE BEFORE THE HOUSEKEEPING ──────────────────────────

     `fn()` alone decides whether the punch landed. The refresh, the event and
     the success toast all happen after, outside the try, so a problem in any
     of them can never be reported as a failed punch. */
  const run = useCallback(async (key, fn, onOk, failure) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      if (isStateReconciliation(err)) {
        await refresh();
        showToast(attendanceErrorMessage(err, 'Your status has been refreshed.'), 'info');
      } else {
        showToast(
          attendanceErrorMessage(err, failure || 'That didn’t go through. Please try again.'),
          'error',
        );
      }
      setBusy(null);
      return;
    }

    // It landed. Tell them first — the toast is the answer to the press, and
    // it must not wait on a second round trip. The punch is THE moment in
    // this app, so it is felt as well as read (ui/haptics.js); its toast is
    // an info one, which would otherwise stay silent.
    haptic('success');
    onOk?.();
    emitAttendanceChanged(ATTENDANCE_EVENTS.PUNCH);
    await refresh();
    setBusy(null);
  }, [busy, refresh, setBusy, showToast]);

  /* ── Clock in: locate → photo → punch (2026-10-18) ───────────────────────
     The location is taken FIRST so it can be printed on the photo, then the
     camera opens (PunchPhotoCapture), and the punch is sent only once the
     photo is accepted. Backing out of the camera abandons the clock-in.
     No camera on the phone does NOT stop anyone clocking in — it says so and
     sends the punch without a photo, the same rule as location (§6). */
  const { user } = useAuth();
  const userId = user?.id || null;
  const who = user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || null;
  const [photoStep, setPhotoStep] = useState(null); // { fix } while the camera is up

  /* THE PHOTO TRAVELS LIKE THE COORDINATES (user, 2026-10-18): top-level
     fields on the clock-in body, beside latitude/longitude — `photo` (a JPEG
     data URI) and `photo_captured_at` — plus a description in `metadata`.
     The backend does not read them YET; the gateway strips unknown keys, so
     until it does they are dropped and the punch is unaffected.

     If the server REFUSES the body because of them (413 too large, or a 400
     that names the photo) the punch is sent again without the photo — a
     picture must never be the reason somebody couldn't clock in. */
  const sendClockIn = useCallback((fix, photo) => run('in', async () => {
    const located = locationPayload(fix);
    const metadata = { ...(located.metadata || {}) };
    if (photo) {
      metadata.punch_photo = {
        captured_at: photo.captured_at,
        width: photo.width,
        height: photo.height,
        location_stamped: !!photo.stamp,
        // The place printed on the photo (OpenStreetMap), when one was found.
        ...(photo.stamp?.address ? { address: photo.stamp.address } : null),
        attached: !!photo.base64,
      };
    }
    const payload = {
      source: 'mobile',
      client_timestamp: new Date().toISOString(),
      ...(showWorkMode ? { work_mode: workMode } : null),
      ...located,
      ...(Object.keys(metadata).length ? { metadata } : null),
    };
    const withPhoto = photo?.base64
      ? { ...payload, photo: `data:image/jpeg;base64,${photo.base64}`, photo_captured_at: photo.captured_at }
      : payload;
    /* DEVICE TRUST (2026-10-21): every punch goes through punchWithDeviceProof,
       which signs it when the organisation asks and is a plain send when it
       doesn't. Each send gets its OWN call — the photo retry below must not
       reuse the first send's challenge, which the server has consumed. */
    try {
      await punchWithDeviceProof('clock_in', userId, withPhoto, attendanceAPI.clockIn);
    } catch (err) {
      const aboutPhoto = withPhoto !== payload && (
        err?.status === 413
        || (err?.status === 400 && /photo|payload|too large|entity/i.test(String(err?.data?.message || err?.message || '')))
      );
      if (!aboutPhoto) throw err;
      await punchWithDeviceProof('clock_in', userId, payload, attendanceAPI.clockIn);
      showToast('Your photo couldn’t be sent, so you were clocked in without it.');
    }
  }, () => {
    const at = fmtClockTime(today?.clock_in_time, '');
    showToast(at ? `Clocked in at ${at}.` : 'Clocked in.');
  }, 'We couldn’t clock you in. Please try again.'), [run, showWorkMode, workMode, showToast, today?.clock_in_time, userId]);

  const clockIn = useCallback(async () => {
    if (busy || photoStep) return;
    setBusy('in');
    // Location is best-effort and NEVER blocks the punch (§6).
    const fix = await getPunchLocation({ prompt: true });
    if (fix?.status && fix.status !== GEO_STATUS.GRANTED) {
      const msg = locationMessage(fix.status);
      if (msg) showToast(msg);
    }
    setBusy(null);
    setPhotoStep({ fix });
  }, [busy, photoStep, setBusy, showToast]);

  const photoDone = useCallback((photo) => {
    const fix = photoStep?.fix;
    setPhotoStep(null);
    sendClockIn(fix, photo);
  }, [photoStep, sendClockIn]);

  const photoUnavailable = useCallback((message) => {
    const fix = photoStep?.fix;
    setPhotoStep(null);
    showToast(`${message} Clocking you in without a photo.`);
    sendClockIn(fix, null);
  }, [photoStep, sendClockIn, showToast]);

  const clockOut = useCallback(async () => {
    // Confirm FIRST, and AWAIT it — an unawaited confirm fires the API before
    // the person answers (§6).
    // fmtMinutes — a DURATION. fmtClockMinutes reads minutes as a time of day,
    // so 384 worked minutes came out as '6 am' in this sentence.
    const worked = fmtMinutes(workedMinutes, '');
    const ok = await confirm({
      title: 'Clock out now?',
      message: worked ? `You've worked ${worked} today.` : undefined,
      confirmText: 'Clock out',
    });
    if (!ok) return;
    run('out', async () => {
      // The same best-effort location as clock-in, and the same notice when
      // it comes back without a fix. It was missing here, which is how a
      // clock-out that the geofence then rejected looked like a punch that
      // failed for no reason: the one piece of information that would have
      // explained it was never shown.
      const fix = await getPunchLocation({ prompt: true });
      if (fix?.status && fix.status !== GEO_STATUS.GRANTED) {
        const msg = locationMessage(fix.status);
        if (msg) showToast(msg);
      }
      await punchWithDeviceProof('clock_out', userId, {
        source: 'mobile',
        client_timestamp: new Date().toISOString(),
        ...locationPayload(fix),
      }, attendanceAPI.clockOut);
    }, () => showToast('Clocked out.'), 'We couldn’t clock you out. Please try again.');
  }, [confirm, run, workedMinutes, showToast, userId]);

  const startBreak = useCallback(
    () => run('break', () => punchWithDeviceProof('break_start', userId, { source: 'mobile' }, attendanceAPI.breakStart), () => showToast('Break started.'), 'We couldn’t start your break.'),
    [run, showToast, userId],
  );
  const endBreak = useCallback(
    () => run('break', () => punchWithDeviceProof('break_end', userId, { source: 'mobile' }, attendanceAPI.breakEnd), () => showToast('Welcome back.'), 'We couldn’t end your break.'),
    [run, showToast, userId],
  );


  /* ── What the face of the card says ────────────────────────────────────────
     Four facts and one ring. The ring holds the only number that MOVES; the
     facts sit beside it as tiles, because "Clocked in at 01:31 am." is a
     sentence a person has to read and `CLOCKED IN / 01:31 am` is a thing they
     can see. Everything that was prose here — the state line, the day-complete
     line, the break sentence — became a tile or went away. */
  const punchedAt = fmtTime(today?.clock_in_time || today?.clock_in || today?.first_in_time, '');
  const punchedOutAt = fmtTime(today?.clock_out_time || today?.clock_out || today?.last_out_time, '');

  // The number in the ring, and the word under it. fmtHours floors at zero —
  // breaks longer than the gap between the punches make the server's figure
  // negative, and time worked cannot read below 0m.
  const ringValue = state === 'working'
    ? fmtMinutes(workedMinutes, '0m')
    : state === 'done'
      ? fmtHours(today?.effective_hours, '0m')
      : '--';
  // A break does NOT get its own caption here: the badge above already says
  // "On break" and the ring turns fuchsia for it, so a third copy of the word
  // is the kind of repetition that makes a screen feel busy. The figure is
  // still worked time; it is simply frozen while the break runs.
  const ringCaption = state === 'working'
    ? (breaksKnown ? 'Worked' : 'Elapsed')
    : state === 'done' ? 'Effective' : 'Hours';

  const overlay = state === 'idle' ? idleOverlay(today, shift) : null;

  /* The ring reads as a share of the assigned shift, so it only means anything
     when there IS one. With no shift the track is drawn empty and the figure
     inside it stands on its own. */
  const hasShift = shiftMinutes(shift) != null;
  const Punch = icons.punch;

  // The second tile row. Break and overtime are facts about a day that is over
  // (or one with a break already taken); on a fresh morning they are two
  // zeroes taking up a row, so they aren't drawn.
  const showExtras = state === 'done' || breakMinutes > 0;

  // The two things a finished day can hold against you, as chips.
  const dayNotes = state === 'done' ? [
    Number(today?.late_minutes) > 0 && ['Late by', fmtMinutes(today.late_minutes)],
    Number(today?.early_exit_minutes) > 0 && ['Left early', fmtMinutes(today.early_exit_minutes)],
  ].filter(Boolean) : [];

  return (
    <View style={{ gap: space[4] }}>
      {/* ── The heading ──────────────────────────────────────────────────── */}
      <View style={{ gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
          <Text accessibilityRole="header" style={text.h2}>Today</Text>
          {/* An open break wears the fuchsia of `late` and the words "On
              break" — the web card's own treatment. A break is not a record
              status, so there is nothing in enums.js to name it. */}
          <StatusBadge
            kind="record"
            status={onBreak ? 'late' : (today?.status || 'not_marked')}
            label={onBreak ? 'On break' : undefined}
            dense
          />
        </View>
        {/* The shift WINDOW, not its name: the window is what the ring is
            measured against, and "Morning Shift · 10:00 am – 0…" truncated the
            half that meant something. */}
        <Text numberOfLines={1} style={[text.caption, { color: color.textSecondary }]}>
          {shiftWindow(shift)}
        </Text>
      </View>

      {/* ── The ring, and the facts beside it ────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <ProgressRing
          progress={hasShift ? ringProgress : 0}
          size={104}
          stroke={8}
          tint={onBreak ? palette.fuchsia[400] : color.brand}
          track={color.borderSubtle}
        >
          <View style={{ alignItems: 'center' }}>
            <Text numberOfLines={1} style={[text.metric, { fontSize: 18, lineHeight: 22 }]}>
              {ringValue}
            </Text>
            <Text style={[text.label, { fontSize: 9, letterSpacing: 0.6, color: color.textMuted, marginTop: 2 }]}>
              {ringCaption}
            </Text>
          </View>
        </ProgressRing>

        <View style={{ flex: 1, gap: space[2] }}>
          <Stat icon={icons.arrowRight} label="Clocked in" value={punchedAt || 'Not yet'} />
          <Stat icon={icons.logout} label="Clocked out" value={punchedOutAt || 'Not yet'} />
        </View>
      </View>

      {showExtras ? (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Stat icon={icons.clock} label="Break" value={fmtMinutes(today?.break_duration_minutes ?? breakMinutes, '0m')} />
          <Stat
            icon={icons.overtime}
            label="Overtime"
            value={fmtMinutes(today?.overtime_minutes, '0m')}
            accent={Number(today?.overtime_minutes) > 0}
          />
        </View>
      ) : null}

      {/* ── Notices ──────────────────────────────────────────────────────── */}
      {overlay ? <InlineAlert tone="indigo">{overlay}</InlineAlert> : null}

      {/* Tiles before the clock-in, one quiet line after it — work_mode is
          sent with the clock-in and nothing else (WorkModePicker's header). */}
      {showWorkMode && state !== 'done' ? (
        <WorkModePicker
          options={modeOptions}
          value={state !== 'idle' && today?.work_mode ? normalizeWorkMode(today.work_mode) : workMode}
          onChange={onChangeWorkMode}
          locked={state !== 'idle'}
        />
      ) : null}

      {notice ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
          </View>
          <View style={{ marginTop: space[2] }}>
            <FieldHelp surface="attendance.punch" field="geofence" />
          </View>
        </View>
      ) : null}

      {/* ── The actions ──────────────────────────────────────────────────────
          ONE two-button row from clock-in to clock-out: the left button walks
          the day forward (Clock In → Start break → End break) and Clock Out is
          there from the first render, disabled until there is an open day to
          close. The row never changes height when somebody punches, which is
          what stops the thing they are reaching for moving under their thumb. */}
      {state !== 'done' ? (
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <View style={{ flex: 1 }}>
            {state === 'idle' ? (
              <Button
                title="Clock In"
                onPress={clockIn}
                loading={busy === 'in'}
                disabled={!!busy}
                fullWidth
                size="lg"
                icon={Punch}
              />
            ) : onBreak ? (
              <Button
                title="End break"
                onPress={endBreak}
                loading={busy === 'break'}
                disabled={!!busy}
                fullWidth
                size="lg"
                variant="breakEnd"
              />
            ) : (
              <Button
                title="Start break"
                onPress={startBreak}
                loading={busy === 'break'}
                disabled={!!busy}
                fullWidth
                size="lg"
                variant="breakStart"
              />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Button
              title="Clock Out"
              onPress={clockOut}
              loading={busy === 'out'}
              // Disabled for the two things a press genuinely cannot fix from
              // here: there is no open day yet, or there is an open BREAK in
              // the way. Both say why — a dead button with no reason is the
              // bug Button's rule 2 exists to stop.
              disabled={!!busy || state === 'idle' || onBreak}
              disabledReason={
                state === 'idle'
                  ? 'Clock in first — then you can close the day here.'
                  : onBreak ? 'End your break first.' : undefined
              }
              fullWidth
              size="lg"
              variant="danger"
            />
          </View>
        </View>
      ) : null}

      {/* While breaks are UNKNOWN we must not guess which of the two is right
          (T-H4), so the other one is offered quietly underneath rather than
          hidden. It costs a row on the rare payload that omits breaks and
          nothing at all on the ones that don't. */}
      {state === 'working' && !breaksKnown ? (
        <Button
          title={onBreak ? 'Start break' : 'End break'}
          onPress={onBreak ? startBreak : endBreak}
          loading={busy === 'break'}
          disabled={!!busy}
          fullWidth
          variant="ghost"
        />
      ) : null}

      {/* The two things a finished day can hold against you. Absent unless they
          happened — a row of "0m" chips says nothing and looks like a report
          card. */}
      {dayNotes.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {dayNotes.map(([label, value]) => (
            <Pill key={label} variant="muted">{`${label} ${value}`}</Pill>
          ))}
        </View>
      ) : null}

      <PunchPhotoCapture
        visible={!!photoStep}
        fix={photoStep?.fix}
        who={who}
        onDone={photoDone}
        onCancel={() => setPhotoStep(null)}
        onUnavailable={photoUnavailable}
      />
    </View>
  );
}

export default PunchCard;
