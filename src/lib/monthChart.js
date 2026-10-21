// ─────────────────────────────────────────────────────────────────────────────
// lib/monthChart.js — what every "one bar per day of the month" chart shares.
//
// Ported from the web's shared/attendance/trendChartMeta.jsx, minus everything
// that was Recharts. The RULES are what matter and they are identical on both
// products, so the employee who opens the web dashboard and then the app sees
// the same month, split the same way:
//
//   • EVERY calendar day gets a slot, data or not (fillMonthDays). The graph
//     endpoint returns only the days it holds records for; drawing just those
//     made one month three fat bars and the next fifteen thin ones.
//   • A month reads in TWO halves, never four — a fortnight is a natural
//     reading unit, and two halves means a 31-day month doesn't end on a page
//     holding the 31st by itself.
//   • The current month OPENS on the half that holds today. Opening on the 1st
//     on the 28th shows two-week-old data first.
//
// The y-axis helper is the hours version of the web's `trendYAxis`: whole-hour
// ticks with headroom, so a long day never draws flush with the top gridline.
// ─────────────────────────────────────────────────────────────────────────────

import { monthRange, parseYMDLocal, todayYMD } from './dates';

/** A month reads in two halves. Not four — see the header. */
export const CHART_PAGES = 2;

// Below this the row set is a stub or an empty fixture, not a calendar month,
// and splitting it into halves of two bars helps nobody.
const MIN_PAGED_ROWS = 8;

const pageSize = (total) => Math.ceil(total / CHART_PAGES);

/** How many pages `rows` splits into: 1 or CHART_PAGES. */
export const chartPageCount = (rows) => (rows.length >= MIN_PAGED_ROWS ? CHART_PAGES : 1);

/** The rows of page `page` (0-based). */
export function chartPageRows(rows, page) {
  if (rows.length < MIN_PAGED_ROWS) return rows;
  const size = pageSize(rows.length);
  const start = Math.min(Math.max(page, 0), CHART_PAGES - 1) * size;
  return rows.slice(start, start + size);
}

/**
 * One row per calendar day of `period` ({ year, month }), in order. Days the
 * server returned keep their row; the rest come from `make(ymd)`.
 */
export function fillMonthDays(rows, period, make, key = 'date') {
  if (!period?.year || !period?.month) return rows;
  const byDay = new Map(rows.map((row) => [String(row[key] || '').slice(0, 10), row]));
  const { from, to } = monthRange(period.year, period.month);
  const prefix = from.slice(0, 8);
  const days = Number(to.slice(8, 10));
  return Array.from({ length: days }, (_, i) => {
    const ymd = `${prefix}${String(i + 1).padStart(2, '0')}`;
    return byDay.get(ymd) || make(ymd);
  });
}

/**
 * The page to open on: the half holding today for the current month, the first
 * half for any other.
 */
export function defaultChartPage(rows, period, key = 'date') {
  const today = todayYMD();
  const [year, month] = today.split('-').map(Number);
  if (period?.year !== year || period?.month !== month) return 0;
  // Calendar days only — a row dated "2026-09-29T00:00:00Z" IS today, but as a
  // string it sorts after "2026-09-29".
  let last = -1;
  rows.forEach((row, i) => {
    const day = String(row[key] || '').slice(0, 10);
    if (day && day <= today) last = i;
  });
  if (last < 0 || rows.length < MIN_PAGED_ROWS) return 0;
  return Math.min(Math.floor(last / pageSize(rows.length)), chartPageCount(rows) - 1);
}

/** Sunday, read in LOCAL time — `new Date("2026-10-18")` is UTC and can slip a day. */
export const isSunday = (ymd) => parseYMDLocal(String(ymd || '').slice(0, 10))?.getDay() === 0;

/* ─── Which weekdays this person doesn't work ─────────────────────────────────
   `GET /attendance/shift` answers `weekly_offs: [0, 6]` — WEEKDAY NUMBERS,
   0 = Sunday. It is the only authoritative source: an org on a six-day week
   has `[0]`, one on alternate Saturdays has its own pattern, and guessing
   from the calendar is how a Saturday-working office gets told it was absent
   every Saturday.

   `[0]` is the fallback when the endpoint hasn't answered or there is no
   assignment — not because Sunday is universal, but because it is the only
   defensible default in this market, and the alternative (fall back to
   nothing) is what produced the bug this exists to fix. */
export const DEFAULT_WEEKLY_OFFS = [0];

/** Is this date one of the person's weekly offs? */
export function isWeeklyOffDate(ymd, weeklyOffs = DEFAULT_WEEKLY_OFFS) {
  const day = parseYMDLocal(String(ymd || '').slice(0, 10))?.getDay();
  if (day == null) return false;
  const list = Array.isArray(weeklyOffs) && weeklyOffs.length ? weeklyOffs : DEFAULT_WEEKLY_OFFS;
  return list.map(Number).includes(day);
}

/**
 * The weekly offs from a `/attendance/shift` wrapper, or the default.
 *
 * The endpoint answers `{ assignment, shift, rotation, weekly_offs }` — the
 * array is on the WRAPPER, not on `shift`, and `shift: null` (no assignment)
 * is a normal state that still has to produce a usable answer.
 */
export function weeklyOffsOf(shiftWrapper) {
  const list = shiftWrapper?.weekly_offs;
  return Array.isArray(list) && list.length ? list.map(Number) : DEFAULT_WEEKLY_OFFS;
}

/** "2026-10-07" → "7". The axis label under a bar. */
export function dayOfMonth(ymd) {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(String(ymd || ''));
  return m ? String(Number(m[1])) : '';
}

/**
 * Whole-hour ticks with headroom above the tallest bar, so a 9-hour day in a
 * month of 8s doesn't draw flush with the top gridline. Always at least 0–4h,
 * so an empty month still has a grid to hang the bars on.
 *
 * @returns {{ max: number, ticks: number[] }} `max` is the top of the plot.
 */
export function hoursAxis(rows, key = 'hours') {
  let peak = 0;
  (rows || []).forEach((row) => {
    const v = Number(row?.[key]);
    if (Number.isFinite(v) && v > peak) peak = v;
  });
  if (peak <= 0) return { max: 4, ticks: [0, 2, 4] };

  // One whole hour of headroom, then rounded up to a step a reader can halve.
  const wanted = Math.ceil(peak) + 1;
  const step = wanted <= 6 ? 2 : wanted <= 12 ? 3 : Math.ceil(wanted / 4);
  const max = Math.ceil(wanted / step) * step;
  const ticks = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  return { max, ticks };
}
