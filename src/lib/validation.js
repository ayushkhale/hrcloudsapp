// ─────────────────────────────────────────────────────────────────────────────
// attendance/validation.js — Pure form validators.
// Each returns `{ errors, payload }`: `errors` maps field → message (empty when
// valid) and `payload` is the exact request body to send.
//
// Field names, types and ranges mirror the backend Joi validators documented in
// ATTENDANCE_API_CONTRACT.md §4–§5. The backend strips unknown keys silently
// (§1.8), so a payload must never carry a key the schema doesn't declare.
// Where the backend does NOT enforce a rule (half ≤ full day, per-shift-type
// times, rotation cycle = Σ durations) these validators are the only guard.
// ─────────────────────────────────────────────────────────────────────────────

import { combineLocalDateTime, parseYMDLocal, todayYMD } from "./dates.js";
import { WORK_MODE_VALUES } from "./enums.js";

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";
const toNumber = (v) => (isBlank(v) ? NaN : Number(v));
const isInt = (v) => Number.isInteger(toNumber(v));
const nullable = (n) => (n === undefined ? null : n);
const idList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);

export const hasErrors = (errors) => Object.keys(errors || {}).length > 0;
export const NAME_MAX = 150;

function rangeMessage(label, min, max, exclusiveMin) {
  if (max === Infinity) return exclusiveMin ? `${label} must be greater than ${min}.` : `${label} must be at least ${min}.`;
  return exclusiveMin ? `${label} must be greater than ${min} and at most ${max}.` : `${label} must be between ${min} and ${max}.`;
}

function intInRange(errors, key, value, { min, max = Infinity, label, required = true }) {
  if (isBlank(value)) {
    if (required) errors[key] = `${label} is required.`;
    return undefined;
  }
  const n = toNumber(value);
  if (!Number.isInteger(n)) errors[key] = `${label} must be a whole number.`;
  else if (n < min || n > max) errors[key] = rangeMessage(label, min, max, false);
  return n;
}

function decimalInRange(errors, key, value, { min, max = Infinity, label, required = true, exclusiveMin = false }) {
  if (isBlank(value)) {
    if (required) errors[key] = `${label} is required.`;
    return undefined;
  }
  const n = toNumber(value);
  if (!Number.isFinite(n)) errors[key] = `${label} must be a number.`;
  else if ((exclusiveMin ? n <= min : n < min) || n > max) errors[key] = rangeMessage(label, min, max, exclusiveMin);
  return n;
}

function requiredName(errors, value, label) {
  const name = String(value || "").trim();
  if (!name) errors.name = `${label} is required.`;
  else if (name.length > NAME_MAX) errors.name = `${label} can't exceed ${NAME_MAX} characters.`;
  return name;
}

function optionalEndDate(errors, key, from, to, label = "End date") {
  if (isBlank(to)) return null;
  if (!parseYMDLocal(to)) errors[key] = `Enter a valid ${label.toLowerCase()}.`;
  else if (from && to < from) errors[key] = `${label} can't be before the start date.`;
  return to;
}

// ── §4.4 POST /attendance/regularization ────────────────────────────────────
export const REGULARIZATION_REASON_MIN = 5;
export const REGULARIZATION_REASON_MAX = 1000;

/**
 * Times are sent as full ISO datetimes so overnight corrections are unambiguous (§1.7).
 * @param {{date: string, clockIn?: string, clockOut?: string, outNextDay?: boolean, reason: string, work_mode?: string}} form
 */
export function validateRegularization(form, { today = todayYMD(), now = new Date() } = {}) {
  const errors = {};
  const reason = String(form.reason || "").trim();

  if (!form.date || !parseYMDLocal(form.date)) errors.date = "Select the date you want to correct.";
  else if (form.date >= today) errors.date = "Only past dates can be corrected.";

  // Schema: .or('requested_clock_in', 'requested_clock_out')
  if (!form.clockIn && !form.clockOut) errors.times = "Enter a corrected clock-in time, clock-out time, or both.";

  const inIso = form.clockIn && form.date ? combineLocalDateTime(form.date, form.clockIn) : "";
  const outIso = form.clockOut && form.date ? combineLocalDateTime(form.date, form.clockOut, { nextDay: !!form.outNextDay }) : "";

  if (form.clockIn && !inIso && !errors.date) errors.clockIn = "Enter a valid clock-in time.";
  if (form.clockOut && !outIso && !errors.date) errors.clockOut = "Enter a valid clock-out time.";

  if (inIso && outIso) {
    const diff = new Date(outIso) - new Date(inIso);
    if (diff <= 0) errors.clockOut = "Clock-out must be after clock-in. If the shift ended after midnight, tick “Next day”.";
    else if (diff > 24 * 60 * 60 * 1000) errors.clockOut = "A corrected day can't be longer than 24 hours.";
  }
  if (outIso && new Date(outIso) > now && !errors.clockOut) errors.clockOut = "Clock-out can't be in the future.";

  if (reason.length < REGULARIZATION_REASON_MIN) errors.reason = `Reason must be at least ${REGULARIZATION_REASON_MIN} characters.`;
  else if (reason.length > REGULARIZATION_REASON_MAX) errors.reason = `Reason can't exceed ${REGULARIZATION_REASON_MAX} characters.`;

  if (form.work_mode && !WORK_MODE_VALUES.includes(form.work_mode)) errors.work_mode = "Choose a valid work mode.";

  const payload = { date: form.date, reason };
  if (inIso) payload.requested_clock_in = inIso;
  if (outIso) payload.requested_clock_out = outIso;
  if (form.work_mode && WORK_MODE_VALUES.includes(form.work_mode)) payload.work_mode = form.work_mode;
  return { errors, payload };
}


