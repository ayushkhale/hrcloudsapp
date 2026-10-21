// ─────────────────────────────────────────────────────────────────────────────
// lib/format.js — every number and value the user reads.
//
// Ported from shared/utils/formatUtils.js and DetailDialog's displayValue(),
// with ONE deliberate change: no `Intl`, no `toLocaleString`.
//
// WHY: on Android, Hermes's ICU support varies by RN version and build flags,
// so `toLocaleString('en-IN', …)` can produce different strings on two
// devices. A payslip reading ₹1,234,567 on one phone and ₹12,34,567 on another
// is a support ticket. Indian digit grouping is implemented by hand here, with
// byte-identical output to the web app's. Don't "simplify" it back.
//
// RULES THIS FILE ENFORCES (CLAUDE.md §6):
//   • A day is whole or half, never a decimal.
//   • Unknown reads "N/A". Never a dash.
//   • Money is Indian-grouped; whole rupees drop the decimals, paise show two.
// ─────────────────────────────────────────────────────────────────────────────

/* ─── Values ──────────────────────────────────────────────────────────────── */

/**
 * null / undefined / "" / NaN → "N/A". Numbers INCLUDING 0 are kept — a zero
 * balance is a fact, not an absence.
 */
export function displayValue(value, fallback = 'N/A') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') return value.trim() ? value : fallback;
  return value;
}

export const isEmptyValue = (v) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && !v.trim()) ||
  (typeof v === 'number' && !Number.isFinite(v));

/* ─── Day counts ──────────────────────────────────────────────────────────────
   A day off is only ever whole or half — there is no quarter day anywhere in
   leave, earned leave, payout or payroll. The API still sends decimals
   ("2.50"), and "2.5 days" reads as a sum to work out rather than a number of
   days, so it is NEVER printed. A value that is not a multiple of a half is a
   backend bug; it is snapped to the nearest half instead of leaking a decimal.

   ONE rendering, everywhere, and it writes the half as a fraction:
     0.5 → "1/2 d"           2   → "2d"
     1   → "1d"              2.5 → "2d and 1/2 d"

   Because the phrase carries its own unit, a tile must NOT put a "days"
   caption beside it — say "left", "paid", "unpaid".

   ── WHY THE FRACTION AND NOT "1 Half Day" (2026-10-18) ──────────────────────
   This file was ported when the web still spelled the half out. The web
   changed on 2026-10-13 ("the spelled-out form was three times the width in a
   table cell") and this copy did not follow, so the two products printed the
   same leave balance two different ways — exactly the drift the dictionary
   and the shared formatters exist to prevent. The app is the side with LESS
   room, so the compact form was never arguable here.

   The source of truth is the web's `src/shared/utils/formatUtils.js`. When it
   moves, this moves. Eight near-identical local copies of this used to
   disagree with each other; don't write a ninth.

   The spelled-out form still exists for screen readers — `spokenDayCount`,
   which reads "two and a half days" rather than the letter "d". */

const halvesOf = (val) => {
  const n = parseFloat(val);
  if (!Number.isFinite(n)) return null;
  return { halves: Math.round(Math.abs(n) * 2), sign: n < 0 ? '-' : '' };
};

/**
 * "1/2 d" / "1d" / "2d and 1/2 d".
 *
 * `lower` is kept because the form used to be Title Case and a dozen call
 * sites pass it; there is no longer a capital to lower, so it is a no-op.
 * Leave it in rather than touching every caller to drop it — the web keeps it
 * for the same reason, and the two signatures must stay identical.
 */
export function formatDayCount(val, { fallback = 'N/A', lower = false } = {}) {
  const parsed = halvesOf(val);
  if (!parsed) return fallback;
  const { halves, sign } = parsed;
  let out = '0d';
  if (halves > 0) {
    const whole = Math.floor(halves / 2);
    const parts = [];
    if (whole > 0) parts.push(`${sign}${whole}d`);
    if (halves % 2 === 1) parts.push(`${whole > 0 ? '' : sign}1/2 d`);
    out = parts.join(' and ');
  }
  return lower ? out.toLowerCase() : out;
}

/* ─── Money ───────────────────────────────────────────────────────────────────
   Indian grouping: the last three digits, then pairs. 1234567 → "12,34,567".
   Implemented by hand — see the file header for why. */

function groupIndian(intStr) {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  let rest = intStr.slice(0, -3);
  const pairs = [];
  while (rest.length > 2) {
    pairs.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) pairs.unshift(rest);
  return `${pairs.join(',')},${last3}`;
}

/**
 * Money arrives as a number or a numeric string (integer-paise safe on the
 * backend). Whole rupees print without decimals; anything with paise prints
 * EXACTLY two ("₹57,559.40", never "₹57,559.4"), so a column lines up.
 */
