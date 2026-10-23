// ─────────────────────────────────────────────────────────────────────────────
// features/schedules/scheduleMeta.js — how a schedule day and a due item read.
//
// THIS IS THE PORT OF THE WEB'S `src/shared/attendance/agendaMeta.js`
// (2026-10-23, CLAUDE.md §10). It was written independently first and drifted
// within a day: its own day labels, its own tones, its own item wording and a
// hand-rolled `dayFigure` where the web prints `formatDayCount` — the exact
// failure §10 is about, on the exact helper §10 names as the worked example.
// Names and signatures below are the web's. Change one side → change both in
// the same sitting. Native-only extras (`presentDay`, `presentItem`, `weeksOf`,
// `dayTitle`, `dueTime`, `itemDate`) wrap the shared answers for a 360pt card;
// they add presentation, never a second opinion about what a day IS.
//
// Contract: GET /attendance/schedule/agenda — web ref docs, md_updates/
// 2026-10-22_frontend_my_schedule_forward_view_integration_guide.md (v1) and
// 2026-10-22_my_schedule_enriched_agenda_and_policy_provenance_integration_
// guide.md (v2, which this file now reads). Everything here RENDERS the
// server's answer; none of it resolves anything. The rules that matter:
//
//   • SWITCH ON `day_kind`, NEVER RE-DERIVE IT (§4). Precedence — record,
//     joining date, calendar exception, holiday, weekly off, leave, shift — is
//     the server's, and it is the same code payroll runs. One table below maps
//     a kind to its look; a new kind is one line.
//   • A WEEKEND INSIDE A LEAVE SPAN IS `weekly_off` (§4.1). It was never
//     charged against the balance. Don't "correct" it to leave.
//   • `holiday` CAN BE NULL ON A `holiday` DAY (§4.3) — a calendar exception
//     has nothing to name. "Non-working day".
//   • `leave.leave_type_name` IS NULLABLE (§3.5). "On leave".
//   • `half_day_leave` CARRIES BOTH a shift and a leave (§4.2).
//   • `unassigned` IS NOT AN ERROR (§4.4) — neutral copy, two flavours.
//   • `awaiting_absent_cron` IS NEVER "Absent" (§3.5) — it is provisional.
//   • ONLY `task_due` HAS A TIME (§5.1). The other four kinds are dates; a
//     time on them would be an invented midnight.
//   • DATES ARE OPAQUE STRINGS (Pattern F). `YYYY-MM-DD` is a calendar date in
//     the response's timezone; it is split, never fed to `new Date()` as UTC.
//     `due_at` carries its own offset already converted to that timezone, so
//     its wall-clock hour is read straight off the string.
//
// V2 ADDED FOUR THINGS, all optional and all read here: `employee` (why these
// rules are yours), `weekly_off_policy` + `days[].weekly_off` (the rule's NAME
// and how it found you — the "nameless weekend"), `attendance_policy` (the
// same resolved policy `/attendance/shift` sends, so the rules survive either
// read failing) and rich `task_due` items. `matched_by` and `priority` are
// INTERNAL and never reach the screen (§4) — the provenance is said in words.
//
// Words: "Earned Leave", never comp-off (config/dictionary.js TERMS.COMP_OFF).
// ─────────────────────────────────────────────────────────────────────────────

import { TERMS } from '../../config/dictionary';
import { addDaysYMD, fmtClockMinutes, fmtClockTime, fmtDate, fmtDateShort, parseYMDLocal, todayYMD, ymdInZone } from '../../lib/dates';
import { formatDayCount } from '../../lib/format';
import { humanize } from '../../lib/enums';
import { icons } from '../../theme/icons';

/** The server refuses more than this (SCHEDULE_RANGE_TOO_LARGE). */
export const MAX_AGENDA_DAYS = 92;

