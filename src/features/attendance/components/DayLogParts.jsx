// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/DayLogParts.jsx — one day, in full: the data
// hook (useDayLog) and the body (DayLogBody) that DayLogScreen lays out.
//
// Spec: NativeRef/40-screens/02-home-and-punch.md § DayLog. Opened from Home
// (tapping a bar on My month) and from My Time (tapping a day). ONE file, so
// the day looks identical from both.
//
// ── A SCREEN NOW, NOT A SHEET (user, 2026-10-21) ────────────────────────────
//
// "single attendance on graph is unscrollable, make it a separate screen cause
// its big data". A worked day is a hero, three tiles, a timeline and a table —
// more than a 75% sheet holds — and it was the sheet people could not scroll.
// It is the DayLog route now (screens/DayLogScreen.jsx) with a date card on
// top whose chevrons step a day back or forward. Was DayLogSheet.jsx.
//
// ── AND RESTYLED, SAME DAY, ON THE USER'S REFERENCE ─────────────────────────
//
// The ring hero, the three fact tiles and the counted-as table described
// below are GONE (history kept so nobody rebuilds them). Now: a tinted person
// card (photo, name, job title, status, hours worked, break), a white
// timeline card whose pills say the one thing about each moment (on time /
// late, a break's length, overtime), and a white "Total summary" strip — at
// work, break, effective, status. Purple shades only, per CLAUDE.md §5.
//
// ── REDESIGNED 2026-10-17 · IT WAS A WEB TABLE IN A SHEET ────────────────────
//
// The first version was a mechanical port of the web DailyLogModal: three
// label/value stats, then a two-column TABLE of punches, then another table of
// breaks, then a four-cell grid. On a desktop that is a record inspector; on a
// 360pt phone it is a spreadsheet in a drawer, and it read as one.
//
// What replaced it, and why each piece:
//
//   1. A HERO that answers the question in one glance. A worked day gets the
//      ring — hours worked against the hours expected — with the in and out
//      times beneath it. A day nobody worked (a Sunday, a holiday, leave, an
//      absence) gets the SAME block with the reason in it instead, which is
//      the whole point: the old sheet said "Nothing was recorded on this day"
//      to somebody looking at their own weekly off.
//   2. THREE FACT TILES — break, lateness, overtime. One number each.
//   3. A TIMELINE instead of two tables. Clock in → break → back → clock out,
//      in the order they happened, which is how a day is actually remembered.
//      Breaks and punches were two tables because the API returns two arrays,
//      not because anybody reads them that way.
//   4. The counted-as block, as divided rows rather than a grid of cells.
//
// ── NEVER A DASH (§8) ────────────────────────────────────────────────────────
//
// An unmeasured break is 0m, an unknown work mode is N/A, a punch that never
// happened is pending. Punch times may arrive as wall-clock "HH:mm" or as an
// ISO instant depending on the endpoint, so ONE accessor reads both (`timeOf`
// / `timeAt`) rather than each call site guessing.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { unwrap } from '../../../lib/normalize';
import {
  clockMinutes, fmtClockMinutes, fmtMinutes, todayYMD,
} from '../../../lib/dates';
import { humanize } from '../../../lib/enums';
import { dayChip, statusReasonNote } from '../../../lib/dayStatus';
import { color, palette, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { Avatar, ErrorState, SheetFooterNote, StatusBadge } from '../../../ui';

/* ─── Reading the payload ─────────────────────────────────────────────────────
   The daily-log shape is not pinned in NativeRef/10-api, so each value is read
   from the handful of spellings the gateway uses elsewhere. Absence stays
   absence — never 0, never a dash. */

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const first = (obj, ...keys) => keys.map((k) => obj?.[k]).find((v) => v !== undefined && v !== null) ?? null;
const hoursToMins = (v) => (num(v) != null ? Math.round(num(v) * 60) : null);

/* FLOORED AT ZERO, and absence is still absence.

   The server works out worked time as the span between the punches less the
   breaks, and it does not clamp: a break logged as longer than the gap
   between clock-in and clock-out comes back NEGATIVE. That is how this sheet
   once said "-13m WORKED" over a day somebody actually attended.

   Time worked cannot read below zero, so a negative figure is shown as 0m --
   the same floor PunchCard's ring applies to the live number. `null` is left
   alone: "no figure" and "no time" are different answers. */
const rawWorkedMins = (d) => num(first(d, 'worked_minutes', 'effective_minutes'))
  ?? hoursToMins(first(d, 'worked_hours', 'effective_hours'));
const workedMins = (d) => {
  const mins = rawWorkedMins(d);
  return mins === null ? null : Math.max(0, mins);
};
const breakMins = (d) => num(first(d, 'break_minutes', 'break_duration_minutes', 'total_break_minutes')) ?? 0;
const lateMins = (d) => num(first(d, 'late_minutes', 'late_by_minutes'));
const otMins = (d) => num(first(d, 'overtime_minutes')) ?? hoursToMins(first(d, 'overtime_hours'));
const expectedMins = (d) => num(first(d, 'expected_minutes', 'shift_minutes'))
  ?? hoursToMins(first(d, 'expected_hours', 'shift_hours'));

const punchesOf = (d) => (Array.isArray(d?.punches) ? d.punches : Array.isArray(d?.sessions) ? d.sessions : []);
const breaksOf = (d) => (Array.isArray(d?.breaks) ? d.breaks : []);
const whereOf = (p) => p?.location_name || p?.office_name || (p?.work_mode ? humanize(p.work_mode) : '') || null;

/**
 * Minutes since midnight for a punch time, whichever way it arrived — a
 * wall-clock "09:14" / "09:14:00" from the schedule side, or a full ISO
 * instant from the punch side. ONE accessor, because a sheet that reads a
 * clock-in one way and a break another drifts the moment either changes.
 */
function timeOf(value) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{1,2}:\d{2}/.test(s)) return clockMinutes(s);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
}

