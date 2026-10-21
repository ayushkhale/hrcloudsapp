// ─────────────────────────────────────────────────────────────────────────────
// attendance/enums.js — Backend enums and their display metadata.
//
// Values come from the attendance API docs. Where a value appears in live data
// but not in the docs it is listed for DISPLAY only (never sent as a filter),
// and marked with a comment referencing the audit clarification item.
// Tailwind class strings are literal so the JIT compiler can see them.
// ─────────────────────────────────────────────────────────────────────────────

// Tone keys are semantic names (emerald = success, amber = pending, …); every
// tone renders as a purple-family shade so badges stay on theme but remain
// distinguishable from each other. Rose stays red for errors/absence.
// The tone KEYS are semantic names inherited from the web app (emerald =
// success, amber = pending, blue = info …) and every one of them renders as a
// purple-family shade — only `rose` is still red. The keys are kept EXACTLY as
// they are so a tone map ported from a web file keeps working unchanged.
//
// The web file also held the Tailwind class strings for each tone. Those live
// in theme/tokens.js here instead (`tone`/`toneOf`), so this module stays pure
// logic with no react-native import — which is what lets it be unit-tested and
// shared with any future surface.
//
//     import { toneOf } from "@/theme/tokens";
//     const { bg, fg, border, dot } = toneOf(statusMeta("record", r.status).tone);
export const TONE_KEYS = ["emerald", "rose", "amber", "blue", "purple", "sky", "indigo", "orange", "slate"];

/** "half-day" / "Half Day" / "HALF_DAY" → "half_day" */
export function normalizeStatusKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** "excessive_break" → "Excessive break" */
export function humanize(value) {
  const s = String(value || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// ── attendance_records.status ────────────────────────────────────────────────
export const RECORD_STATUS = {
  present: { label: "Present", tone: "emerald" },
  absent: { label: "Absent", tone: "rose" },
  half_day: { label: "Half Day", tone: "blue" },
  on_leave: { label: "On Leave", tone: "purple" },
  in_progress: { label: "In Progress", tone: "sky" },
  weekly_off: { label: "Weekly Off", tone: "slate" },
  holiday: { label: "Holiday", tone: "indigo" },
  not_marked: { label: "Not Marked", tone: "slate" },
  // The two chips the dense history endpoints leave to the client (contract
  // §8): `not_marked` splits into these by date. Listed here so a badge
  // rendered from a chip key picks up the right tone rather than the fallback.
  no_data: { label: "No data", tone: "slate" },
  upcoming: { label: "Upcoming", tone: "slate" },
  // Display-only legacy values seen in list payloads.
  late: { label: "Late", tone: "amber" },
  overtime: { label: "Overtime", tone: "orange" },
};

// Record-status filter for the HR list / daily report `status` query (§5.8, §6.1).
export const RECORD_STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "half_day", label: "Half day" },
  { value: "on_leave", label: "On leave" },
  { value: "holiday", label: "Holiday" },
  { value: "weekly_off", label: "Weekly off" },
];

// ── Regularization requests (U7 filter enum) ─────────────────────────────────
export const REGULARIZATION_STATUS = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "slate" },
};
export const REGULARIZATION_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Comp-offs (contract §2 C11) ──────────────────────────────────────────────
// The five values the service writes. There is no `rejected` state: the reject
// endpoint writes `cancelled`, so "Cancelled" must read as "rejected or cancelled".
export const COMP_OFF_STATUS = {
  // "Earned" alone read as already in the balance; the summary above every
  // list of these calls the same state "Waiting for approval".
  earned: { label: "Earned · waiting for approval", short: "Waiting for approval", tone: "amber" },
  approved: { label: "Approved", short: "Approved", tone: "emerald" },
  used: { label: "Used", short: "Used", tone: "blue" },
  expired: { label: "Expired", short: "Expired", tone: "slate" },
  cancelled: { label: "Rejected or cancelled", short: "Rejected / cancelled", tone: "rose" },
};
export const COMP_OFF_FILTERS = [
  { value: "", label: "All" },
  { value: "earned", label: "Waiting for approval" },
  { value: "approved", label: "Approved" },
  { value: "used", label: "Used" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Rejected / cancelled" },
];

// ── Leave requests (leaves module) ───────────────────────────────────────────
// `cancellation_pending` is the one people do not expect: cancelling a leave
// that has ALREADY STARTED does not cancel it, it asks a manager to. The
// backend decides that by DATE, not by status (api/leave.api.js), so the word
// on the badge is the only place somebody learns which happened.
//
// `terminated_cancelled` is written by the exit process, never by a person.
export const LEAVE_STATUS = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "slate" },
  cancellation_pending: { label: "Cancellation requested", short: "Cancelling", tone: "purple" },
  terminated_cancelled: { label: "Cancelled on exit", short: "Cancelled on exit", tone: "slate" },
};
export const LEAVE_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "cancellation_pending", label: "Cancelling" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Overtime requests ────────────────────────────────────────────────────────
export const OVERTIME_STATUS = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