/**
 * ONE WINDOW: the next seven days, today included (user decision, 2026-10-22
 * on the web, matched here 2026-10-23 — the 30- and 90-day options are gone).
 *
 * Why a week and not a month. Everything this screen is for is answered inside
 * one: the shift you are on, the day off coming, the deadline you have to plan
 * around. A 90-day agenda was a scroll nobody finished, and that is truer on a
 * phone than it ever was on a monitor. It also sits far enough under the
 * 92-day server cap that the cap can no longer be reached from the UI at all.
 */
export const AGENDA_WINDOW_DAYS = 7;

/** Kept as the hook default so no caller has to name the window. */
export const DEFAULT_AGENDA_DAYS = AGENDA_WINDOW_DAYS;

/** `from`/`to` for a window that starts today. Inclusive, so N days is N-1 on. */
export function agendaRange(days = DEFAULT_AGENDA_DAYS) {
  const span = Math.min(Math.max(Math.round(days) || 1, 1), MAX_AGENDA_DAYS);
  const from = todayYMD();
  return { from, to: addDaysYMD(from, span - 1) };
}

/** The same window from a date you already have. Native-only convenience. */
export function windowRange(today, days = DEFAULT_AGENDA_DAYS) {
  const span = Math.min(Math.max(Math.round(days) || 1, 1), MAX_AGENDA_DAYS);
  return { from: today, to: addDaysYMD(today, span - 1) };
}

/* ─── A day ───────────────────────────────────────────────────────────────── */

/**
 * One entry per `day_kind`. `tone` keys are the house tone names; they all
 * render as purple steps (§5).
 *  · `working` carries NO tone and NO badge: an ordinary working day is the
 *    baseline, and badging every one of them makes the exceptions invisible.
 */
export const DAY_KINDS = {
  working: { label: 'Working', tone: null },
  weekly_off: { label: 'Weekly off', tone: 'slate' },
  holiday: { label: 'Holiday', tone: 'purple' },
  leave: { label: 'On leave', tone: 'blue' },
  half_day_leave: { label: 'Half day', tone: 'amber' },
  unassigned: { label: 'No shift', tone: 'slate' },
};

/** True when the day is not worked at all — drives the muted card treatment. */
export const isDayOff = (day) => day?.day_kind === 'weekly_off' || day?.day_kind === 'holiday';

/** "09:30:00"–"18:30:00" → "9:30 am – 6:30 pm", the carry spelled out. */
export function shiftWindowLabel(shift) {
  if (!shift?.start_time || !shift?.end_time) return '';
  const window = `${fmtClockTime(shift.start_time, '')} – ${fmtClockTime(shift.end_time, '')}`;
  return shift.is_overnight ? `${window} (ends next day)` : window;
}

/** Hours only, for a meta strip: no carry note, so it fits a 360pt row. */
export function shiftHoursLabel(shift) {
  if (!shift?.start_time || !shift?.end_time) return '';
  return `${fmtClockTime(shift.start_time, '')} – ${fmtClockTime(shift.end_time, '')}`;
}

/** The app's strip wants the carry as "+1"; the words don't fit beside a date. */
export function shiftWindow(shift) {
  const hours = shiftHoursLabel(shift);
  if (!hours) return null;
  return shift.is_overnight ? `${hours} (+1)` : hours;
}

/**
 * What this day IS, in one phrase, switching on `day_kind` alone.
 * The `||` fallbacks are the two real nullable cases above, not defensiveness.
 */
export function dayHeadline(day) {
  if (!day) return 'N/A';
  switch (day.day_kind) {
    case 'working':
      return shiftWindowLabel(day.shift) || 'Working day';
    case 'weekly_off':
      return 'Weekly off';
    case 'holiday':
      // A calendar-exception day is non-working with no holiday to name.
      return day.holiday?.name || 'Non-working day';
    case 'leave':
      return day.leave?.leave_type_name || 'On leave';
    case 'half_day_leave':
      return `Half day · ${day.leave?.leave_type_name || 'leave'}`;
    case 'unassigned':
      return day.status_reason === 'before_joining' ? 'Before you joined' : 'No shift assigned';
    default:
      return 'N/A';
  }
}