const timeAt = (value, fallback = null) => {
  const m = timeOf(value);
  return m === null ? fallback : fmtClockMinutes(m);
};

/* What a day with no record MEANS — one sentence each, so the sheet never
   falls back to "nothing was recorded" for a Sunday. A `status_reason` from
   the backend wins over this; this is the floor. */
const REASON_COPY = {
  weekly_off: 'A non-working day on your schedule, so nothing was due.',
  holiday: 'A company holiday. Nothing was due from you.',
  on_leave: 'You were on approved leave.',
  absent: 'Nothing was recorded, and the day is counted against you.',
  upcoming: 'A working day still to come — nothing is owed yet.',
  no_data: 'No punches, leave or holiday — there’s nothing to show here.',
};

/** The face for a day nobody was due to work, or did not. */
function ReasonHero({ chip, note }) {
  const t = toneOf(chip.tone);
  const Icon = chip.key === 'weekly_off' || chip.key === 'holiday' ? icons.calendar
    : chip.key === 'on_leave' ? icons.earnedLeave
    : chip.key === 'upcoming' ? icons.clock
    : icons.warn;

  return (
    <View style={{ alignItems: 'center', gap: space[3] }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: radius.full,
          backgroundColor: t.bg,
          borderWidth: 1,
          borderColor: t.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Icon ? <Icon size={30} color={t.fg} /> : null}
      </View>
      <Text style={[text.h2, { textAlign: 'center' }]}>{chip.label}</Text>
      <Text style={[text.small, { textAlign: 'center' }]}>{note}</Text>
    </View>
  );
}


/* ORDERED BY STRUCTURE, NOT ONLY BY CLOCK (user, 2026-10-21: "clock in should
   be first, then breaks in the middle, then clock out"). Sorting every event
   by its minute put a break above the clock-in whenever the two arrived in
   different shapes — a punch as an ISO instant, a break as a wall-clock
   "HH:mm" — or a shift crossed midnight. A session reads in → its breaks →
   out, always; only the breaks are sorted by time among themselves. Each
   break belongs to the latest session that began before it (the first
   session when it can't be placed). */