// ── Anomalies (contract §2 C16) ──────────────────────────────────────────────
// The query filter is `status=open|resolved|all`, but records have NO status
// column — they carry `is_resolved` (boolean). Always derive the key with
// anomalyStatusKey(). `type` and `severity` are free-form strings.
export const ANOMALY_STATUS = {
  open: { label: "Open", tone: "amber" },
  resolved: { label: "Resolved", tone: "emerald" },
};
export const anomalyStatusKey = (anomaly) => (anomaly?.is_resolved === true || !!anomaly?.resolved_at ? "resolved" : "open");
export const ANOMALY_FILTERS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export const ANOMALY_TYPE_LABELS = {
  out_of_bounds: "Punched away from the work location",
  missing_coordinates: "Punched without location",
  // A setup gap, not misconduct — the wording must not read like an accusation
  // (contract 7_work_mode_and_field_geofencing_api.md §7).
  geofence_unresolved: "No work location set up to check against",
  work_mode_claim_mismatch: "Punch claimed a work mode the contract doesn’t allow",
  excessive_break: "Break exceeded policy limit",
  late_arrival: "Late arrival",
  late: "Late arrival",
  early_exit: "Early exit",
  missing_clock_out: "Missing clock-out",
  missed_clock_out: "Missing clock-out",
  auto_clock_out: "Auto clocked out",
  multiple_sessions: "Multiple sessions",
};
export const anomalyTypeLabel = (type) => ANOMALY_TYPE_LABELS[normalizeStatusKey(type)] || humanize(type) || "Anomaly";

/**
 * Which punch a flag is about — "Clock-in", "Clock-out", or "" when it doesn't say.
 *
 * Clock-in and clock-out each raise their OWN geofence anomaly, so two rows a
 * day is correct and must not be de-duplicated (contract
 * md_attendance/7_work_mode_and_field_geofencing_api.md §7). But rendering only
 * the type label made them identical twins: a reviewer saw the same flag twice
 * with no way to tell which punch, so a clock-out breach (someone driving home)
 * read as a second complaint about a clock-in that was fine. The backend puts
 * the side at the start of `description`.
 */
export function anomalyPunchSide(anomaly) {
  const d = normalizeStatusKey(anomaly?.description).replace(/_/g, " ");
  if (d.startsWith("clock in")) return "Clock-in";
  if (d.startsWith("clock out")) return "Clock-out";
  return "";
}

/** The flag's label, named by punch when the flag says which. */
export function anomalyLabel(anomaly) {
  const label = anomalyTypeLabel(anomaly?.type || anomaly?.anomaly_type);
  const side = anomalyPunchSide(anomaly);
  return side ? `${side} · ${label}` : label;
}

/**
 * `geofence_unresolved` means nobody finished configuring a work location — no
 * assigned office, no active branch, no assigned site, or a location with no
 * GPS pin. It must be routed to a setup queue, never a disciplinary one, and it
 * is the only anomaly type whose fix belongs to HR rather than the employee.
 */
export const SETUP_ANOMALY_TYPES = new Set(["geofence_unresolved"]);
export const isSetupAnomaly = (anomaly) => SETUP_ANOMALY_TYPES.has(normalizeStatusKey(anomaly?.type));

export const SEVERITY = {
  low: { label: "Low", tone: "slate" },
  medium: { label: "Medium", tone: "amber" },
  high: { label: "High", tone: "rose" },
  critical: { label: "Critical", tone: "rose" },
};

// ── Shift templates ──────────────────────────────────────────────────────────
// Descriptive tags only: every type is calculated from start/end time and the
// policy (update_shift_templates_2026_09_14.md §3.3).
export const SHIFT_TYPES = {
  fixed: { label: "Fixed", description: "Same start and end time every day" },
  flexible: { label: "Flexible", description: "No set start or end time" },
  split: { label: "Split", description: "Worked out like Fixed; no second work block" },
  night: { label: "Night", description: "Starts one day, ends the next" },
  rotational: { label: "Rotational", description: "Cycles through shifts via a rotation pattern" },
};

// ── Punch payload enums (U1) ─────────────────────────────────────────────────
export const PUNCH_SOURCE_WEB = "web";
export const WORK_MODES = [
  { value: "office", label: "Office" },
  { value: "remote", label: "Remote" },
  { value: "field", label: "Field" },
  { value: "hybrid", label: "Hybrid" },
];
export const WORK_MODE_VALUES = WORK_MODES.map((m) => m.value);