/**
 * The short version for a day card, where the headline sits under a date and a
 * nine-word phrase would wrap three times. A working day shows its shift; the
 * rest show what the day is, named where the payload names it.
 */
export function dayCardLabel(day) {
  if (!day) return 'N/A';
  switch (day.day_kind) {
    case 'working':
      return day.shift?.name || 'Working';
    case 'weekly_off':
      // The rule NAME is provenance and belongs in My shift, not here — "Tech
      // & Product 5-Day Work Week" on a day card is a truncation.
      return day.weekly_off?.day_name ? `${day.weekly_off.day_name} off` : 'Weekly off';
    case 'holiday':
      return day.holiday?.name || 'Non-working day';
    case 'leave':
      return day.leave?.leave_type_name || 'On leave';
    case 'half_day_leave':
      return 'Half day';
    case 'unassigned':
      return day.status_reason === 'before_joining' ? 'Before you joined' : 'No shift';
    default:
      return 'N/A';
  }
}

/**
 * Why the day reads as it does, in words.
 *
 * `awaiting_absent_cron` is the one that must never say "Absent": the day is a
 * past working day the finalising job hasn't closed yet, and calling it an
 * absence would accuse somebody on the strength of a job that hasn't run.
 */
export const DAY_REASONS = {
  upcoming: 'Hasn’t happened yet — nothing is recorded against it.',
  pending_clock_in: 'You’re expected in today and haven’t clocked in yet.',
  awaiting_absent_cron: 'Still being finalised — how this day counts isn’t settled.',
  weekly_off: 'A rest day under your weekly-off rules.',
  holiday: 'A holiday that applies to you.',
  exception_non_working: 'Marked a non-working day for your organisation.',
  before_joining: 'Earlier than your joining date, so nothing applies.',
  record: 'Taken from the attendance already recorded for this day.',
};

export const dayReason = (day) => DAY_REASONS[day?.status_reason] || '';

/** `full` → "Whole day"; the halves name which half, which is what people ask. */
export const LEAVE_PORTIONS = {
  full: 'Whole day',
  first_half: 'First half of the day',
  second_half: 'Second half of the day',
};

/** The short form, for a meta strip beside a date. */
const PORTION_SHORT = { first_half: 'first half', second_half: 'second half', full: 'full day' };
export const portionLabel = (p) => PORTION_SHORT[p] || 'half day';

/** `assignment` needs no explaining; the other two do. */
export const SHIFT_SOURCES = {
  assignment: '',
  rotation: 'From your rotation — this is what the cycle lands on for this date, not a permanent move.',
  default: 'Your organisation’s default hours, as nothing more specific is set for you.',
};

/**
 * The leave span a day sits in, when it is longer than the day itself — so a
 * card can say the request it belongs to without a second request. Null when
 * the request is one day, or when the span dates didn't come back.
 */
export function leaveSpan(day) {
  const leave = day?.leave;
  if (!leave?.request_start_date || !leave?.request_end_date) return null;
  if (leave.request_start_date === leave.request_end_date) return null;
  return {
    from: leave.request_start_date,
    to: leave.request_end_date,
    label: `${fmtDate(leave.request_start_date, '')} – ${fmtDate(leave.request_end_date, '')}`,
    total: formatDayCount(leave.request_total_days, { fallback: '' }),
  };
}

/* The icon a kind wears on a card. Separate from DAY_KINDS because the web has
   no icons here — this is the native half, and keeping it apart means the
   shared table stays diffable against the web's. */
const DAY_ICONS = {
  working: icons.clock,
  weekly_off: icons.calendar,
  holiday: icons.holiday,
  leave: icons.leave,
  half_day_leave: icons.leave,
  unassigned: icons.calendar,
};

/**
 * Everything a day card shows, worked out once.
 * @returns {{ icon, tone, badge: string|null, title, subtitle, meta, off }}
 */
