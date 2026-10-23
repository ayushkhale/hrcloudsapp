// ─────────────────────────────────────────────────────────────────────────────
// features/pay/payMeta.js — the labels, tones and field readers My Pay shares.
//
// PORTED, NOT INVENTED. Every function here has a counterpart in the web app
// and keeps its name (CLAUDE.md §10):
//
//   statementMonths / statementTotals  ← shared/utils/annualStatementMeta.js
//   benefitTypeLabel / enrolment tones ← shared/utils/benefitMeta.js
//   outstanding / loan + instalment    ← roles/employee/payroll/screens/
//                                        MyLoansAndAdvancesPage.jsx
//   claim status                       ← shared/utils/reimbursementMeta.js
//
// The web's status TONES are Tailwind class strings, so they did not come
// across: payroll statuses live in `lib/enums.js` with every other status in
// the app, read through `statusMeta(kind, status)`.
//
// ── EVERY READER TAKES BOTH SPELLINGS ───────────────────────────────────────
//
// The payroll payloads changed shape between the draft the screens were
// written against and the live reply, and the web still reads both. Doing the
// same here is not defensiveness, it is the thing that stops this app printing
// "N/A" where the web prints a number — which is the whole complaint behind
// 30-domain/01-wording.md §14.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeAttachment } from '../../lib/attachments';
import { humanize } from '../../lib/enums';

/* ─── Shared readers ──────────────────────────────────────────────────────── */

export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** A value we can show, or null. Never 0 standing in for "we don't know". */
export const orNull = (v) => (v === null || v === undefined || v === '' ? null : v);

/* ─── Payslips ────────────────────────────────────────────────────────────── */

export const slipRunId = (s) => s?.run_id || s?.payroll_run?.id || s?.runId || s?.id;
export const slipPeriod = (s) => s?.period_month || s?.payroll_run?.period_month || '';
export const slipGross = (s) => s?.gross_earnings ?? s?.gross_pay ?? s?.figures?.gross_earnings ?? null;
export const slipNet = (s) => s?.net_pay ?? s?.figures?.net_pay ?? null;

/* The LIST row carries gross and net; what was deducted is only on the DETAIL
   (#56), nested under `figures`. The web learned this the hard way — a card
   printed "Deductions N/A" every month (employee audit E-15). A line that only
   ever says nothing is worse than no line, so a null here means DROP THE ROW,
   not render "N/A". */
export const slipDeductions = (s) => s?.total_deductions ?? s?.figures?.total_deductions ?? null;

/** Paid 1 Oct — the date the run was released, under whichever name it came. */
export const slipPaidOn = (s) => s?.paid_on || s?.paid_at || s?.payroll_run?.paid_on || s?.payment_date || null;

/* ─── Annual statement ────────────────────────────────────────────────────── */

const monthPaid = (m) => m?.status !== 'empty'
  && [m?.gross_earnings, m?.net_pay, m?.total_deductions].some((v) => v !== null && v !== undefined);

/** One row per month of the financial year, in the server's order. */
export function statementMonths(data) {
  const months = Array.isArray(data?.months) ? data.months : [];
  return months.map((m, i) => ({
    ...m,
    key: m.month || m.period_month || String(i),
    period: m.month || m.period_month || '',
    empty: !monthPaid(m),
  }));
}

/** The year's totals, or null until at least one month has been paid. */
export function statementTotals(data) {
  const totals = data?.totals || data?.ytd_totals || null;
  if (!totals) return null;
  if (totals.months_paid !== undefined && Number(totals.months_paid) === 0) return null;
  return totals;
}

