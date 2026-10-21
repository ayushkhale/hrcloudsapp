// ─────────────────────────────────────────────────────────────────────────────
// features/tasks/taskMeta.js — the rules and words My Tasks shares.
//
// PORTED, NOT INVENTED (CLAUDE.md §10). Every function here has a counterpart in
// the web's src/shared/tasks/taskMeta.js and keeps its name and behaviour:
//
//   personNameOrNA / personInSentence   ← taskMeta.js
//   TASK_PRIORITY / TASK_CATEGORY        ← taskMeta.js (labels VERBATIM)
//   isTaskTerminal / isTaskOverdue /     ← taskMeta.js (the lifecycle predicates
//   wasTaskExtended / canChangeOwnStatus   that decide which buttons show)
//   nextOwnStatus / canSubmitTask / isAwaitingReview / canCommentOnTask
//   TASK_LIMITS / linkProblem / cleanLinks / formatFileSize
//   attachmentContextLabel / parseSystemComment
//
// Status LABELS and TONES are NOT here — they live in lib/enums.js (`task` kind),
// read through `statusMeta('task', status)` and drawn by <StatusBadge kind="task" />.
// A second status registry in a feature folder is how the web ended up with
// eight badges that disagreed (CLAUDE.md §5).
//
// Contract traps baked in (the web file's header has the long form):
//
// • `is_overdue` IS COMPUTED BY THE SERVER PER REQUEST. List rows carry it; a
//   row we just wrote locally may not, so `isTaskOverdue` trusts the field and
//   falls back to the same rule the server uses, so a freshly-approved row
//   doesn't flash back to "overdue".
//
// • THE ASSIGNEE ONLY EVER MOVES BETWEEN "pending" AND "in_progress" (#251).
//   Everything else is a submission or the reviewer's doing. A task in
//   `in_review` is frozen for the assignee (409), so the screen must not offer a
//   status control there.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeStatusKey, humanize } from '../../lib/enums';
import { personName } from '../../lib/normalize';

/**
 * A person summary (`{ id, name, email }`) as a name. The task endpoints embed
 * these, so no roster lookup is needed — an absent person is "N/A" rather than
 * personName's "Unknown employee", which would claim a fact the server didn't
 * give us (CLAUDE.md §4).
 */
export const personNameOrNA = (entity) => (entity ? personName(entity) : 'N/A');

/**
 * The same person, for use INSIDE a sentence. "N/A" is right in a labelled field
 * and wrong in prose — "waiting on N/A" — so an absent person reads as a role.
 */
export const personInSentence = (entity, fallback = 'this person') => (entity ? personName(entity) : fallback);

// ── Priority ──────────────────────────────────────────────────────────────────
// No tone of its own (CLAUDE.md §5): urgency is the word, and the overdue chip.
export const TASK_PRIORITY = {
  low: { label: 'Low' },
  medium: { label: 'Medium' },
  high: { label: 'High' },
  urgent: { label: 'Urgent' },
};
export const taskPriorityLabel = (priority) =>
  TASK_PRIORITY[normalizeStatusKey(priority)]?.label || humanize(priority) || 'N/A';

// ── Category ──────────────────────────────────────────────────────────────────
// "operational" and "administrative" are the API's words, not words anybody
// says out loud, so the screen shows what the category is for instead (§6).
export const TASK_CATEGORY = {
  operational: { label: 'Day-to-day work' },
  compliance: { label: 'Rules & compliance' },
  onboarding: { label: 'Joining a new person' },
  administrative: { label: 'Office admin' },
  general: { label: 'Anything else' },
};
export const taskCategoryLabel = (category) =>
  TASK_CATEGORY[normalizeStatusKey(category)]?.label || humanize(category) || 'N/A';

// ── State questions ─────────────────────────────────────────────────────────
export const TERMINAL_TASK_STATUSES = ['completed', 'cancelled'];
export const isTaskTerminal = (task) => TERMINAL_TASK_STATUSES.includes(normalizeStatusKey(task?.status));

/**
 * Past its deadline and not finished. The server sends `is_overdue` on every
 * list row and detail; this recomputes it only when the field is absent (a row
 * we just wrote, or a trimmed response), using the server's own rule.
 */
export function isTaskOverdue(task) {
  if (typeof task?.is_overdue === 'boolean') return task.is_overdue;
  if (!task?.due_date || isTaskTerminal(task)) return false;
  const due = new Date(task.due_date).getTime();
  return Number.isFinite(due) && due < Date.now();
}