function buildTimeline(day) {
  let sessions = punchesOf(day).map((p) => ({
    in: first(p, 'clock_in_time', 'in_time', 'start_time', 'punch_in'),
    out: first(p, 'clock_out_time', 'out_time', 'end_time', 'punch_out'),
    where: whereOf(p),
  }));
  // No punch array but the day carries its own in/out: one session.
  if (!sessions.length && (first(day, 'clock_in_time', 'first_in', 'in_time') || first(day, 'clock_out_time', 'last_out', 'out_time'))) {
    sessions = [{
      in: first(day, 'clock_in_time', 'first_in', 'in_time'),
      out: first(day, 'clock_out_time', 'last_out', 'out_time'),
      where: day?.work_mode ? humanize(day.work_mode) : null,
    }];
  }
  sessions = sessions
    .map((x, i) => ({ ...x, i, inMins: timeOf(x.in) }))
    .sort((a, b) => (a.inMins ?? Infinity) - (b.inMins ?? Infinity));

  const breaks = breaksOf(day).map((b, i) => {
    const startAt = first(b, 'start_time', 'break_start', 'started_at');
    const mins = num(first(b, 'duration_minutes', 'minutes'));
    return { i, startAt, endAt: first(b, 'end_time', 'break_end', 'ended_at'), mins, startMins: timeOf(startAt) };
  }).sort((a, b) => (a.startMins ?? Infinity) - (b.startMins ?? Infinity));

  const breaksFor = sessions.map(() => []);
  breaks.forEach((b) => {
    let owner = 0;
    sessions.forEach((x, n) => { if (x.inMins != null && b.startMins != null && x.inMins <= b.startMins) owner = n; });
    if (breaksFor[owner]) breaksFor[owner].push(b);
  });

  const events = [];
  const push = (e) => events.push({ ...e, mins: timeOf(e.at) });
  sessions.forEach((x, n) => {
    push({ key: `in-${x.i}`, kind: 'in', at: x.in, meta: x.where });
    breaksFor[n].forEach((b) => {
      push({ key: `bs-${b.i}`, kind: 'break_start', at: b.startAt, meta: null });
      push({ key: `be-${b.i}`, kind: 'break_end', at: b.endAt, meta: b.mins != null ? fmtMinutes(b.mins) : null });
    });
    push({ key: `out-${x.i}`, kind: 'out', at: x.out, meta: x.where });
  });
  // Breaks with no session at all (no punches came back) still show.
  if (!sessions.length) {
    breaks.forEach((b) => {
      push({ key: `bs-${b.i}`, kind: 'break_start', at: b.startAt, meta: null });
      push({ key: `be-${b.i}`, kind: 'break_end', at: b.endAt, meta: b.mins != null ? fmtMinutes(b.mins) : null });
    });
  }
  return events;
}


/** The quiet ⓘ panel the reference design closes every screen with. */
function NotePanel({ children }) {
  const Info = icons.info;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space[2],
        backgroundColor: color.brandSoftBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.brandSoftBorder,
        padding: space[3],
      }}
    >
      {Info ? <Info size={16} color={palette.purple[500]} /> : null}
      <Text style={[text.small, { flex: 1, color: color.brandSoftFg }]}>{children}</Text>
    </View>
  );
}


/* ─── Reading one day ─────────────────────────────────────────────────────── */

/**
 * One day's log. Stale responses are dropped (a fast tap through the date
 * chevrons fires several reads; only the last date's may land). The old day
 * stays on screen while the next loads — `loading && !day` is the skeleton.
 */