export const PUNCH_TYPE_LABELS = {
  clock_in: "Clock in",
  clock_out: "Clock out",
  break_start: "Break started",
  break_end: "Break ended",
};

/* ── Payroll (2026-10-18, for My Pay) ────────────────────────────────────────
   These went HERE and not into features/pay, because a second status registry
   is how the web ended up with eight badges that disagreed. One map per kind,
   one `statusMeta`, one `StatusBadge`.

   The labels are the person's words, not payroll's: a claim is not "processed"
   to the person who raised it, it is "Paid". The tones are the house four —
   amber waiting, emerald settled, rose refused, slate over. */

// A loan or a salary advance.
export const LOAN_STATUS = {
  pending: { label: "Waiting for approval", short: "Waiting", tone: "amber" },
  active: { label: "Being repaid", short: "Repaying", tone: "purple" },
  closed: { label: "Fully repaid", short: "Repaid", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

// One row of a repayment schedule.
export const INSTALMENT_STATUS = {
  pending: { label: "Due", tone: "amber" },
  scheduled: { label: "Due", tone: "amber" },
  recovered: { label: "Paid", tone: "emerald" },
  paid: { label: "Paid", tone: "emerald" },
  waived: { label: "Waived", tone: "slate" },
  skipped: { label: "Skipped", tone: "slate" },
};

// A reimbursement claim. `draft` is a claim the person started and never sent;
// it is the only status they can still edit.
export const CLAIM_STATUS = {
  draft: { label: "Not sent yet", short: "Draft", tone: "slate" },
  submitted: { label: "Waiting for approval", short: "Waiting", tone: "amber" },
  pending: { label: "Waiting for approval", short: "Waiting", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "slate" },
  // "Processed" is the API's word for "it went out with your pay".
  processed: { label: "Paid with your salary", short: "Paid", tone: "purple" },
  paid: { label: "Paid with your salary", short: "Paid", tone: "purple" },
};

// A benefit enrolment. `cancelled` is read-only on both sides (D-35).
export const ENROLMENT_STATUS = {
  active: { label: "Covered", tone: "emerald" },
  ended: { label: "Ended", tone: "slate" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

// A bonus or an adjustment — My Pay calls the pair "Extras".
export const EXTRA_STATUS = {
  pending: { label: "Waiting for approval", short: "Waiting", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  applied: { label: "Paid with your salary", short: "Paid", tone: "purple" },
  paid: { label: "Paid with your salary", short: "Paid", tone: "purple" },
  rejected: { label: "Rejected", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

// A tax declaration for the financial year.
export const DECLARATION_STATUS = {
  draft: { label: "Not sent yet", short: "Draft", tone: "slate" },
  submitted: { label: "Waiting to be checked", short: "Waiting", tone: "amber" },
  pending: { label: "Waiting to be checked", short: "Waiting", tone: "amber" },
  under_review: { label: "HR is checking it", short: "Checking", tone: "amber" },
  partially_verified: { label: "Partly accepted", short: "Partly", tone: "purple" },
  verified: { label: "Accepted", tone: "emerald" },
  approved: { label: "Accepted", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
};


/* ── Tasks (for My Tasks) ─────────────────────────────────────────────────────
   Ported from the web's shared/tasks/taskMeta.js TASK_STATUS — labels VERBATIM,
   so a task reads the same word in both products (CLAUDE.md §10). The tone keys
   are the web's too and already render purple here; only `rose` stays red, and
   nothing on these screens is rose — a missed deadline is carried by the
   OVERDUE chip the cards draw themselves, not by the status.

   "in_review" is the one that needed care: to the assignee it means "waiting on
   your reviewer", to the reviewer "waiting on you", so the neutral "Waiting for
   review" is used and the screen says who acts. */
export const TASK_STATUS = {
  pending: { label: 'Not started', tone: 'slate' },
  in_progress: { label: 'Being worked on', short: 'In progress', tone: 'blue' },
  in_review: { label: 'Waiting for review', short: 'In review', tone: 'amber' },
  reopened: { label: 'Changes requested', short: 'Changes', tone: 'orange' },
  completed: { label: 'Done', tone: 'emerald' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

/* ── Trusted devices (for My Registered Devices) ──────────────────────────────
   Ported from the web's attendance/enums.js DEVICE_STATUS — labels and tones
   VERBATIM (CLAUDE.md §10). `pending` waits on HR and CANNOT clock in; `revoked`
   is terminal. The sentences people read underneath the badge live in
   features/devices/deviceMeta.js (`deviceStatusNote`). */
export const DEVICE_STATUS = {
  pending: { label: 'Waiting for HR', tone: 'amber' },
  active: { label: 'Ready', tone: 'emerald' },
  suspended: { label: 'Blocked for now', tone: 'orange' },
  revoked: { label: 'Shut off', tone: 'rose' },
};

// The salary account. Every save resets it to unverified (anti-fraud), so
// "waiting" is the normal state right after an edit, not a problem.
export const BANK_STATUS = {
  verified: { label: "Verified", tone: "emerald" },
  unverified: { label: "Waiting for HR to verify", short: "Not verified", tone: "amber" },
};

// JavaScript `Date#getDay()` convention: 0 = Sunday … 6 = Saturday (audit C8).
export const WEEKDAYS = [
  { value: 0, short: "Sun", label: "Sunday" },
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
];

/* ── Documents (2026-10-20, for My Documents) ────────────────────────────────
   Ported from the web's documents/documentMeta.js, orgDocumentMeta.js,
   complianceMeta.js and requestMeta.js — labels VERBATIM, so a document reads
   the same in both products (CLAUDE.md §10). Only the tones moved: the web's
   "orange" is amber here, and an OVERDUE deadline is amber (fuchsia), not rose —
   rose is for refusals and errors (40-screens/06-documents.md, Traps). */

// An employee document — the server's `display_status`, plus the UI's own
// `expiring_soon` (docMeta.displayStatus).
export const DOCUMENT_STATUS = {
  pending_upload: { label: "Upload not finished", short: "Not finished", tone: "slate" },
  pending_verification: { label: "In review", tone: "amber" },
  available: { label: "Verified", tone: "emerald" },
  expiring_soon: { label: "Expiring soon", tone: "amber" },
  expired: { label: "Expired", tone: "rose" },
  rejected: { label: "Rejected", tone: "rose" },
  superseded: { label: "Older version", tone: "slate" },
  quarantined: { label: "Quarantined", tone: "rose" },
  archived: { label: "Archived", tone: "slate" },
  deleted: { label: "Deleted", tone: "slate" },
  not_uploaded: { label: "Not uploaded", tone: "slate" },
};

// What TODAY makes of a company document addressed to me (#70 compliance_state).
export const COMPLIANCE_STATUS = {
  completed: { label: "Done", tone: "emerald" },
  pending: { label: "Waiting", tone: "blue" },
  overdue: { label: "Overdue", tone: "amber" },
  waived: { label: "Excused", tone: "purple" },
};

// My recipient record on a company document, for one that asks nothing of me.
export const RECIPIENT_STATUS = {
  pending: { label: "Not opened yet", short: "Not opened", tone: "slate" },
  viewed: { label: "Opened", tone: "blue" },
  acknowledged: { label: "Acknowledged", tone: "emerald" },
  signed: { label: "Signed", tone: "emerald" },
  waived: { label: "Excused", tone: "purple" },
};

// A document HR or my manager asked me for.
export const DOCUMENT_REQUEST_STATUS = {
  open: { label: "Waiting", tone: "amber" },
  overdue: { label: "Overdue", tone: "amber" },
  fulfilled: { label: "Done", tone: "emerald" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

// One row of my required-documents checklist (#98).
export const CHECKLIST_STATUS = {
  satisfied: { label: "On file", tone: "emerald" },
  expiring: { label: "Expiring soon", tone: "amber" },
  expired: { label: "Expired", tone: "rose" },
  pending_upload: { label: "Upload not finished", short: "Not finished", tone: "slate" },
  requested: { label: "Asked for", tone: "amber" },
  missing: { label: "Not provided", tone: "slate" },
};

const STATUS_MAPS = {
  document: DOCUMENT_STATUS,
  compliance: COMPLIANCE_STATUS,
  recipient: RECIPIENT_STATUS,
  docRequest: DOCUMENT_REQUEST_STATUS,
  checklist: CHECKLIST_STATUS,
  record: RECORD_STATUS,
  regularization: REGULARIZATION_STATUS,
  leave: LEAVE_STATUS,
  compoff: COMP_OFF_STATUS,
  overtime: OVERTIME_STATUS,
  anomaly: ANOMALY_STATUS,
  severity: SEVERITY,
  loan: LOAN_STATUS,
  instalment: INSTALMENT_STATUS,
  claim: CLAIM_STATUS,
  enrolment: ENROLMENT_STATUS,
  extra: EXTRA_STATUS,
  declaration: DECLARATION_STATUS,
  bank: BANK_STATUS,
  task: TASK_STATUS,
  device: DEVICE_STATUS,
};

/** Resolve `{label, tone}` for a status of a given kind, with a safe fallback. */
export function statusMeta(kind, status) {
  const key = normalizeStatusKey(status);
  const map = STATUS_MAPS[kind] || RECORD_STATUS;
  const meta = map[key];
  if (meta) return { key, label: meta.short || meta.label, longLabel: meta.label, tone: meta.tone };
  return { key, label: humanize(key) || "N/A", longLabel: humanize(key) || "N/A", tone: "slate" };
}