export function formatMoney(val, { withSymbol = true } = {}) {
  const n = parseFloat(val);
  const safe = Number.isFinite(n) ? n : 0;
  const rounded = Math.round(safe * 100) / 100;
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs);
  const paise = Math.round((abs - whole) * 100);
  const body = paise === 0
    ? groupIndian(String(whole))
    : `${groupIndian(String(whole))}.${String(paise).padStart(2, '0')}`;
  const sign = rounded < 0 ? '-' : '';
  return withSymbol ? `${sign}₹${body}` : `${sign}${body}`;
}

/**
 * Rates arrive as fixed-scale strings ("50.0000", "0.2500"). At most two
 * decimals with trailing zeros dropped: "50%" · "0.25%" · "3.75%".
 * Verified byte-identical to the web output across the realistic range.
 */
export function formatPercent(val) {
  const n = parseFloat(val);
  const safe = Number.isFinite(n) ? n : 0;
  const sign = safe < 0 ? '-' : '';
  const body = Math.abs(safe).toFixed(2).replace(/\.?0+$/, '');
  const [int, dec] = body.split('.');
  return `${sign}${groupIndian(int)}${dec ? `.${dec}` : ''}%`;
}

/**
 * A salary component's value as shown everywhere (catalog, templates):
 * flat → money, balancing → the remainder of CTC, anything else → a rate.
 */
export function formatComponentValue(component, { balancingLabel = 'Auto (remainder)' } = {}) {
  if (!component) return 'N/A';
  if (component.calculation_type === 'flat') return formatMoney(component.value);
  if (component.calculation_type === 'balancing') return balancingLabel;
  return formatPercent(component.value);
}

/* ─── Periods and dates ───────────────────────────────────────────────────── */

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
// "Sept", not "Sep" — that is NOT a typo. The web app formats short months
// with `toLocaleDateString('en-IN', { month: 'short' })`, and ICU's en-IN short
// name for September is "Sept". Using "Sep" here would make the native app
// disagree with the web app on one month of the year, which is exactly the kind
// of difference nobody notices until a payslip is questioned.
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** The full names, for the one place a day is a heading rather than a column. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "2026-09" → "September 2026". Payroll periods are always YYYY-MM strings. */
export function formatPeriod(periodMonth) {
  if (!periodMonth) return 'N/A';
  const [year, month] = String(periodMonth).split('-');
  const idx = parseInt(month, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx > 11) return String(periodMonth);
  return `${MONTHS_LONG[idx]} ${year}`;
}

/** "2026-09" → "Sep 2026" — for chips and steppers. */
export function formatPeriodShort(periodMonth) {
  if (!periodMonth) return 'N/A';
  const [year, month] = String(periodMonth).split('-');
  const idx = parseInt(month, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx > 11) return String(periodMonth);
  return `${MONTHS_SHORT[idx]} ${year}`;
}

/**
 * Payroll dates are YYYY-MM-DD strings (DATEONLY, no TZ) → "13 Oct 2026".
 * Parsed as a LOCAL calendar date: `new Date("2026-10-13")` is UTC midnight and
 * renders as the previous day west of UTC.
 */
export function formatDate(d) {
  if (!d) return 'N/A';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}`;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/* ─── Durations ───────────────────────────────────────────────────────────── */

/** Decimal hours → "8h 30m" / "45m" / "0h". */
export function formatDecimalHours(val) {
  if (val == null || Number.isNaN(Number(val)) || Number(val) === 0) return '0h';
  const n = Number(val);
  const hrs = Math.floor(n);
  const mins = Math.round((n - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

/* ─── Accessibility variants ──────────────────────────────────────────────────
   A screen reader reads "8h 32m" as letters. These go in accessibilityLabel
   ONLY; the visible text stays abbreviated. See 20-design/06-accessibility.md */

export function spokenDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m || !h) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

export function spokenMoney(val) {
  return `${formatMoney(val, { withSymbol: false })} rupees`;
}

/* "1/2 d" is read out as "one slash two d". This is the one place the
   spelled-out form survives, and it is never shown on screen. */
export function spokenDayCount(val) {
  const parsed = halvesOf(val);
  if (!parsed) return 'not known';
  const { halves, sign } = parsed;
  if (halves === 0) return 'no days';
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  const minus = sign ? 'minus ' : '';
  if (whole === 0) return `${minus}half a day`;
  const days = `${whole} ${whole === 1 ? 'day' : 'days'}`;
  return `${minus}${days}${half ? ' and a half' : ''}`;
}

/* ─── Small helpers ───────────────────────────────────────────────────────── */

export const plural = (n, one, many = `${one}s`) => `${n} ${Number(n) === 1 ? one : many}`;

/** Mask all but the last four characters of an account number. */
export const maskTail = (value, keep = 4) => {
  const s = String(value || '').trim();
  if (s.length <= keep) return s;
  return `•••• ${s.slice(-keep)}`;
};
