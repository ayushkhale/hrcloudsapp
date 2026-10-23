// ─────────────────────────────────────────────────────────────────────────────
// tasks.api.js — Task Assignment, the EMPLOYEE slice (#249–#254, #268–#270).
//
// PORTED from the web's src/shared/api/tasks.api.js (CLAUDE.md §10), trimmed to
// the planes an employee can call. The web file carries three planes; this app
// has one workspace and one of them:
//
//   /tasks/me          — any org member, own rows only (#249–#254)
//   /tasks/attachments — the two-mode S3 handshake, every member (#268–#270)
//
// The manager/hr planes (#255–#267 — delegate, review, govern) are deliberately
// ABSENT: an employee can't call them, and a capability the API won't grant is
// absent, not broken (CLAUDE.md §6). They arrive with the manager app, in its
// own api module, not behind a role check here.
//
// Contract traps carried over from the web file (its header has the long form):
//
// • QUERY KEYS ARE ALLOW-LISTED. Every list endpoint validates its query with
//   Joi and answers 400 VALIDATION_ERROR on an unknown key, so a typo blanks a
//   screen rather than being ignored. `qs()` already drops empties; this only
//   sends the keys #249 and #254 actually read.
//
// • `getMyTask` IS A WRITE. #250 stamps `first_viewed_at` and files a
//   FIRST_VIEWED audit line the first time the assignee opens the task — that
//   IS the feature ("I never saw it" is what it answers). Never call it to
//   prefetch or to refresh a list row; the row opens the detail and the detail
//   does the read.
//
// • `If-Match` IS THE CONCURRENCY TOKEN, not an ETag we read back. The server
//   takes either `String(task.version)` or the exact ISO `updated_at` and
//   answers 412 PRECONDITION_FAILED when stale. Optional on every write; we
//   always send it, so two people acting on one task can't both silently win.
//
// • COMMENTS TAKE NO `If-Match`, ON PURPOSE (#253, phase 4 §1.2). A comment is
//   an append-only child row; it never touches `tasks.version`. Sending a stale
//   version would turn a conversation into a 412.
//
// • `Idempotency-Key` on a comment is a Redis guard that replays the first
//   response for ~120s. A fresh uuid is minted per post, not per session.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from './client';
import { qs, seg } from './attendance.api';

/**
 * The deadline window the schedule's task-lane recovery asks for
 * (`2026-10-22_my_schedule_forward_view_api_delivery.md` §4.1). `due_from` /
 * `due_to` are whole calendar days in the response's zone, and `sort=due_date`
 * defaults to ASC with a stable tiebreaker. A deployment that predates these
 * four refuses the whole request with a 400 rather than ignoring them, which
 * is why the caller falls back to the plain list — see useAgenda.js.
 */
const DUE_WINDOW_FILTERS = ['due_from', 'due_to', 'sort', 'order'];

/** #249 GET /tasks/me — my work queue. */
const MY_FILTERS = ['status', 'priority', 'category', 'is_overdue', 'search', 'is_viewed', 'page', 'limit', ...DUE_WINDOW_FILTERS];

/**
 * The discussion feed's own query (#254). Its schema allow-lists these four
 * keys and answers 400 on anything else, so a stray `status` from a task list
 * would blank the thread — built apart from MY_FILTERS for exactly that reason.
 */
const COMMENT_FILTERS = ['page', 'limit', 'order', 'is_progress_update'];

const only = (params, allowed) => {
  const out = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    if (allowed.includes(key)) out[key] = value;
  });
  return out;
};

/**
 * The `If-Match` header for a task, from the row the user is looking at.
 * Accepts a task object, a version number or an ISO timestamp.
 */
export function ifMatch(revision) {
  if (revision === undefined || revision === null) return undefined;
  const value = typeof revision === 'object' ? (revision.version ?? revision.updated_at) : revision;
  if (value === undefined || value === null || value === '') return undefined;
  return { 'If-Match': String(value) };
}

// A fresh key per attempt — it only has to be unique for the 120s replay
// window. No crypto dependency; the app has no uuid library and doesn't need
// one for this.
const newIdempotencyKey = () => `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const write = (path, method, payload, headers) => request(path, {
  method,
  ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  ...(headers ? { headers } : {}),
});

export const tasksAPI = {
  // ── Self-service — /tasks/me (#249–#254) ────────────────────────────────────

  /** #249 GET /tasks/me — my work queue, nearest deadline first. */
  getMyTasks: (params = {}) => request(`/tasks/me${qs(only(params, MY_FILTERS))}`),

  /**
   * #250 GET /tasks/me/:id — the full briefing. NOT a plain read: the first
   * call stamps the read receipt. Only call it when the person opens the task.
   */
  getMyTask: (taskId) => request(`/tasks/me/${seg(taskId)}`),

  /** #251 PATCH /tasks/me/:id/status — only "pending" ⇄ "in_progress". */
  updateMyTaskStatus: (taskId, status, revision) =>
    write(`/tasks/me/${seg(taskId)}/status`, 'PATCH', { status }, ifMatch(revision)),

  /** #252 POST /tasks/me/:id/submit — hand deliverables to the reviewer. */
  submitMyTask: (taskId, payload, revision) =>
    write(`/tasks/me/${seg(taskId)}/submit`, 'POST', payload, ifMatch(revision)),

  /** #253 POST /tasks/me/:id/comments — say something on my own task. */
  postMyTaskComment: (taskId, payload) =>
    write(`/tasks/me/${seg(taskId)}/comments`, 'POST', payload, { 'Idempotency-Key': newIdempotencyKey() }),

  /** #254 GET /tasks/me/:id/comments — the thread, newest-first by `order`. */
  getMyTaskComments: (taskId, params = {}) =>
    request(`/tasks/me/${seg(taskId)}/comments${qs(only(params, COMMENT_FILTERS))}`),

  // ── Attachments — /tasks/attachments (#268–#270). Any org member. ───────────

  /**
   * #268 POST /tasks/attachments/upload-url — presigned PUT + staging token.
   * Pass `task_id` for a task that already exists (Mode B, the only mode an
   * employee needs: they attach to a task someone gave them, never to one
   * being created). `attachment_context` is 'submission' or 'comment'.
   */
  getTaskUploadUrl: (payload) => write('/tasks/attachments/upload-url', 'POST', payload),

  /** #269 POST /tasks/attachments/confirm — commit one uploaded file. */
  confirmTaskAttachment: (attachmentToken) =>
    write('/tasks/attachments/confirm', 'POST', { attachment_token: attachmentToken }),

  /** #270 GET /tasks/attachments/:id/download-url — short-lived (15 min) link. */
  getTaskAttachmentDownloadUrl: (attachmentId) =>
    request(`/tasks/attachments/${seg(attachmentId)}/download-url`),
};

export default tasksAPI;
