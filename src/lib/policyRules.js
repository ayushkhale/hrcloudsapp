// ─────────────────────────────────────────────────────────────────────────────
// lib/policyRules.js — The one place the attendance policy is read.
//
// PORTED FROM THE WEB, 2026-10-23: `HR Clouds\src\shared\attendance\
// policyRules.js`. Same names, same signatures, same wording — CLAUDE.md §10.
// Before this file existed, My Schedules hand-rolled its own `policyMeta()`
// with its own labels ("Grace", "Auto clock-out") and read `data.policy`
// alone, so the rules card said different words to the web's and vanished
// whenever the server nested the policy under `shift`. Change one side →
// change both in the same sitting, and say so in both headers.
//
// WHAT THIS IS FOR. HR has always been able to set grace periods, half/full-day
// thresholds, break limits and a correction window, but nobody the rules land
// on could see them: an employee learned the grace period by being marked late
// and the correction window by a 400. This module turns the policy into the few
// plain sentences My Schedules, the correction form and the day inspector all
// say (web ref docs, md_updates/2026-10-21_shift_and_attendance_policy_
// visibility_frontend_guide.md).
//
// WHY ONE MODULE. Eight screens reading `policy.full_day_min_hours` and doing
// their own × 60 is how eight disagreeing copies of a day-count formatter
// happened once (§10). Every threshold is converted here, once.
//
// CONTRACT TRAPS
//  · THE POLICY IS OPTIONAL AND USUALLY ABSENT. `GET /attendance/shift` ships
//    `{ assignment, shift, rotation, weekly_offs }` and only gained `policy`
//    with the 2026-10-21 enrichment. Every helper here answers null for a
//    missing policy and every caller hides its control on null — a missing
//    backend feature degrades to a hidden control, never a crash (§6).
//  · IT ARRIVES IN THREE DIFFERENT PLACES, which is what `policyOf` is for:
//    `policy_snapshot` on a historical day, `policy` beside the shift, or
//    `shift.policy` nested inside it. NativeRef documents the nested one; the
//    live wrapper has sent the sibling. Reading one spelling is how the card
//    disappeared.
//  · THRESHOLDS ARE HOURS, NOT MINUTES. The schema is `half_day_min_hours` /
//    `full_day_min_hours`, decimal hours, often as STRINGS ("8.00") off
//    numeric columns. `NativeRef/10-api/03-payload-shapes.md` documented them
//    as `*_threshold_minutes` and the web's punch card believed it, so its
//    progress ring read `undefined` and never drew its arc. Both spellings are
//    accepted below — whichever the live payload sends, the figure appears
//    (§9: the live API beats the spec).
//  · A POLICY WITH NO SHIFT IS NORMAL. With no assignment, or a shift whose
//    `policy_id` is null, the backend falls back to the org default policy
//    (`is_default: true`). So "no shift assigned" still has rules, and the
//    shift-dependent lines (grace, arrival) are the only ones that drop out.
//  · HISTORICAL DAYS CARRY THEIR OWN COPY. `policy_snapshot` is frozen onto
//    `attendance_records` at evaluation time so a later policy edit cannot
//    rewrite history. `policyOf()` prefers the snapshot for exactly that
//    reason: a day inspector must show the rules that ACTUALLY applied.
// ─────────────────────────────────────────────────────────────────────────────

import { TERMS } from '../config/dictionary';
import { addDaysYMD, clockMinutes, fmtClockMinutes, fmtMinutes, todayYMD } from './dates';

const REGULARIZATION = TERMS.REGULARIZATION;

/** A number the server actually sent — "8.00" counts, null/""/NaN don't. */
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * The policy in force for whatever you have: a `/attendance/shift` wrapper, a
 * daily log, an attendance record, an agenda day, or a bare policy.
 *
 * `policy_snapshot` wins — on a day that has one, it IS the rule set that was
 * applied, and today's policy may already differ.
 */
export function policyOf(source) {
  if (!source || typeof source !== 'object') return null;
  return source.policy_snapshot || source.policy || source.shift?.policy || null;
}

/**
 * The shift in force, from the same spread of shapes. `shift_snapshot` wins for
 * the same reason `policy_snapshot` does.
 */
export function shiftOf(source) {
  if (!source || typeof source !== 'object') return null;
  if (source.shift_snapshot) return source.shift_snapshot;
  if (source.shift) return source.shift;
  // A bare shift template, not a wrapper around one.
  return source.start_time || source.end_time ? source : null;
}

/**
 * Minutes of work a full day needs, or null when the policy doesn't say.
 * Accepts the spec's decimal hours and the minutes spelling NativeRef used.
 */