// ── POST /leaves/request ────────────────────────────────────────────────────
export const LEAVE_REASON_MAX = 1000;

/**
 * The web's ApplyLeaveDrawer checks, ported whole (LeaveDashboard.jsx).
 *
 * WHAT IT DELIBERATELY DOES NOT DO IS COUNT THE DAYS. The backend applies
 * holidays, weekly offs, the sandwich rule and the unpaid split, and returns
 * the real figure — a count worked out here would be a second, wrong answer
 * shown next to the right one. `spanDays` below is a hint for the "you may
 * not have enough balance" warning, nothing more, and it is never sent.
 *
 * Dates go on the wire as literal YYYY-MM-DD with no timezone (api/leave.api.js):
 * a leave day is a calendar day, and an ISO conversion can move it.
 *
 * @param {{leave_type_id: string, start_date: string, end_date: string,
 *          is_half_day?: boolean, half_day_type?: string, reason?: string,
 *          document_url?: string, document_id?: string}} form
 */
export function validateLeaveRequest(form) {
  const errors = {};
  const reason = String(form.reason || "").trim();

  if (!form.leave_type_id) errors.leave_type_id = "Choose which leave this is.";

  if (!form.start_date || !parseYMDLocal(form.start_date)) {
    errors.start_date = "Pick the first day.";
  }

  if (!form.end_date || !parseYMDLocal(form.end_date)) {
    errors.end_date = "Pick the last day.";
  } else if (form.start_date && form.end_date < form.start_date) {
    errors.end_date = "The last day can’t be before the first.";
  } else if (form.is_half_day && form.start_date && form.end_date !== form.start_date) {
    // Can't happen through the form (the switch locks the two together), so
    // this catches a prefill, not a typist.
    errors.end_date = "A half day is one day — the dates must match.";
  } else if (
    form.start_date && form.end_date
    && form.start_date.slice(0, 4) !== form.end_date.slice(0, 4)
  ) {
    // Balances are per calendar year, so a request across New Year would have
    // to spend from two wallets. The backend refuses it; say so first.
    errors.end_date = "Leave can’t run across two calendar years. Apply for each year separately.";
  }

  if (reason.length > LEAVE_REASON_MAX) {
    errors.reason = `Reason can’t exceed ${LEAVE_REASON_MAX} characters.`;
  }

  const payload = {
    leave_type_id: form.leave_type_id,
    start_date: form.start_date,
    end_date: form.is_half_day ? form.start_date : form.end_date,
    is_half_day: !!form.is_half_day,
  };
  if (form.is_half_day) payload.half_day_type = form.half_day_type || "first_half";
  if (reason) payload.reason = reason;
  // ONE piece of evidence, and an id beats a link: the server resolves an id
  // to a document it can check belongs to this person (api/leave.api.js).
  if (form.document_id) payload.document_id = form.document_id;
  else if (String(form.document_url || "").trim()) payload.document_url = String(form.document_url).trim();

  return { errors, payload };
}
// ── §4.1 punch notes / §6.3 decision remarks ────────────────────────────────
export const PUNCH_NOTES_MAX = 500;
export const DECISION_REMARKS_MAX = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// TRIMMED FOR THE EMPLOYEE APP.
// The web file also carries validatePolicy, validateShift, validateRotation,
// validateLock, validateCompOffPolicy, validateWeeklyOff, validateAssignment
// and validateEndAssignment — all HR configuration forms this app never shows.
// Port them from src/shared/attendance/validation.js if the manager/HR app
// ever lands here. Add the employee form validators (leave, claim, bank,
// declaration) below, in the same { errors, payload } shape.
// ─────────────────────────────────────────────────────────────────────────────

// ── PUT /payroll/me/bank-account ────────────────────────────────────────────
// The backend's own rules (md_payrolls phase1 §3.36): account_number is
// `^\d{6,20}$`, ifsc_code is the Indian format, holder name required. The web
// leans on `required` and lets the server refuse a bad IFSC with INVALID_IFSC;
// on a phone the round trip is the slow part, so the format is checked here
// first — in the server's words (INVALID_IFSC), not new ones.
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_NUMBER_PATTERN = /^\d{6,20}$/;
export const BANK_ACCOUNT_TYPES = ["savings", "current"];