/** The deadline has been moved at least once (#263 keeps the original). */
export const wasTaskExtended = (task) =>
  Number(task?.extension_count || 0) > 0
  && !!task?.original_due_date
  && task.original_due_date !== task.due_date;

/** The assignee may flip between "not started" and "being worked on" (#251). */
export const canChangeOwnStatus = (task) => ['pending', 'in_progress'].includes(normalizeStatusKey(task?.status));

/** The status the assignee's one button moves the task to, or null. */
export function nextOwnStatus(task) {
  const key = normalizeStatusKey(task?.status);
  if (key === 'pending') return 'in_progress';
  if (key === 'in_progress') return 'pending';
  return null;
}

/** Deliverables may be handed over from "being worked on" or "changes requested" (#252). */
export const canSubmitTask = (task) => ['in_progress', 'reopened'].includes(normalizeStatusKey(task?.status));

/** Waiting on a reviewer (#259/#260). */
export const isAwaitingReview = (task) => normalizeStatusKey(task?.status) === 'in_review';

/**
 * Whether anything more can be said on this task (EC-T23). CANCELLED IS THE ONLY
 * LOCK — a COMPLETED task stays open to comment on purpose, so a handover note
 * can still be written after sign-off. Reading the thread is never blocked.
 */
export const canCommentOnTask = (task) => normalizeStatusKey(task?.status) !== 'cancelled';

/** Rework has gone round enough times to be worth saying out loud (#260). */
export const EXCESSIVE_REWORK_CYCLES = 5;
export const hasExcessiveRework = (task) => Number(task?.rework_count || 0) >= EXCESSIVE_REWORK_CYCLES;

// ── Limits the server enforces, so the form can enforce them first ────────────
export const TASK_LIMITS = Object.freeze({
  SUBMISSION_NOTE_MIN: 10,
  SUBMISSION_NOTE_MAX: 2000,
  SUBMISSION_LINKS_MAX: 5,
  COMMENT_MAX: 2000,
  COMMENT_LINKS_MAX: 5,
  LINK_LABEL_MAX: 100,
  LINK_URL_MAX: 1000,
  // One page of the feed. The server caps `limit` at 100.
  COMMENTS_PER_PAGE: 50,
});

/** An external link row the server will accept, or a reason it won't. */
export function linkProblem({ label, url }) {
  const name = String(label || '').trim();
  const href = String(url || '').trim();
  if (!name && !href) return '';
  if (!name) return 'Give the link a name.';
  if (!href) return 'Paste the link’s address.';
  if (!/^https:\/\/\S+$/i.test(href)) return 'Links have to start with https://';
  if (href.length > TASK_LIMITS.LINK_URL_MAX) return 'That address is too long.';
  if (name.length > TASK_LIMITS.LINK_LABEL_MAX) return 'That name is too long.';
  return '';
}

/** Drop the blank rows and trim what's left — what the API wants to receive. */
export const cleanLinks = (rows) => (rows || [])
  .map(({ label, url }) => ({ label: String(label || '').trim(), url: String(url || '').trim() }))
  .filter((row) => row.label && row.url);

/** A readable file size for an attachment row. */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return 'N/A';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Where an attachment came from (#269 `attachment_context`). */
export const ATTACHMENT_CONTEXT_LABELS = {
  briefing: 'From the brief',
  submission: 'Handed in',
  comment: 'From the discussion',
};
export const attachmentContextLabel = (context) =>
  ATTACHMENT_CONTEXT_LABELS[normalizeStatusKey(context)] || humanize(context) || 'Attached';

/**
 * The automated notes #260/#261/#262 write into the thread, keyed by the exact
 * prefix the server stamps on them. A screen never shows "REWORK REQUESTED:"
 * (§4, §6) — it shows the human words, with the message underneath. An
 * unrecognised prefix still renders, as a plain system note.
 */
const SYSTEM_COMMENT_PREFIXES = [
  { prefix: 'REWORK REQUESTED:', label: 'Sent back for changes' },
  { prefix: 'TASK REASSIGNED:', label: 'Handed to someone else' },
  { prefix: 'TASK CANCELLED:', label: 'Called off' },
];

/** A system note split into what happened and what was said about it. */
export function parseSystemComment(message) {
  const text = String(message || '').trim();
  const match = SYSTEM_COMMENT_PREFIXES.find((entry) => text.toUpperCase().startsWith(entry.prefix));
  if (!match) return { label: 'System note', body: text };
  return { label: match.label, body: text.slice(match.prefix.length).trim() };
}