export const fullDayMinutes = (policy) => {
  const hours = num(policy?.full_day_min_hours);
  if (hours !== null) return Math.round(hours * 60);
  return num(policy?.full_day_threshold_minutes);
};

/** Minutes of work a half day needs, or null. Same two spellings. */
export const halfDayMinutes = (policy) => {
  const hours = num(policy?.half_day_min_hours);
  if (hours !== null) return Math.round(hours * 60);
  return num(policy?.half_day_threshold_minutes);
};

/** Grace allowance in minutes, or null when the policy sets none. 0 is a real answer. */
export const graceMinutes = (policy) => num(policy?.grace_minutes);

/**
 * Wall-clock minutes from midnight by which a clock-in avoids a late mark, or
 * null without both a shift start and a grace figure. May exceed 1440 on a
 * shift that starts late enough — the formatters wrap it.
 */
export function graceEndsAt(shift, policy) {
  const start = clockMinutes(shift?.start_time);
  const grace = graceMinutes(policy);
  if (start === null || grace === null) return null;
  return start + grace;
}

/**
 * How much of the day's break allowance is left, or null when the policy caps
 * neither the count nor the duration (then there is nothing to show).
 *
 * `used` is already totalled by the caller — this does not re-derive it,
 * because the live open-break clock lives in lib/liveHours.js and two answers
 * to "how long have I been on break" is one too many.
 *
 * @param {object|null} policy
 * @param {{ count?: number, minutes?: number }} used
 */
export function breakBudget(policy, used = {}) {
  const countMax = num(policy?.max_breaks_per_day);
  const minutesMax = num(policy?.max_break_duration_minutes);
  if (countMax === null && minutesMax === null) return null;
  const countUsed = Math.max(0, num(used.count) ?? 0);
  const minutesUsed = Math.max(0, num(used.minutes) ?? 0);
  return {
    countUsed,
    countMax,
    minutesUsed,
    minutesMax,
    minutesLeft: minutesMax === null ? null : Math.max(0, minutesMax - minutesUsed),
    // Over EITHER cap. Never used to disable a control — the server decides
    // whether a break is allowed, and a greyed-out button can't say why.
    overCount: countMax !== null && countUsed >= countMax,
    overDuration: minutesMax !== null && minutesUsed >= minutesMax,
  };
}

/**
 * The window a correction request may reach back into.
 *
 * `allowed: false` means the feature is OFF for this person and the action must
 * be ABSENT, not disabled (§6 — never show a button that 403s). `days: null`
 * with `allowed: true` means the policy sets no limit, so only "must be in the
 * past" applies.
 *
 * `minDate`/`maxDate` are the date picker's own bounds, so it can't offer a day
 * the server will refuse (web §11 — the form checks before it calls).
 */
export function correctionWindow(policy, today = todayYMD()) {
  const allowed = policy ? policy.regularization_allowed !== false : true;
  const days = num(policy?.regularization_window_days);
  return {
    allowed,
    days,
    maxDate: addDaysYMD(today, -1),
    minDate: days === null ? '' : addDaysYMD(today, -days),
  };
}

/**
 * Why a date is outside the correction window, as ONE string reused as the
 * field error, the hint and the blocking message. Null when the date is fine or
 * there is nothing to check it against.
 */
export function correctionDateProblem(ymd, policy, today = todayYMD()) {
  const { allowed, days, minDate } = correctionWindow(policy, today);
  if (!allowed) return CORRECTIONS_OFF;
  if (!ymd || days === null) return null;
  return ymd < minDate
    ? `${REGULARIZATION}s only go back ${days} ${days === 1 ? 'day' : 'days'}. Pick a later date, or ask HR to correct this day for you.`
    : null;
}

/** Said in full wherever corrections are switched off — the one wording. */
export const CORRECTIONS_OFF = `Your attendance policy doesn’t allow ${REGULARIZATION.toLowerCase()}s. Ask HR to correct a day for you.`;

/**
 * The rules that apply to this person, as sentences they can act on.
 *
 * Each entry is `{ key, label, value, note }` — `key` is the policy's own API
 * key so field help can be wired by key rather than by label, `value` is the
 * figure, `note` is the consequence. The consequence, not the mechanism:
 * "Clock in by 9:45 am and you won’t be marked late", never "15-minute grace
 * period applies" (§5).
 *
 * Returns [] with no policy, which is what hides the whole panel.
 */
