// ─────────────────────────────────────────────────────────────────────────────
// features/schedules/scheduleMeta.js — how a schedule day and a due item read.
//
// Contract: GET /attendance/schedule/agenda — web ref docs, md_updates/
// 2026-10-22_frontend_my_schedule_forward_view_integration_guide.md (and the
// delivery note beside it). Everything here RENDERS the server's answer; none
// of it resolves anything. The rules that matter, from the guide:
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
// Words: "Earned Leave", never comp-off (config/dictionary.js TERMS.COMP_OFF).
// ─────────────────────────────────────────────────────────────────────────────

import { TERMS } from '../../config/dictionary';
import { addDaysYMD, fmtClockMinutes, fmtClockTime, fmtDateShort, parseYMDLocal } from '../../lib/dates';
import { icons } from '../../theme/icons';

/** The server refuses more than this (SCHEDULE_RANGE_TOO_LARGE). */
export const MAX_AGENDA_DAYS = 92;

/** The window picker — the requirements doc's 7 / 30 / 90, all under the cap. */
export const AGENDA_WINDOWS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

/** `from`/`to` for a window that starts today. Inclusive, so N days is N-1 on. */
export function windowRange(today, days) {
  const n = Math.min(Math.max(1, days), MAX_AGENDA_DAYS);
  return { from: today, to: addDaysYMD(today, n - 1) };
}

/* ─── A day ───────────────────────────────────────────────────────────────── */

/** "09:30:00"–"18:30:00" → "9:30 am – 6:30 pm", "+1" on an overnight shift. */
export function shiftWindow(shift) {
  if (!shift?.start_time || !shift?.end_time) return null;
  const span = `${fmtClockTime(shift.start_time, '')} – ${fmtClockTime(shift.end_time, '')}`;
  return shift.is_overnight ? `${span} (+1)` : span;
}

const PORTION = { first_half: 'first half', second_half: 'second half', full: 'full day' };
export const portionLabel = (p) => PORTION[p] || 'half day';

/** "6 Nov – 10 Nov" for the leave request a day belongs to, or null. */
function leaveSpan(leave) {
  const a = leave?.request_start_date;
  const b = leave?.request_end_date;
  if (!a) return null;
  if (!b || a === b) return null;
  const short = (ymd) => fmtDateShort(ymd, '').replace(/^\w+, /, '');
  return `${short(a)} – ${short(b)}`;
}

/* One table from `day_kind` to presentation (guide Pattern B). `tone` keys
   are the house tone names; they all render as purple steps (CLAUDE.md §5),
   with slate for the days nothing is owed. */
const DAY_KIND = {
  working: {
    icon: icons.clock,
    tone: 'emerald',
    badge: 'Working',
    title: (d) => d.shift?.name || 'Working day',
  },
  half_day_leave: {
    icon: icons.leave,
    tone: 'blue',
    badge: '½ day leave',
    title: (d) => `½ day · ${d.leave?.leave_type_name || 'Leave'}`,
  },
  leave: {
    icon: icons.leave,
    tone: 'purple',
    badge: 'On leave',
    title: (d) => d.leave?.leave_type_name || 'On leave',
  },
  holiday: {
    icon: icons.holiday,
    tone: 'indigo',
    badge: 'Holiday',
    title: (d) => d.holiday?.name || 'Non-working day',
  },
  weekly_off: {
    icon: icons.calendar,
    tone: 'slate',
    badge: 'Day off',
    title: () => 'Weekly off',
  },
  unassigned: {
    icon: icons.calendar,
    tone: 'slate',
    badge: 'No shift',
    title: (d) => (d.status_reason === 'before_joining' ? 'Before you join' : 'No shift assigned'),
  },
};

/**
 * Everything a day card shows, worked out once.
 * @returns {{ icon, tone, badge, title, subtitle, meta: {label, value}[], off: boolean }}
 */
