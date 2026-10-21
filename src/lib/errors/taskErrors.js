// ─────────────────────────────────────────────────────────────────────────────
// taskErrors.js — Typed `errorCode` values from the Task Assignment module
// (#249–#270) turned into plain English.
//
// PORTED from the web's src/shared/utils/taskErrors.js (CLAUDE.md §10), trimmed
// to the codes an employee can actually hit on the /tasks/me and
// /tasks/attachments planes. Same shape as documentErrors.js: a code we know
// wins, then the server's own message, then a generic line.
//
// Tasks use the `errorCode` key (the payroll/documents half of the gateway),
// not `code` — reading the wrong one gets `undefined` and a generic message for
// an error we have good copy for (see errors/index.js).
//
// Written for someone who doesn't work in HR (CLAUDE.md §6): each line says what
// to do next, never which invariant the server tripped on.
// ─────────────────────────────────────────────────────────────────────────────

const TASK_ERROR_MESSAGES = {
  // Feature gating / plan entitlement
  FEATURE_NOT_AVAILABLE: 'Tasks aren’t switched on for this organisation. Ask your administrator to turn them on.',
  MISSING_ORG_CONTEXT: 'Tasks are only available inside an organisation.',

  // Access
  FORBIDDEN: 'You don’t have authority to do this to this task.',
  TASK_NOT_FOUND: 'That task no longer exists, or it isn’t yours to open. Pull down to refresh the list.',

  // Lifecycle
  TASK_TERMINATED: 'This task is finished, so it can’t be changed any more.',
  TASK_COMPLETED: 'This task has already been marked done.',
  INVALID_STATUS_TRANSITION: 'That isn’t possible at this stage of the task. Refresh to see where it stands now.',
  PRECONDITION_FAILED: 'Somebody else changed this task while you had it open. It’s been refreshed — check it and try again.',

  // Attachments
  ATTACHMENT_LIMIT_EXCEEDED: 'This task already has 20 files, which is the most it can hold. Remove one before adding another.',
  INVALID_ATTACHMENT_TOKEN: 'That upload expired before it was saved. Choose the file again.',
  INVALID_ATTACHMENT_ID: 'One of those files isn’t on this task any more. Refresh and attach it again.',
  ATTACHMENT_NOT_FOUND_IN_STORAGE: 'The file didn’t finish uploading. Choose it again.',
  ATTACHMENT_NOT_FOUND: 'That file isn’t there any more.',
  INVALID_ATTACHMENT: 'One of those files isn’t on this task any more. Refresh and attach it again.',
  STORAGE_SERVICE_UNAVAILABLE: 'File storage isn’t responding right now. Try again in a few minutes.',

  // The discussion (#253). The rate limit's own line is generic on purpose —
  // `commentRateLimitMessage` says the actual wait when the server tells us one.
  TOO_MANY_COMMENTS: 'You’ve posted a lot on this task in the last hour. Wait a few minutes, then try again.',
};

export const taskErrorCode = (err) => err?.data?.errorCode || err?.data?.error_code || '';

/**
 * A friendly, actionable message for a rejected task request.
 * @param {unknown} err  error thrown by `request()` (carries `.data.errorCode`)
 * @param {string} [fallback]
 */
export function taskErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const code = taskErrorCode(err);
  if (code && TASK_ERROR_MESSAGES[code]) return TASK_ERROR_MESSAGES[code];
  if (err?.status === 401) return 'Your session has expired. Please sign in again.';
  if (err?.status >= 500) return 'The server ran into a problem. Please try again shortly.';
  const message = typeof err?.message === 'string' ? err.message : '';
  if (message && !err?.isGenericMessage && !/^Request failed\b/.test(message)) return message;
  return fallback;
}

/** The organisation's plan doesn't include tasks — show the feature notice, not an error. */
export const isTaskFeatureDisabled = (err) => {
  const code = taskErrorCode(err);
  return code === 'FEATURE_NOT_AVAILABLE' || code === 'MISSING_ORG_CONTEXT';
};

/**
 * Someone else wrote to this task first (412). The caller reloads the record
 * and keeps the screen as it is, rather than losing what the user typed.
 */
export const isTaskStale = (err) => taskErrorCode(err) === 'PRECONDITION_FAILED' || err?.status === 412;

/** Too many comments on this task in the current hour (429, EC-T12). */
export const isCommentRateLimited = (err) =>
  taskErrorCode(err) === 'TOO_MANY_COMMENTS' || err?.status === 429;

/**
 * The rate-limit refusal with the wait in it, when the server said how long.
 * Rounded UP to the next whole minute: "wait 1 minute" and then being refused
 * again is worse than waiting two.
 */
export function commentRateLimitMessage(err) {
  const data = err?.data || {};
  const seconds = Number(
    data.retry_after_seconds
    ?? data.details?.retry_after_seconds
    ?? data.data?.retry_after_seconds,
  );
  if (!Number.isFinite(seconds) || seconds <= 0) return TASK_ERROR_MESSAGES.TOO_MANY_COMMENTS;
  const minutes = Math.ceil(seconds / 60);
  return `You’ve reached the limit of 30 comments an hour on this task. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export { TASK_ERROR_MESSAGES };
