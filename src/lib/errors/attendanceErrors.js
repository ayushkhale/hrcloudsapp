// ─────────────────────────────────────────────────────────────────────────────
// attendanceErrors.js
// Maps the backend's typed error `code` values (thrown by client.js as
// `err.data.code`) to actionable messages for the Attendance module.
//
// Source of truth: ATTENDANCE_API_CONTRACT.md §3 — "if a code is not on this
// list, the backend does not emit it". Payroll locks raise PERIOD_LOCKED (403);
// DATE_LOCKED never existed. Always branch on `code`, never on `message`.
// ─────────────────────────────────────────────────────────────────────────────

const RECORD_GONE = "That record could not be found. It may already have been actioned or removed — refresh to see the latest.";

const ATTENDANCE_ERROR_MESSAGES = {
  // §1.3 / §3.3 Access
  FEATURE_NOT_AVAILABLE: "Attendance isn't enabled for this organisation. Contact your administrator to turn it on.",
  // Raised by the shared org-context middleware in front of every module.
  MISSING_ORG_CONTEXT: "Attendance is only available inside an organisation. Switch to an organisation account to continue.",
  // Attendance emits UNAUTHORIZED as a 403 for cross-org access (an expired
  // session is an HTTP 401 and is handled before this map).
  UNAUTHORIZED: "This record belongs to a different organisation, so you can't access it.",
  FORBIDDEN: "You don't have permission to perform this action.",
  NOT_HR: "Only HR administrators can perform this action.",
  HIERARCHY_VIOLATION: "This employee is outside your reporting line, so you can't view or action their attendance.",
  EMPLOYEE_NOT_IN_TEAM: "This employee isn't in your team, so you can't view their attendance.",

  // §3.1 Punch / clock
  ALREADY_CLOCKED_IN: "You're already clocked in for today. Your status has been refreshed.",
  NOT_CLOCKED_IN: "You aren't clocked in right now. Your status has been refreshed.",
  NO_ACTIVE_BREAK: "You're not on a break right now. Your status has been refreshed.",
  MAX_BREAKS_EXCEEDED: "You've already taken the maximum number of breaks your attendance policy allows today.",
  PREVIOUS_SHIFT_OPEN: "Your previous shift is still open. Clock out of it before starting a new one.",
  PERIOD_LOCKED: "This date is locked for payroll processing, so its attendance can't be changed. Contact HR if a correction is needed.",

  // §3.2 Regularization
  // Work mode is validated against the employee's contract at submission
  // (2026-10-05). The server's message names the next step, so these are listed
  // in SERVER_MESSAGE_CODES below and shown verbatim where it sends one.
  WORK_MODE_NOT_PERMITTED: "Your contract doesn't allow that work mode. Ask HR to correct your work mode if it's wrong.",
  INVALID_WORK_MODE: "That isn't a work mode we recognise. Pick one from the list and try again.",
  REGULARIZATION_DISABLED: "Your attendance policy doesn't allow correction requests. Contact HR if a correction is needed.",
  INVALID_REGULARIZATION_DATE: "This date is outside your policy's correction window, so it can't be corrected.",
  INVALID_REGULARIZATION_WINDOW: "The corrected clock-out must be after the corrected clock-in.",
  INVALID_REGULARIZATION_TIME: "One of the corrected times couldn't be read. Re-enter the times and try again.",
  ALREADY_PENDING: "You already have a pending correction request for this date. Withdraw it first to submit a new one.",
  ALREADY_PROCESSED: "This request has already been actioned, so it can't be changed. The list has been refreshed.",

  // §3.4 Configuration
  POLICY_NOT_FOUND: RECORD_GONE,
  POLICY_DELETED: "This policy no longer exists. Refresh to see the current policies.",
  POLICY_DEACTIVATED: "This policy has been deactivated. Choose an active policy.",
  SHIFT_NOT_FOUND: RECORD_GONE,
  // SHIFT_IN_USE / PATTERN_IN_USE are HTTP 400, not 409 (update_shift_templates_2026_09_14 §5.5).
  // DELETE /shifts/:id deactivates; "in use" means an assignment that hasn't ended.
  SHIFT_IN_USE: "Employees are still assigned to this shift, so it can't be deactivated. End their assignments in Shift Management first.",
  SHIFT_DEACTIVATED: "This shift has been deactivated. Choose an active shift.",
  PATTERN_NOT_FOUND: RECORD_GONE,
  PATTERN_IN_USE: "This rotation is still assigned to employees, so it can't be deleted. End those assignments first.",
  INVALID_FILTER: "One of the filters isn't valid. Clear the filters and try again.",
  ASSIGNMENT_NOT_FOUND: RECORD_GONE,
  HOLIDAY_NOT_FOUND: RECORD_GONE,
  WEEKLY_OFF_NOT_FOUND: RECORD_GONE,
  WEEKLY_OFF_DELETED: RECORD_GONE,
  LOCK_NOT_FOUND: RECORD_GONE,
  OVERLAPPING_LOCK: "This range overlaps an existing lock period. Adjust the dates or remove the existing lock first.",
  COMP_OFF_NOT_FOUND: RECORD_GONE,

  // §11 Field locations & assignments (2026-10-05). A field site exists only to
  // be geofenced, so a retired one can't be assigned and coordinates aren't
  // optional — these say which, rather than "invalid request".
  FIELD_LOCATION_NOT_FOUND: RECORD_GONE,
  FIELD_ASSIGNMENT_NOT_FOUND: RECORD_GONE,
  FIELD_LOCATION_INACTIVE: "This site has been retired, so people can't be assigned to it. Pick an active site or restore this one.",
  FIELD_LOCATION_FORBIDDEN: "Only HR or the person who added this site can change it.",
  FIELD_LOCATION_DUPLICATE: "A site with that name already exists. Use the existing one rather than adding a second.",
  FIELD_ASSIGNMENT_DUPLICATE: "This person is already assigned to this site. Edit that assignment's dates instead of adding another.",
  // EMPLOYEE_NOT_FOUND (also raised by assign) is already mapped below.
  COMP_OFF_NOT_EARNED: "This request has already been actioned, so it can't be changed. The list has been refreshed.",
  EMPLOYEE_NOT_FOUND: "That employee could not be found. They may have been removed from the organisation.",
  USER_NOT_FOUND: "That employee could not be found. They may have been removed from the organisation.",
  MANAGER_NOT_FOUND: "That manager could not be found.",
  NOT_FOUND: RECORD_GONE,

  // §3.5 Devices (Phase 8 — surfaced only if device screens are used).
  // These three are about ORGANISATION-OWNED BIOMETRIC TERMINALS (ZKTeco,
  // Matrix, eSSL wall units keyed by `api_key_hash`), which is a different
  // system from the employee device trust below. Don't merge the two blocks.
  UNAUTHORIZED_DEVICE: "The device API key is invalid or the device is inactive.",
  MAPPING_NOT_FOUND: "This device employee ID isn't mapped to anyone yet.",
  MAPPING_ALREADY_EXISTS: "This device employee ID is already mapped.",

  /* ── Device trust, on the employee's own phone (2026-10-17) ───────────────
     md_attendance/8_device_trust_api_analysis.md §Errors. None of these were
     mapped, so the server's own wording reached the screen — somebody trying
     to clock in was told "a registered trusted device is required", which
     names the mechanism and not one thing they can do about it (§6).

     Every one of them is a 403/400/409/422 and NEVER a 401, deliberately: a
     401 would make the client discard the session and bounce to sign-in, so
     a device problem must not be mistaken for an expired session. */
  ATTENDANCE_DEVICE_REQUIRED: "This phone isn't set up for clocking in yet. Open My Registered Devices to add it, or ask HR to.",
  ATTENDANCE_DEVICE_REVOKED: "This phone's access to clocking in was removed. Ask HR to register it again.",
  ATTENDANCE_DEVICE_SUSPENDED: "HR has paused clocking in from this phone. Ask them to turn it back on.",
  DEVICE_VERIFICATION_FAILED: "We couldn't confirm this is the phone that was registered. Try again, and tell HR if it keeps happening.",
  // Challenge expired, reused, unknown, or issued for another action — all
  // one code on purpose, so the error can't be used to probe the server.
  DEVICE_CHALLENGE_INVALID: "That took too long to go through. Try again.",
  DEVICE_LIMIT_REACHED: "You've registered as many devices as your organisation allows. Remove one in My Registered Devices first.",
  DEVICE_ALREADY_REGISTERED: "This phone is already registered — you don't need to add it again.",
  DEVICE_NOT_HARDWARE_BOUND: "This phone stores its passkey in a cloud keychain, which your organisation doesn't accept for clocking in. Ask HR what to use instead.",
  DEVICE_NOT_FOUND: RECORD_GONE,
  DEVICE_INVALID_STATE_TRANSITION: "That device can't be changed to that state. Refresh to see where it stands now.",
  DEVICE_TRUST_MISCONFIGURED: "Device checks aren't set up on the server, so clocking in is blocked. This one is for your IT team.",

  /* The PHONE's side of the same check (features/devices/deviceKey.js).
     Not server codes: the app raises them in the server's error shape so a
     punch that couldn't be signed reads through this one map like any other. */
  DEVICE_UNLOCK_CANCELLED: "Clocking in needs your fingerprint or screen lock. Try again and confirm it.",
  DEVICE_UNLOCK_LOCKED_OUT: "Too many tries. Unlock your phone with its PIN or pattern, then try again.",
  DEVICE_UNLOCK_UNAVAILABLE: "Set up a fingerprint or screen lock on this phone to clock in with it.",
  DEVICE_KEY_RESET: "This phone's security changed (a new fingerprint, say), so it needs registering again. Open My Registered Devices.",

  // Registration's own OTP — a different context from sign-in's, same words.
  OTP_INVALID: "That code isn't right. Send a new code and try again.",
  OTP_EXPIRED: "That code has expired. Send a new one.",

  /* My Schedule — the forward agenda (2026-10-22, md_updates/2026-10-22_
     frontend_my_schedule_forward_view_integration_guide.md §8). The three
     range/include codes are bugs in OUR window picker, which never asks for
     more than 92 days; the copy is a calm fallback, not an explanation. */
  SCHEDULE_RANGE_INVALID: "That date range doesn't work. Pick a shorter window and try again.",
  SCHEDULE_RANGE_TOO_LARGE: "That window is too long. Your schedule shows up to 90 days at a time.",
  SCHEDULE_INCLUDE_INVALID: "We couldn't load your schedule. Please try again.",
  TEAM_TOO_LARGE: "Your team is too large to show at once. Pick one person to see their schedule.",
  CANNOT_ACCESS_OUTSIDE_HIERARCHY: "You don't have access to that person's schedule.",
};