export function presentDay(day) {
  const kind = DAY_KIND[day?.day_kind] || DAY_KIND.unassigned;
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
    subtitle = leaveSpan(day.leave);
  }
  if (day?.day_kind === 'holiday' && day.holiday) {
    subtitle = day.holiday.is_optional || day.holiday.type === 'optional' ? 'Optional holiday' : null;
  }

  return {
    icon: kind.icon,
    tone: kind.tone,
    badge: kind.badge,
    title: kind.title(day || {}),
    subtitle,
    meta,
    off: ['weekly_off', 'holiday', 'leave'].includes(day?.day_kind),
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

/* ─── Items falling due ───────────────────────────────────────────────────── */

/** Which lane an item kind belongs to — for reading `lanes[...]`. */
export const LANE_OF = {
  task_due: 'tasks',
  document_request_due: 'documents',
  document_expiry: 'documents',
  comp_off_expiry: 'comp_offs',
  shift_change: 'shift_changes',
};

/** The item lanes, in the order their notices read. */
export const ITEM_LANES = [
  { key: 'tasks', label: 'tasks' },
  { key: 'documents', label: 'documents' },
  { key: 'comp_offs', label: TERMS.COMP_OFF.toLowerCase() },
  { key: 'shift_changes', label: 'shift changes' },
];

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

/**
 * How one item reads.
 * @returns {{ icon, tone, title, when, route: string|null, overdue: boolean }}
 *   `route` is a routes.js key the row opens, or null for nothing to open.
 */
export function presentItem(item) {
  switch (item?.kind) {
    case 'task_due':
      return {
        icon: icons.clipboardCheck,
        tone: item.is_overdue ? 'rose' : 'purple',
        title: item.title || 'A task',
        when: item.is_overdue ? `Overdue · was due ${dueTime(item.due_at)}` : `Due ${dueTime(item.due_at)}`,
        route: 'myTasks',
        overdue: !!item.is_overdue,
      };
    case 'document_request_due':
      return {
        icon: icons.clipboard,
        tone: 'blue',
        title: `Upload ${item.document_type_name || 'a document'}`,
        when: 'Requested by HR',
        route: 'documentRequests',
        overdue: false,
      };
    case 'document_expiry':
      return {
        icon: icons.document,
        tone: 'amber',
        title: `${item.document_name || item.document_type_name || 'A document'} expires`,
        when: 'Renew or replace it',
        route: 'documents',
        overdue: false,
      };
    case 'comp_off_expiry':
      return {
        icon: icons.earnedLeave,
        tone: 'amber',
        title: `${TERMS.COMP_OFF} expires`,
        when: item.earned_on ? `Earned ${fmtDateShort(item.earned_on, '')}` : 'Use it before it lapses',
        route: 'earnedLeave',
        overdue: false,
      };
    case 'shift_change':
      return {
        icon: icons.switch || icons.clock,
        tone: 'indigo',
        title: item.is_rotation
          ? `Moves to rotation: ${item.shift_name || 'a new pattern'}`
          : `Moves to shift: ${item.shift_name || 'a new shift'}`,
        when: 'Your shift changes',
        route: null,
        overdue: false,
      };
    default:
      return { icon: icons.info, tone: 'slate', title: 'Something due', when: '', route: null, overdue: false };
  }
}

/* ─── The summary ─────────────────────────────────────────────────────────── */

/** 20.5 → "20½", 3 → "3". Working and leave days are fractional (§4.2). */
export function dayFigure(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  const whole = Math.floor(v);
  return v - whole >= 0.5 ? `${whole || ''}½` : String(whole);
}

/* ─── Weekly offs, for My rules ───────────────────────────────────────────── */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `weekly_offs[].days_of_week` (0 = Sunday) → "Saturday & Sunday". */
export function weeklyOffLabel(weeklyOffs) {
  const set = new Set();
  (Array.isArray(weeklyOffs) ? weeklyOffs : []).forEach((w) => {
    (Array.isArray(w?.days_of_week) ? w.days_of_week : []).forEach((d) => set.add(Number(d)));
  });
  // Monday-first, the way a week is read.
  const days = [...set].filter((d) => d >= 0 && d <= 6).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (!days.length) return null;
  if (days.length <= 2) return days.map((d) => DAY_NAMES[d]).join(' & ');
  return days.map((d) => DAY_SHORT[d]).join(', ');
}