export function presentDay(day) {
  const kindKey = DAY_KINDS[day?.day_kind] ? day.day_kind : 'unassigned';
  const kind = DAY_KINDS[kindKey];
  const meta = [];
  let subtitle = null;

  if (day?.shift && (day.day_kind === 'working' || day.day_kind === 'half_day_leave')) {
    const window = shiftWindow(day.shift);
    if (window) meta.push({ label: 'Shift', value: window });
    // "Rotating", so a rotation's landing is never read as a permanent
    // assignment (guide §3.5, `source`).
    if (day.shift.source === 'rotation') meta.push({ label: 'Pattern', value: 'Rotating' });
  }
  if (day?.day_kind === 'half_day_leave' && day.leave) {
    meta.push({ label: 'Leave', value: portionLabel(day.leave.portion) });
  }
  if (day?.day_kind === 'leave') {
    subtitle = leaveSpan(day)?.label || null;
  }
  if (day?.day_kind === 'holiday' && day.holiday) {
    subtitle = day.holiday.is_optional || day.holiday.type === 'optional' ? 'Optional holiday' : null;
  }

  return {
    icon: DAY_ICONS[kindKey],
    // No tone of its own means the baseline card treatment — see DAY_KINDS.
    tone: kind.tone || 'slate',
    badge: kind.tone ? kind.label : null,
    title: dayCardLabel(day),
    subtitle,
    meta,
    off: isDayOff(day) || day?.day_kind === 'leave',
  };
}

/** "Today · Thu, 22 Oct" / "Tomorrow · Fri, 23 Oct" / "Sat, 24 Oct". */
export function dayTitle(ymd, today) {
  const label = fmtDateShort(ymd, 'That day');
  if (ymd === today) return `Today · ${label}`;
  if (ymd === addDaysYMD(today, 1)) return `Tomorrow · ${label}`;
  return label;
}

/* ─── Weeks ───────────────────────────────────────────────────────────────── */

/** The Monday on or before a date, as YYYY-MM-DD. */
function mondayOf(ymd) {
  const d = parseYMDLocal(ymd);
  if (!d) return ymd;
  const back = (d.getDay() + 6) % 7; // Mon → 0 … Sun → 6
  return addDaysYMD(ymd, -back);
}

/** `days[]` → SectionList sections, one per week, headed "This week" etc. */
export function weeksOf(days, today) {
  const thisWeek = mondayOf(today);
  const nextWeek = addDaysYMD(thisWeek, 7);
  const out = [];
  (days || []).forEach((day) => {
    const wk = mondayOf(day.date);
    let last = out[out.length - 1];
    if (!last || last.key !== wk) {
      const title = wk === thisWeek ? 'This week'
        : wk === nextWeek ? 'Next week'
        : `Week of ${fmtDateShort(wk, '').replace(/^\w+, /, '')}`;
      last = { key: wk, title, data: [] };
      out.push(last);
    }
    last.data.push(day);
  });
  return out;
}

/* ─── Why a day off is yours (v2 provenance) ──────────────────────────────── */

/**
 * How a weekly-off rule found this person, as the group it applies to.
 *
 * `matched_by` is the raw targeting enum and never reaches the screen (§4).
 * `matched_entity_name` is a real name ("Engineering") when the backend has
 * one, so each entry takes it and falls back to the group in general terms.
 *
 * @param {string} matchedBy department | location | shift | employment_type |
 *   user | org_default
 * @param {string|null} entity the named group, when the payload has one
 */