// Joi / shape rejections: the server `message` is more specific than any copy we could write.
// Codes whose server message beats ours because it carries specifics we can't
// know: which field broke a rule, which work mode the contract allows, or the
// dates of the assignment already blocking this one.
const SERVER_MESSAGE_CODES = new Set([
  "VALIDATION_ERROR", "INVALID_SHIFT", "INVALID_SHIFT_DATA", "INVALID_ROTATION_DURATIONS",
  "WORK_MODE_NOT_PERMITTED", "FIELD_ASSIGNMENT_DUPLICATE", "FIELD_LOCATION_DUPLICATE",
]);

const SESSION_EXPIRED = "Your session has expired. Please sign in again.";
const SERVER_ERROR = "The server ran into a problem. Please try again shortly.";
const RATE_LIMITED = "Too many requests. Please wait a moment and try again.";

/** The typed backend code, if any (`code`; `errorCode` kept for older envelopes). */
export function attendanceErrorCode(err) {
  return err?.data?.code || err?.data?.errorCode || null;
}

/**
 * Resolve a friendly, actionable message from a rejected attendance request.
 * @param {unknown} err - error thrown by `request()`.
 * @param {string} [fallback]
 * @returns {string}
 */
export function attendanceErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const code = attendanceErrorCode(err);
  const serverMessage = typeof err?.data?.message === "string" ? err.data.message.trim() : "";

  if (err?.status === 401) return SESSION_EXPIRED;
  if (code && !SERVER_MESSAGE_CODES.has(code) && ATTENDANCE_ERROR_MESSAGES[code]) {
    return ATTENDANCE_ERROR_MESSAGES[code];
  }
  if (err?.status >= 500) return SERVER_ERROR;
  if (err?.status === 429) return RATE_LIMITED;
  if (serverMessage) return serverMessage;
  // Only real fetch failures (offline, DNS, CORS) — a TypeError from a coding
  // bug must not be reported as a connectivity problem.
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(err?.message || "")) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  const message = typeof err?.message === "string" ? err.message : "";
  // `isGenericMessage` is set by api/client.js when `.message` is OURS rather
  // than the server's. It used to be decided by `/^Request failed: \d+$/`, a
  // shape the client has never produced ("Request failed (400 Bad Request)"),
  // so a refusal with an empty body showed that developer string in a red
  // toast. The regex stays as belt-and-braces for errors built elsewhere.
  if (message && !err?.isGenericMessage && !/^Request failed\b/.test(message)) return message;
  return fallback;
}