export function useDayLog(date) {
  const [state, setState] = useState({ loading: true, error: null, day: null, date: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    attendanceAPI.getDailyLog(date)
      .then((res) => { if (!cancelled) setState({ loading: false, error: null, day: unwrap(res) || null, date }); })
      .catch((error) => { if (!cancelled) setState({ loading: false, error, day: null, date }); });
    return () => { cancelled = true; };
  }, [date, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // Only a day read FOR this date counts; the previous date's is a placeholder.
  const current = state.date === date;
  return {
    loading: state.loading,
    error: current ? state.error : null,
    day: current ? state.day : null,
    ready: current && !state.loading,
    reload,
  };
}


/* ─── The look (2026-10-21, on the user's reference "Attendance Time Logs") ───
   Three blocks and nothing nested: a tinted PERSON card (who, the day's
   status, worked and break), a white TIMELINE card, a white SUMMARY strip.
   The reference's green/amber/blue/red rail is purple shades here — the app is
   purple-only (CLAUDE.md §5), and the rail's job is order, not meaning. */

const EVENT_STYLE = {
  in: { label: 'Clocked in', icon: icons.clockIn, dot: palette.purple[600] },
  break_start: { label: 'Break started', icon: icons.pause, dot: palette.purple[300] },
  break_end: { label: 'Back from break', icon: icons.play, dot: palette.purple[400] },
  out: { label: 'Clocked out', icon: icons.clockOut, dot: palette.purple[800] },
};

const cardStyle = {
  backgroundColor: color.surface,
  borderRadius: radius.xl,
  borderWidth: 1,
  borderColor: color.borderSubtle,
};

function Pill({ children, muted = false }) {
  return (
    <View
      style={{
        paddingHorizontal: space[3],
        paddingVertical: 4,
        borderRadius: radius.full,
        backgroundColor: muted ? color.surfaceSubtle : color.brandChipBg,
      }}
    >
      <Text style={[text.smallStrong, { fontSize: 11, color: muted ? color.textMuted : color.brandChipFg }]}>
        {children}
      </Text>
    </View>
  );
}

/** A white round chip with a purple glyph, over a label and a number. */
function Figure({ icon: Icon, label, value }) {
  return (
    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.full, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }}>
        {Icon ? <Icon size={19} color={color.brand} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[text.caption, { color: color.textSecondary }]}>{label}</Text>
        <Text numberOfLines={1} style={[text.h2, { color: color.ink, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      </View>
    </View>
  );
}

function PersonCard({ person, status, worked, breakM }) {
  const name = person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(' ') || 'You';
  const role = person?.designation || person?.job_title || person?.title || '';
  return (
    <View
      style={{
        backgroundColor: color.brandSoftBg,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.brandSoftBorder,
        padding: space[4],
        gap: space[4],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Avatar person={person} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[text.h2, { color: color.ink }]}>{name}</Text>
          {role ? <Text numberOfLines={1} style={text.small}>{role}</Text> : null}
        </View>
        {status ? <StatusBadge kind="record" status={status} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <Figure icon={icons.clock} label="Hours worked" value={fmtMinutes(worked, '0m')} />
        <Figure icon={icons.pause} label="Break time" value={fmtMinutes(breakM, '0m')} />
      </View>
    </View>
  );
}

function TimelineCard({ events, late, overtime }) {
  const firstIn = events.findIndex((e) => e.kind === 'in' && e.mins !== null);
  let lastOut = -1;
  events.forEach((e, i) => { if (e.kind === 'out' && e.mins !== null) lastOut = i; });

  return (
    <View style={[cardStyle, { paddingHorizontal: space[4], paddingVertical: space[4] }]}>
      {events.map((e, i) => {
        const s = EVENT_STYLE[e.kind];
        const Icon = s.icon;
        const pending = e.mins === null;
        const last = i === events.length - 1;

        // The pill says the one thing worth knowing about THIS moment.
        let pill = null;
        if (pending) pill = <Pill muted>Pending</Pill>;
        else if (i === firstIn && late !== null) pill = <Pill>{late > 0 ? `Late ${fmtMinutes(late)}` : 'On time'}</Pill>;
        else if (e.kind === 'break_end' && e.meta) pill = <Pill>{e.meta}</Pill>;
        else if (i === lastOut && overtime > 0) pill = <Pill>{`+${fmtMinutes(overtime)} overtime`}</Pill>;

        return (
          <View key={e.key} style={{ flexDirection: 'row', gap: space[3] }}>
            {/* The rail: a dot per moment, joined by a line that stops at the last. */}
            <View style={{ width: 10, alignItems: 'center', paddingTop: 15 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pending ? color.border : s.dot }} />
              {!last ? <View style={{ flex: 1, width: 2, marginTop: 2, backgroundColor: color.borderSubtle }} /> : null}
            </View>

            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingBottom: last ? 0 : space[5] }}>
              <View style={{ width: 40, height: 40, borderRadius: radius.full, backgroundColor: pending ? color.surfaceSubtle : color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
                {Icon ? <Icon size={18} color={pending ? color.textMuted : color.brandChipFg} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text numberOfLines={1} style={text.bodyStrong}>{s.label}</Text>
                <Text style={[text.bodyStrong, { color: pending ? color.textMuted : color.ink, fontVariant: ['tabular-nums'] }]}>
                  {pending ? 'Not yet' : fmtClockMinutes(e.mins)}
                </Text>
                {e.meta && e.kind !== 'break_end' ? <Text numberOfLines={1} style={text.caption}>{e.meta}</Text> : null}
              </View>
              {pill}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* A 2 × 2 GRID, not four columns (2026-10-21, "fix layout"). Four columns on
   a 360pt phone left each cell ~70pt: labels shrank, "Half day" clipped and
   the dividers crowded the icons. Two per row, each a tinted tile with the
   icon chip beside its label and the number big underneath. */
function SummaryCell({ icon: Icon, label, value, strong = false }) {
  return (
    <View
      style={{
        width: '48.5%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[3],
        borderRadius: radius.lg,
        backgroundColor: color.brandSoftBg,
      }}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.full, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
        {Icon ? <Icon size={18} color={color.brandChipFg} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[text.caption, { color: color.textSecondary }]}>{label}</Text>
        <Text numberOfLines={1} style={[text.bodyStrong, { color: strong ? color.brand : color.ink, fontVariant: ['tabular-nums'] }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function SummaryCard({ span, breakM, worked, status }) {
  return (
    <View style={[cardStyle, { padding: space[4], gap: space[3] }]}>
      <Text style={[text.h3, { color: color.ink }]}>Total summary</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[2] }}>
        <SummaryCell icon={icons.clock} label="At work" value={fmtMinutes(span, 'N/A')} />
        <SummaryCell icon={icons.pause} label="Break" value={fmtMinutes(breakM, '0m')} />
        <SummaryCell icon={icons.report || icons.document} label="Effective" value={fmtMinutes(worked, '0m')} />
        <SummaryCell icon={icons.check} label="Status" value={status ? humanize(status) : 'N/A'} strong />
      </View>
    </View>
  );
}

/* ─── The body ────────────────────────────────────────────────────────────── */

/**
 * Everything about one loaded day, below the date row.
 * @param {object} props.person  whose day — the signed-in user, for the card
 */
export function DayLogBody({ date, day, error, onRetry, person }) {
  const events = useMemo(() => (day ? buildTimeline(day) : []), [day]);
  const worked = workedMins(day);
  const breakM = breakMins(day);
  // A record with an id (or any punch / figure) is a day somebody worked.
  const hasRecord = !!day && (day.id != null || events.length > 0 || worked != null);

  const chip = dayChip({ ...(day || {}), date }, todayYMD());
  const reasonNote = statusReasonNote(day);
  const freeText = day?.status_note || day?.remarks || day?.note || null;

  // Time AT work — first in to last out — beside time effectively worked.
  // An overnight shift wraps past midnight, hence the +1440.
  const inAt = timeOf(first(day, 'clock_in_time', 'first_in', 'in_time'));
  const outAt = timeOf(first(day, 'clock_out_time', 'last_out', 'out_time'));
  const span = inAt != null && outAt != null
    ? (outAt >= inAt ? outAt - inAt : outAt + 1440 - inAt)
    : worked != null ? worked + breakM : null;

  if (error) {
    return <ErrorState error={error} domain="attendance" onRetry={onRetry} fallback="We couldn’t load this day." />;
  }

  return (
    <View style={{ gap: space[4] }}>
      <PersonCard person={person} status={day?.status || null} worked={worked} breakM={breakM} />

      {hasRecord ? (
        <>
          {events.length ? <TimelineCard events={events} late={lateMins(day)} overtime={otMins(day) || 0} /> : null}
          <SummaryCard span={span} breakM={breakM} worked={worked} status={day?.status} />
        </>
      ) : (
        <View style={[cardStyle, { paddingHorizontal: space[4], paddingVertical: space[5] }]}>
          <ReasonHero chip={chip} note={reasonNote || REASON_COPY[chip.key] || REASON_COPY.no_data} />
        </View>
      )}

      {freeText ? (
        <NotePanel>{freeText}</NotePanel>
      ) : hasRecord && reasonNote ? (
        <NotePanel>{reasonNote}</NotePanel>
      ) : null}

      <SheetFooterNote>
        {hasRecord
          ? 'Something wrong with this day? Request a correction from My Time.'
          : 'Nothing here to correct — a day off needs no attendance.'}
      </SheetFooterNote>
    </View>
  );
}