export function weeklyOffAudience(matchedBy, entity) {
  const named = entity && String(entity).trim() ? String(entity).trim() : '';
  switch (matchedBy) {
    case 'department':
      return named ? `Everyone in ${named} has these days off.` : 'Everyone in your department has these days off.';
    case 'location':
      return named ? `Everyone working at ${named} has these days off.` : 'Everyone at your workplace has these days off.';
    case 'shift':
      return named ? `Everyone on ${named} has these days off.` : 'Everyone on your shift has these days off.';
    case 'employment_type':
      return named ? `Everyone on ${named} terms has these days off.` : 'Everyone on your kind of contract has these days off.';
    case 'user':
      return 'Set for you specifically, rather than for a group you’re in.';
    case 'org_default':
      return 'Your organisation’s standard days off, as nothing more specific is set for you.';
    default:
      return '';
  }
}

/**
 * The weekly-off rule in plain words: what it is called and who it covers.
 * Takes either the top-level `weekly_off_policy` or a day's own `weekly_off` —
 * both carry `rule_name` and `matched_by`, and only the top-level one carries
 * `matched_entity_name`, which is why the entity may be passed separately.
 *
 * Null when there is no rule, which is what hides the provenance block: an
 * employee with no weekly-off rule has nothing to explain (§6 — absent key,
 * hidden feature).
 */
export function weeklyOffRule(rule, { entity } = {}) {
  if (!rule?.rule_name && !rule?.matched_by) return null;
  return {
    name: rule.rule_name || 'Your weekly days off',
    audience: weeklyOffAudience(rule.matched_by, entity ?? rule.matched_entity_name),
    // 0 = Sunday, same as `/attendance/shift`'s rules, so this feeds the
    // existing `weeklyOffNames` rather than being mapped to names again here.
    days: Array.isArray(rule.days_of_week) ? rule.days_of_week : null,
    from: rule.effective_from || '',
    to: rule.effective_to || '',
  };
}

/**
 * Who the person is, as the sentence that explains the targeting above.
 *
 * Every field is optional and an absent one simply drops out — a trimmed
 * profile must read as a shorter sentence, never as "null terms".
 * `employment_type` is an enum, so it goes through `humanize` rather than
 * printing `full_time` (§4). `location_id` is deliberately unused: there is no
 * name beside it, and an id is never shown.
 */
export function employeeTargeting(employee) {
  if (!employee) return '';
  const { designation, department, employment_type: type } = employee;
  // Each shape is built in full rather than joined from fragments: a missing
  // designation used to leave "set up as in Engineering".
  const role = designation && department
    ? `${designation} in ${department}`
    : designation || (department ? `part of ${department}` : '');
  const terms = type ? `on ${humanize(type).toLowerCase()} terms` : '';
  if (!role && !terms) return '';
  const who = role
    ? `You’re set up as ${role}${terms ? `, ${terms}` : ''}`
    : `You’re set up ${terms}`;
  return `${who} — that’s what decides which shift, days off and rules apply to you.`;
}

/* ─── Items falling due ───────────────────────────────────────────────────── */

/**
 * Which lane each item kind arrives in. Needed because a lane that FAILED must
 * not render as "nothing due" (guide §6) — the list has to know which lane to
 * blame for an empty result.
 */
export const ITEM_LANE = {
  task_due: 'tasks',
  document_request_due: 'documents',
  document_expiry: 'documents',
  comp_off_expiry: 'comp_offs',
  shift_change: 'shift_changes',
};

/** The optional lanes, in the order their absence should be reported. */
export const ITEM_LANES = ['tasks', 'documents', 'comp_offs', 'shift_changes'];

export const LANE_LABELS = {
  tasks: 'task deadlines',
  documents: 'document dates',
  comp_offs: `${TERMS.COMP_OFF.toLowerCase()} expiry`,
  shift_changes: 'shift changes',
};

/**
 * What the thing is, said as the consequence rather than the record type (§5).
 * `kind` is the discriminator — never infer a kind from which fields are set.
 */