export function validateBankAccount(form) {
  const errors = {};
  const holder = String(form.account_holder_name || "").trim();
  const bank = String(form.bank_name || "").trim();
  const number = String(form.account_number || "").replace(/\s+/g, "");
  const confirm = String(form.confirm_account_number || "").replace(/\s+/g, "");
  const ifsc = String(form.ifsc_code || "").trim().toUpperCase();
  const branch = String(form.branch_name || "").trim();

  if (!holder) errors.account_holder_name = "Enter the name exactly as the bank has it.";
  else if (holder.length > NAME_MAX) errors.account_holder_name = `Name can’t exceed ${NAME_MAX} characters.`;
  if (!bank) errors.bank_name = "Enter your bank’s name.";
  if (!number) errors.account_number = "Enter the full account number.";
  else if (!ACCOUNT_NUMBER_PATTERN.test(number)) errors.account_number = "An account number is 6 to 20 digits, with nothing else in it.";
  else if (confirm !== number) errors.confirm_account_number = "The two numbers don’t match.";
  if (!ifsc) errors.ifsc_code = "Enter your branch’s IFSC code.";
  else if (!IFSC_PATTERN.test(ifsc)) errors.ifsc_code = "That IFSC code isn't valid. It should look like HDFC0001234.";

  const payload = {
    account_holder_name: holder,
    bank_name: bank,
    account_number: number,
    ifsc_code: ifsc,
    account_type: BANK_ACCOUNT_TYPES.includes(form.account_type) ? form.account_type : "savings",
  };
  if (branch) payload.branch_name = branch;
  return { errors, payload };
}

// ── POST/PUT /payroll/me/reimbursements/claims ──────────────────────────────
// The web's ClaimEditorDialog checks, ported whole (MyReimbursementsPage.jsx
// `itemError` and the title rule). Item problems are keyed `item:<key>` so the
// form can put each one under its own expense.
export const CLAIM_TITLE_MIN = 3;
export const CLAIM_TITLE_MAX = 200;
export const CLAIM_MERCHANT_MAX = 150;
export const CLAIM_DESCRIPTION_MAX = 1000;

const cleanAmount = (v) => {
  const t = String(v ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const n = Number(t);
  return n > 0 ? n : NaN;
};

export function validateClaim(form, { today = todayYMD() } = {}) {
  const errors = {};
  const title = String(form.title || "").trim();
  if (title.length < CLAIM_TITLE_MIN) errors.title = `Give the claim a title (at least ${CLAIM_TITLE_MIN} characters).`;
  else if (title.length > CLAIM_TITLE_MAX) errors.title = `A title can’t exceed ${CLAIM_TITLE_MAX} characters.`;

  const items = Array.isArray(form.items) ? form.items : [];
  if (items.length === 0) errors.items = "Add at least one expense.";
  items.forEach((it) => {
    let problem = "";
    if (!it.category_id) problem = "Choose a category.";
    else if (!it.expense_date) problem = "Add the date you paid.";
    else if (it.expense_date > today) problem = "Use the date you paid, not a future date.";
    else if (Number.isNaN(cleanAmount(it.amount))) problem = "Enter an amount above 0, with at most 2 decimals.";
    if (problem) errors[`item:${it.key}`] = problem;
  });

  const payload = {
    title,
    items: items.map((it, i) => {
      const row = {
        category_id: it.category_id,
        expense_date: it.expense_date,
        amount: cleanAmount(it.amount),
        display_order: i,
      };
      const merchant = String(it.merchant || "").trim();
      const description = String(it.description || "").trim();
      if (merchant) row.merchant = merchant;
      if (description) row.description = description;
      return row;
    }),
  };
  return { errors, payload };
}

// ── PUT /payroll/me/tax/declarations ────────────────────────────────────────
// The whole declaration is upserted, not patched (api/payroll.api.js). The
// auto-filled EPF row is the server's and is never sent back (the web filters
// `sub_category === "EPF_AUTO"` the same way).
export function validateDeclaration(rows) {
  const errors = {};
  const list = Array.isArray(rows) ? rows : [];
  list.forEach((r) => {
    if (r.locked) return;
    const t = String(r.declared_amount ?? "").trim();
    if (!r.section) errors[`row:${r.key}`] = "Choose a section.";
    else if (!/^\d+(\.\d{1,2})?$/.test(t)) errors[`row:${r.key}`] = "Enter the amount you invested, in rupees.";
  });
  const payload = {
    items: list.filter((r) => !r.locked).map((r) => {
      const row = { section: r.section, declared_amount: Number(String(r.declared_amount).trim()) || 0 };
      if (r.item_id) row.item_id = r.item_id;
      const sub = String(r.sub_category || "").trim();
      const ref = String(r.proof_reference || "").trim();
      if (sub) row.sub_category = sub;
      if (ref) row.proof_reference = ref;
      return row;
    }),
  };
  return { errors, payload };
}