export function ruleLines(shift, policy, { viewer = 'self' } = {}) {
  if (!policy) return [];
  const them = viewer === 'self';
  const lines = [];

  const grace = graceMinutes(policy);
  if (grace !== null) {
    const cutoff = graceEndsAt(shift, policy);
    lines.push({
      key: 'grace_minutes',
      label: 'Arriving late',
      value: grace === 0 ? 'No grace time' : fmtMinutes(grace),
      note: grace === 0
        ? them ? 'Clocking in after your shift starts is recorded as late.' : 'Clocking in after the shift starts is recorded as late.'
        : cutoff !== null
          ? them ? `Clock in by ${fmtClockMinutes(cutoff)} and you won’t be marked late.` : `A clock-in by ${fmtClockMinutes(cutoff)} isn’t marked late.`
          : them ? 'You won’t be marked late inside this much time after your shift starts.' : 'No late mark inside this much time after the shift starts.',
    });
  }

  const full = fullDayMinutes(policy);
  const half = halfDayMinutes(policy);
  if (full !== null || half !== null) {
    lines.push({
      key: 'full_day_min_hours',
      label: 'Hours that count as a day',
      value: [half !== null && `${fmtMinutes(half)} half`, full !== null && `${fmtMinutes(full)} full`].filter(Boolean).join(' · '),
      note: them
        ? 'Time worked with breaks taken off. Below the half-day figure the day doesn’t count as attendance.'
        : 'Time worked with breaks taken off, against which the day is graded.',
    });
  }

  const budget = breakBudget(policy);
  if (budget) {
    lines.push({
      key: 'max_break_duration_minutes',
      label: 'Breaks',
      value: [
        budget.countMax !== null && `${budget.countMax} ${budget.countMax === 1 ? 'break' : 'breaks'}`,
        budget.minutesMax !== null && fmtMinutes(budget.minutesMax),
      ].filter(Boolean).join(' · '),
      note: budget.minutesMax !== null
        ? them ? 'The most you can take in a day. Break time doesn’t count towards your hours worked.' : 'The daily cap. Break time doesn’t count towards hours worked.'
        : them ? 'The most breaks you can take in a day.' : 'The daily cap on break count.',
    });
  }

  const { allowed, days } = correctionWindow(policy);
  lines.push({
    key: 'regularization_window_days',
    label: `${REGULARIZATION}s`,
    value: !allowed ? 'Not available' : days === null ? 'No time limit' : `${days} ${days === 1 ? 'day' : 'days'} back`,
    note: !allowed
      ? them ? 'Ask HR to fix a day you couldn’t clock in or out for.' : 'Corrections are switched off, so HR edits the day directly.'
      : days === null
        ? them ? 'Ask for a missed punch to be fixed on any past day. Your manager reviews it.' : 'Any past day can be sent for review.'
        : them ? `Ask for a missed punch to be fixed within ${days} ${days === 1 ? 'day' : 'days'}. After that only HR can change the day.` : `A request must arrive within ${days} ${days === 1 ? 'day' : 'days'} of the day itself.`,
  });

  if (policy.overtime_enabled !== undefined || policy.overtime_min_minutes !== undefined) {
    const min = num(policy.overtime_min_minutes);
    lines.push({
      key: 'overtime_enabled',
      label: 'Overtime',
      value: policy.overtime_enabled === false ? 'Not tracked' : min !== null ? `Past ${fmtMinutes(min)} extra` : 'Tracked',
      note: policy.overtime_enabled === false
        ? them ? 'Extra hours aren’t recorded as overtime under this policy.' : 'This policy doesn’t record extra hours as overtime.'
        : policy.overtime_requires_approval === false
          ? them ? 'Counted automatically once you pass this much extra time.' : 'Counted automatically past this much extra time.'
          : them ? 'Counted once you pass this much extra time, after your manager approves it.' : 'Needs manager approval before it counts.',
    });
  }

  const autoOut = num(policy.auto_clock_out_after_hours);
  if (policy.auto_clock_out_enabled && autoOut !== null) {
    lines.push({
      key: 'auto_clock_out_enabled',
      label: 'Forgotten clock-out',
      value: `After ${fmtMinutes(autoOut * 60)}`,
      note: them
        ? 'If you never clock out, the day is closed for you at this point — so clock out to keep your real hours.'
        : 'An open day is closed automatically at this point.',
    });
  }

  return lines;
}

/** Day names for `weekly_offs[].days_of_week`, which is 0 = Sunday. */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * `weekly_offs` → the days off, as names, de-duplicated across overlapping
 * rules and in week order. An empty list means no rest day is configured,
 * which reads as "none set" rather than "works every day" — we don't know that.
 */
export function weeklyOffNames(weeklyOffs) {
  const days = new Set();
  (Array.isArray(weeklyOffs) ? weeklyOffs : []).forEach((rule) => {
    (Array.isArray(rule?.days_of_week) ? rule.days_of_week : []).forEach((d) => {
      const i = Number(d);
      if (Number.isInteger(i) && i >= 0 && i <= 6) days.add(i);
    });
  });
  return [...days].sort((a, b) => a - b).map((i) => WEEKDAY_NAMES[i]);
}