export function itemHeadline(item) {
  if (!item) return 'N/A';
  switch (item.kind) {
    case 'task_due':
      return item.title || 'A task is due';
    case 'document_request_due':
      return `Upload your ${item.document_type_name || 'document'}`;
    case 'document_expiry':
      return `${item.document_name || item.document_type_name || 'A document'} runs out`;
    case 'comp_off_expiry':
      return 'A day off you earned runs out';
    case 'shift_change':
      return item.is_rotation
        ? `You move onto ${item.shift_name || 'a new rotation'}`
        : `You move onto ${item.shift_name || 'a new shift'}`;
    default:
      return 'N/A';
  }
}

/**
 * A second line, only where there is something worth adding.
 *
 * `task_due` says nothing here even though it now could: its brief, assigner
 * and extension history are a record of their own, and a task past its
 * deadline is already drawn in rose with the word on it.
 */
export function itemDetail(item) {
  switch (item?.kind) {
    case 'task_due':
      return '';
    case 'document_request_due':
      return 'HR asked you for this one.';
    case 'document_expiry':
      return 'Replace it before this date to stay on file.';
    case 'comp_off_expiry':
      return item.earned_on ? `Earned on ${fmtDate(item.earned_on, '')}. Use it or it lapses.` : 'Use it or it lapses.';
    case 'shift_change':
      return 'Your hours change from this date.';
    default:
      return '';
  }
}

/**
 * Tone for the row: rose only for something already late (§5).
 *
 * PRIORITY IS NOT A TONE. An urgent task is not an error, and rose is reserved
 * for errors, lateness and deductions.
 */
export const itemTone = (item) => (item?.kind === 'task_due' && item.is_overdue ? 'rose' : 'purple');

export const itemKey = (item, index) => `${item?.kind || 'item'}:${item?.id || index}`;

/** "2026-10-22T18:00:00+05:30" → "6:00 pm", read off the string (see header). */
export function dueTime(dueAt) {
  const m = /T(\d{2}):(\d{2})/.exec(String(dueAt || ''));
  return m ? fmtClockMinutes(Number(m[1]) * 60 + Number(m[2]), {}, '') : '';
}

/** The calendar date an item falls on, whichever field carries it. */
export function itemDate(item) {
  if (item?.kind === 'task_due') return String(item.due_at || '').slice(0, 10) || null;
  return item?.due_date || null;
}

/* The icon a kind wears. Native-only, for the same reason DAY_ICONS is. */
const ITEM_ICONS = {
  task_due: icons.clipboardCheck,
  document_request_due: icons.clipboard,
  document_expiry: icons.document,
  comp_off_expiry: icons.earnedLeave,
  shift_change: icons.switch || icons.clock,
};

/* Which routes.js key a row opens, or null for nothing to open. */
const ITEM_ROUTES = {
  task_due: 'myTasks',
  document_request_due: 'documentRequests',
  document_expiry: 'documents',
  comp_off_expiry: 'earnedLeave',
  shift_change: null,
};

/**
 * How one item reads on a card. The words are `itemHeadline`/`itemDetail`'s —
 * the web's — with the one thing a phone adds: a timed task says its time,
 * because the Due list shows no date column to read it from.
 * @returns {{ icon, tone, title, when, route: string|null, overdue: boolean }}
 */
export function presentItem(item) {
  const kind = item?.kind;
  const when = kind === 'task_due'
    ? (item.is_overdue ? `Overdue · was due ${dueTime(item.due_at)}` : `Due ${dueTime(item.due_at)}`)
    : itemDetail(item);
  return {
    icon: ITEM_ICONS[kind] || icons.info,
    tone: itemTone(item),
    title: itemHeadline(item),
    when: when.trim(),
    route: ITEM_ROUTES[kind] || null,
    overdue: !!(kind === 'task_due' && item.is_overdue),
  };
}

/**
 * A `/tasks/me` row reshaped into the agenda item this screen renders. Used
 * ONLY to recover the tasks lane when the server reports it `unavailable` —
 * that lane's source is an endpoint the employee may call directly, so one
 * extra read puts the real deadlines back on screen instead of an apology for
 * them (§6: gate on what the server returned).
 *
 * `date` is the day the deadline lands on IN THE SCHEDULE'S ZONE, not the
 * phone's, because it has to agree with the day headings above it. A row with
 * no deadline is dropped: it belongs to no day.
 */