/** "2026-27" for today — the Indian financial year starts in April. */
export function currentFinancialYear(d = new Date()) {
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/* ─── Salary structure ────────────────────────────────────────────────────── */

export const componentName = (c) => c?.component_name || c?.name || c?.component_code || 'Component';
export const componentAmount = (c) => c?.monthly_amount ?? c?.amount ?? c?.calculated_amount ?? 0;
export const isEarning = (c) => c?.component_type === 'earning';
export const isDeduction = (c) => c?.component_type === 'deduction';
export const isContribution = (c) =>
  c?.component_type === 'employer_contribution' || c?.component_type === 'contribution';

/**
 * Gross, deductions and take-home for a structure.
 *
 * Statutory lines live in their OWN table, not in `components`, and
 * `monthly_gross` already counts them — so take-home is gross minus BOTH the
 * component deductions and the statutory ones. The web works it out exactly
 * this way (MySalaryPage.jsx), and getting it wrong shows the person a
 * take-home they will never see in their bank.
 */
export function salaryBreakdown(structure) {
  const comps = Array.isArray(structure?.components) ? structure.components : [];
  const earnings = comps.filter(isEarning);
  const deductions = comps.filter(isDeduction);
  const contributions = comps.filter(isContribution);
  const sum = (rows) => rows.reduce((t, c) => t + num(componentAmount(c)), 0);

  const statutory = structure?.statutory_breakdown || {};
  const statutoryTotal = num(statutory.total_employee_deductions ?? statutory.employee_total);

  const gross = num(structure?.monthly_gross) || sum(earnings);
  const compDeductions = sum(deductions);
  const contributionsTotal = sum(contributions);

  return {
    earnings,
    deductions,
    contributions,
    gross,
    deductionsTotal: compDeductions + statutoryTotal,
    statutoryTotal,
    contributionsTotal,
    net: gross - compDeductions - statutoryTotal,
  };
}

/* ─── Loans ───────────────────────────────────────────────────────────────── */

export const outstanding = (l) =>
  l?.outstanding_principal ?? l?.outstanding_balance ?? l?.remaining_balance ?? l?.outstanding_amount ?? 0;

export const loanTitle = (l) => l?.title || l?.name || l?.loan_name || humanize(l?.loan_type) || 'Loan';

/* Status LABELS and TONES are not here. Every payroll status lives in
   `lib/enums.js` beside attendance's and leave's, read through
   `statusMeta(kind, status)` and rendered by `<StatusBadge kind="loan" />`.
   A second registry in a feature folder is how the web ended up with eight
   badges that disagreed. */

/* ─── Claims ──────────────────────────────────────────────────────────────── */

export const claimAmount = (c) => c?.total_amount ?? c?.amount ?? c?.claimed_amount ?? 0;
export const claimTitle = (c) =>
  c?.category?.name || c?.category_name || humanize(c?.category) || 'Claim';

/* ─── Benefits ────────────────────────────────────────────────────────────── */

const BENEFIT_TYPE_LABEL = {
  health_insurance: 'Health insurance',
  life_insurance: 'Life insurance',
  accident_insurance: 'Accident insurance',
  meal: 'Meal',
  travel: 'Travel',
  other: 'Other',
};

export const benefitTypeLabel = (type) =>
  BENEFIT_TYPE_LABEL[type] || humanize(type) || 'Other';

/* D-37, straight from the web's benefitMeta.js — said where it matters, because
   people assume a company-paid premium shows up in their tax. */
export const NO_TAX_EFFECT_NOTE =
  'Benefit plans don’t change income tax. A premium doesn’t count toward 80D '
  + 'automatically, and a company-paid perk isn’t taxed here.';

/* D-36 — a month is charged in full if cover is active on any day of it. */
export const NO_PRORATION_NOTE = 'A month is charged in full if cover is active on any day of it.';

/* ─── Extras (bonuses and adjustments) ────────────────────────────────────── */

/* "Extras" is this app's word. The web says "Variable Pay", which is a payroll
   term for a bonus and an arrear — it tells you which ledger the money came
   out of, not what it is. 30-domain/01-wording.md §2. */
export const extraTitle = (x) =>
  x?.component_name || x?.title || x?.name || x?.reason || humanize(x?.category) || humanize(x?.bonus_type) || 'Extra';

export const extraAmount = (x) => x?.amount ?? x?.gross_amount ?? 0;

/** An adjustment can be either side of the payslip; a bonus is always an earning. */
export const isExtraDeduction = (x) => x?.adjustment_type === 'deduction' || x?.type === 'deduction';

/* ─── Leave Payouts (#218 /me/encashments) ────────────────────────────────────
   Ported from the web's MyLoansAndAdvancesPage. Leave or Earned Leave turned
   into money; once approved it is paid with `period_month`'s payroll. */

export const encashSourceLabel = (r, earnedLeaveTerm = 'Earned Leave') => {
  if (r?.source_kind === 'comp_off') return earnedLeaveTerm;
  if (r?.source_kind === 'leave_balance') {
    return r?.leave_type_code ? `Leave balance (${r.leave_type_code})` : 'Leave balance';
  }
  return 'Leave';
};

/* ─── Tax ─────────────────────────────────────────────────────────────────── */

export const REGIME_LABEL = { old: 'Old regime', new: 'New regime' };
export const regimeLabel = (r) => REGIME_LABEL[r] || humanize(r) || 'Not chosen';

/* ─── Tax declaration ─────────────────────────────────────────────────────────
   Ported from the web's MyTaxAndInvestmentsPage › DeclarationsTab. The section
   list is VERBATIM — a section typed differently here would be a second
   spelling of the same law in HR's queue. */

export const TAX_SECTIONS = [
  '80C', '80D', '80CCD(1B)', '80E', '80G', '80TTA', '24B (Home Loan Interest)', 'HRA', 'LTA', 'Other',
];

/** The server's auto-filled PF line. It is shown, never edited, never sent back. */
export const isAutoDeclarationRow = (it) => it?.sub_category === 'EPF_AUTO';

/**
 * What a declaration's status lets the person do. The web's rules exactly:
 * a draft is editable; once submitted, only proofs move; after HR has
 * decided, nothing does.
 */
export function declarationStage(status) {
  const s = String(status || 'draft').toLowerCase();
  return {
    status: s,
    editable: s === 'draft',
    proofsOpen: s === 'draft' || s === 'submitted' || s === 'under_review',
  };
}

/** The declaration's lines, as the form edits them. `key` is local only. */
export function declarationRows(decl) {
  const items = Array.isArray(decl?.items) ? decl.items : [];
  return items.map((it, i) => ({
    key: String(it.item_id || it.id || `n${i}`),
    item_id: it.item_id || it.id || null,
    section: it.section || '80C',
    sub_category: it.sub_category || '',
    declared_amount: it.declared_amount != null ? String(it.declared_amount) : '',
    verified_amount: it.verified_amount ?? null,
    proof_status: it.proof_status || null,
    proof_reference: it.proof_reference || '',
    attachments: (Array.isArray(it.attachments) ? it.attachments : [])
      .map(normalizeAttachment).filter((a) => a && a.id),
    locked: isAutoDeclarationRow(it),
  }));
}


/* ─── Reimbursement category rules ────────────────────────────────────────────
   Ported from the web's `shared/utils/reimbursementMeta.js`. The names and the
   return strings are IDENTICAL on purpose — a claim refused on the web for a
   missing receipt must be refused here with the same sentence. */

const LIMIT_PERIOD_LABEL = { month: 'per month', financial_year: 'per financial year' };

/** "₹X per month" / "₹X per financial year" / "No limit". */
export function periodLimitText(category, money) {
  const cap = category?.max_amount_per_period;
  if (cap === null || cap === undefined || cap === '') return 'No limit';
  return `${money(cap)} ${LIMIT_PERIOD_LABEL[category?.limit_period] || 'per financial year'}`;
}

/** The per-claim cap, or "No limit". */
export function claimLimitText(category, money) {
  const cap = category?.max_amount_per_claim;
  if (cap === null || cap === undefined || cap === '') return 'No limit';
  return money(cap);
}

/** "Always" / "Above ₹X" / "Not needed". */
export function receiptRuleText(category, money) {
  if (!category?.requires_receipt) return 'Not needed';
  const above = category?.receipt_required_above_amount;
  if (above === null || above === undefined || above === '') return 'Always';
  return `Above ${money(above)}`;
}

/** True when an item of this amount needs a receipt (client-side pre-check). */
export function receiptNeeded(category, amount) {
  if (!category?.requires_receipt) return false;
  const above = category?.receipt_required_above_amount;
  if (above === null || above === undefined || above === '') return true;
  const threshold = Number.parseFloat(above);
  if (!Number.isFinite(threshold)) return true;
  const value = Number.parseFloat(amount);
  return Number.isFinite(value) && value > threshold;
}

/* ─── Claims: money, categories, the editor’s shape ───────────────────────────
   Ported from the web’s `shared/utils/reimbursementMeta.js`, names intact. */

/**
 * A money value with at most 2 decimals, sent as a JSON number. NaN when the
 * text is not a clean amount. `allowZero` lets 0 through; otherwise 0 is refused.
 */
export function parseMoney(value, { allowZero = false } = {}) {
  const t = String(value ?? '').trim();
  if (!/^d+(.d{1,2})?$/.test(t)) return NaN;
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  if (allowZero) return n >= 0 ? n : NaN;
  return n > 0 ? n : NaN;
}

/**
 * One row of `GET /me/reimbursements/categories`: the category PLUS this
 * person’s used and remaining headroom. The category is NESTED —
 * `{ category: { id, name, … }, consumed, remaining }` — and reading the row
 * as if it were the category is how every card once said 'Category'.
 */
export function normalizeHeadroomRow(row) {
  const r = row && typeof row === 'object' ? row : {};
  const category = r.category && typeof r.category === 'object' ? r.category : r;
  return {
    category,
    period_key: r.period_key || '',
    consumed: r.consumed ?? null,
    remaining: r.remaining ?? null,
  };
}

/** One claim line, every spelling the API has used. */
export function normalizeItem(it) {
  if (!it || typeof it !== 'object') return null;
  return {
    id: it.id ?? it.item_id,
    category_id: it.category_id,
    category_code: it.category_code,
    category_name: it.category_name,
    expense_date: it.expense_date,
    merchant: it.merchant,
    description: it.description,
    amount: it.amount,
    approved_amount: it.approved_amount,
    item_status: it.item_status || 'pending',
    approver_remarks: it.approver_remarks,
    attachments: (Array.isArray(it.attachments) ? it.attachments : []).map(normalizeAttachment).filter(Boolean),
  };
}

/** A full claim (header + items), however it was wrapped. */
export function normalizeClaimDetail(raw) {
  const d = raw?.claim && typeof raw.claim === 'object' ? raw.claim : raw && typeof raw === 'object' ? raw : {};
  return { ...d, items: Array.isArray(d.items) ? d.items.map(normalizeItem).filter(Boolean) : [] };
}

/** The item a RECEIPT_REQUIRED refusal points at, else ''. */
export function receiptProblem(err) {
  if (err?.data?.errorCode !== 'RECEIPT_REQUIRED') return '';
  return err?.data?.details?.item_id || '';
}

/**
 * Where a claim is, in the person’s words — the web’s `claimStage` labels.
 * `total_levels` decides who looks first: one level goes straight to HR.
 */
export function claimStageLabel(claim) {
  const levels = Number(claim?.total_levels) || 1;
  switch (claim?.status) {
    case 'draft': return 'Not sent yet. Only you can see it.';
    case 'submitted': return levels >= 2 ? 'Waiting for your manager.' : 'Waiting for HR.';
    case 'under_review': return 'Your manager approved it. Waiting for HR.';
    case 'approved': return 'Approved. Paid with your salary.';
    default: return '';
  }
}

/* ─── Bank account ───────────────────────────────────────────────────────── */

/**
 * The full number is NEVER returned — it is encrypted at rest and the reply
 * carries `masked_account_number` ('••••1234'). Older replies carried
 * `account_number` already masked. Either way this is display-only.
 */
export const bankNumberShown = (b) => b?.masked_account_number || b?.account_number || '';

/**
 * Verified or not. Any save resets `is_verified` to false on purpose — a
 * hijacked login must not be able to redirect a salary silently — so a
 * just-saved account always reads 'Waiting for HR to verify'.
 */
export const bankVerified = (b) => b?.is_verified === true || String(b?.verification_status || '').toLowerCase() === 'verified';