export const isFeatureDisabled = (err) => {
  const code = attendanceErrorCode(err);
  return code === "FEATURE_NOT_AVAILABLE" || code === "MISSING_ORG_CONTEXT";
};
export const isPeriodLocked = (err) => attendanceErrorCode(err) === "PERIOD_LOCKED";
export const isHierarchyViolation = (err) => {
  const code = attendanceErrorCode(err);
  return code === "HIERARCHY_VIOLATION" || code === "EMPLOYEE_NOT_IN_TEAM";
};
export const isNotFound = (err) => {
  const code = attendanceErrorCode(err) || "";
  return code === "NOT_FOUND" || code.endsWith("_NOT_FOUND") || err?.status === 404;
};
/**
 * The punch already matched the server's state — a double-tap, a retry, or the
 * same person punching from another device. The backend answers 409 rather than
 * failing, every caller refetches `/today` straight after, and all three
 * messages end "Your status has been refreshed". Nothing went wrong, so the card
 * states it rather than showing a red failure.
 */
export const isStateReconciliation = (err) => {
  const code = attendanceErrorCode(err);
  return code === "ALREADY_CLOCKED_IN" || code === "NOT_CLOCKED_IN" || code === "NO_ACTIVE_BREAK";
};

/** The item was decided elsewhere (another approver, or a stale queue). */
export const isAlreadyProcessed = (err) => {
  const code = attendanceErrorCode(err);
  return code === "ALREADY_PROCESSED" || code === "COMP_OFF_NOT_EARNED";
};

export { ATTENDANCE_ERROR_MESSAGES };