export function agendaItemFromTaskRow(row, timezone) {
  if (!row?.id || !row.due_date) return null;
  return {
    kind: 'task_due',
    id: row.id,
    date: ymdInZone(row.due_date, timezone),
    due_at: row.due_date,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    priority: row.priority,
    is_overdue: row.is_overdue,
    original_due_date: row.original_due_date,
    extension_count: row.extension_count,
    rework_count: row.rework_count,
    is_viewed: row.is_viewed,
    external_links: row.external_links,
    assigner: row.assigned_by,
  };
}

/**
 * Every item in the window as one list, soonest first, each carrying the date
 * it belongs to. The server already orders items within a day (timed before
 * date-only) and `days[]` is ascending, so this preserves that order rather
 * than re-sorting — a re-sort on a formatted date string is how the "due 1 Nov
 * before 2 Oct" class of bug starts.
 */
export function flattenAgendaItems(days) {
  const out = [];
  (Array.isArray(days) ? days : []).forEach((day) => {
    (Array.isArray(day?.items) ? day.items : []).forEach((item) => {
      out.push({ ...item, date: day.date, day_kind: day.day_kind });
    });
  });
  return out;
}

/**
 * Agenda items with a separately-read lane folded back in, in the order the
 * server would have sent them. Merging on `date` rather than appending keeps
 * the Due list in step with the Agenda above it — a recovered deadline sinking
 * to the bottom of a list read chronologically is worse than the error it
 * replaced. Deduped on kind + id, so a lane that comes back while a recovery
 * is in flight cannot show the same deadline twice.
 */
export function mergeAgendaItems(items, recovered) {
  const base = Array.isArray(items) ? items : [];
  const extra = (Array.isArray(recovered) ? recovered : []).filter((item) => item?.date);
  if (extra.length === 0) return base;

  const seen = new Set(base.map((item) => itemKey(item)));
  const byDate = new Map();
  const push = (item) => {
    const date = item.date || '';
    byDate.set(date, [...(byDate.get(date) || []), item]);
  };
  base.forEach(push);
  extra.forEach((item) => { if (!seen.has(itemKey(item))) push(item); });

  return [...byDate.keys()].sort().flatMap((date) => byDate.get(date));
}

/* ─── Lanes ───────────────────────────────────────────────────────────────── */

/**
 * The state of the lanes feeding a list, reduced to the one that matters.
 * `unavailable` beats `truncated` beats `ok`; `excluded` only survives when
 * EVERY lane was excluded, because one excluded lane among loaded ones is not
 * a reason to hide the list.
 *
 * This is the field that stops the screen lying: a failed documents query with
 * an empty item list must never render as "nothing expires soon" — that is a
 * person missing a renewal because of a transient blip.
 */
export function worstLaneState(lanes, keys = ITEM_LANES) {
  const states = keys.map((key) => lanes?.[key]).filter(Boolean);
  if (states.length === 0) return 'ok';
  if (states.includes('unavailable')) return 'unavailable';
  if (states.includes('truncated')) return 'truncated';
  if (states.every((s) => s === 'excluded')) return 'excluded';
  return 'ok';
}

/** Which lanes failed, named for a message the reader can act on. */
export const failedLaneNames = (lanes, keys = ITEM_LANES) =>
  keys.filter((key) => lanes?.[key] === 'unavailable').map((key) => LANE_LABELS[key] || key);

/** Which lanes came back capped. Same shape, same words. */
export const cappedLaneNames = (lanes, keys = ITEM_LANES) =>
  keys.filter((key) => lanes?.[key] === 'truncated').map((key) => LANE_LABELS[key] || key);

export const LANE_TRUNCATED_NOTE =
  'There’s more than we can show at once, so this list may be missing a few.';

/* ─── The summary ─────────────────────────────────────────────────────────── */

/**
 * The headline figures, server-computed. Day counts print through
 * `formatDayCount` because half-day leave makes `working_days` and `leave_days`
 * fractional — `4.5` must read "4d and 1/2 d", never "4.5" and never "4½"
 * (§10: this is the helper the web and this app once disagreed on for five
 * days). The phrase carries its own unit, so no tile adds a "days" caption.
 *
 * `items_due` is a count of THINGS, not of days, so it stays a plain number.
 *
 * Weekly offs and holidays are added into one "off" figure: over a week the
 * difference is already visible on the day cards themselves, and two tiles
 * reading "2d" and "0d" said less than one reading "2d".
 */
export function summaryTiles(summary) {
  if (!summary) return [];
  const offs = (summary.weekly_offs || 0) + (summary.holidays || 0);
  return [
    { key: 'working_days', label: 'Working', value: formatDayCount(summary.working_days, { fallback: '0d' }) },
    { key: 'days_off', label: 'Off', value: formatDayCount(offs, { fallback: '0d' }) },
    { key: 'leave_days', label: 'On leave', value: formatDayCount(summary.leave_days, { fallback: '0d' }) },
    { key: 'items_due', label: 'Falling due', value: String(summary.items_due ?? 0) },
  ];
}

/* ─── Weekly offs, for My shift ───────────────────────────────────────────── */

/**
 * `/attendance/shift`'s `weekly_offs` in the shape `weeklyOffNames()` takes.
 *
 * TWO SHAPES ARE LIVE. The web reads `weekly_offs[].days_of_week` — a list of
 * RULES — and `NativeRef/10-api/03-payload-shapes.md` documents the same field
 * as a flat `[0, 6]` of day indices. Handed the flat form, the shared helper
 * finds no `days_of_week` on a number and answers `[]`, which renders as "No
 * weekly day off is set for you" on a person who has two.
 *
 * So the normalising happens HERE, at the call site, and `weeklyOffNames`
 * stays byte-identical to the web's (§10 rule 3: native-only additions are
 * extra, not divergence). If the web ever meets the flat form it needs the
 * same three lines — say so in both headers when it does.
 */
export function weeklyOffRules(weeklyOffs) {
  const list = Array.isArray(weeklyOffs) ? weeklyOffs : [];
  const bare = list.filter((entry) => Number.isInteger(Number(entry)) && entry !== null && typeof entry !== 'object');
  const rules = list.filter((entry) => entry && typeof entry === 'object');
  return bare.length ? [...rules, { days_of_week: bare.map(Number) }] : rules;
}

/* Mirrors the web's WEEKDAY_NAMES, which `weeklyOffNames` returns entries
   from, with the three-letter form a 360pt row has space for. Index is the
   payload's own: 0 = Sunday. */
const WEEK_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The seven chips of the days-off row: `{ key, short, off }`, Sunday first. */
export function weekdayOffRow(names) {
  const set = new Set(names || []);
  return DAY_SHORT.map((short, i) => ({ key: short, short, off: set.has(WEEK_NAMES[i]) }));
}

/**
 * The days off as one phrase for a card subtitle: "Saturday & Sunday", or
 * "Mon, Tue, Wed" past two. Reads Monday-first, the way a week is read, while
 * `weeklyOffNames` (the shared helper this takes its days from) stays
 * Sunday-first like the payload — presentation, not a second opinion.
 */
export function weeklyOffPhrase(names) {
  const list = (names || []).filter((n) => WEEK_NAMES.includes(n));
  if (!list.length) return null;
  const ordered = [...list].sort(
    (a, b) => ((WEEK_NAMES.indexOf(a) + 6) % 7) - ((WEEK_NAMES.indexOf(b) + 6) % 7),
  );
  if (ordered.length <= 2) return ordered.join(' & ');
  return ordered.map((n) => DAY_SHORT[WEEK_NAMES.indexOf(n)]).join(', ');
}
