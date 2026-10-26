// ─────────────────────────────────────────────────────────────────────────────
// features/notifications/notifications.data.js — the inbox, real API.
//
// Was placeholder in-memory data; now a thin wrapper over
// `notificationsAPI` (api/notifications.api.js). Backend contract:
// public/md_notifications/notification_api_contract.md.
//
// The engine ships behind a kill switch. A 503 `FEATURE_DISABLED` means the
// bell icon and the whole screen quietly hide (CLAUDE.md §3) — this module
// exposes `isFeatureDisabledError()` so callers can tell that apart from a
// real failure.
//
// ── THE SHAPE WE RENDER AGAINST ──────────────────────────────────────────────
//
//   id          UUID
//   event_key   e.g. "leave.approved" — the catalog key (icon fallback)
//   category    one of CATEGORIES below (drives filter strip and tone)
//   title       one line
//   message     the full display-ready text (names/dates interpolated)
//   actor_name  who did the thing, or null
//   metadata    { screen, id, event_key, ... } — the deep-link target
//   is_read     boolean
//   read_at     ISO or null
//   created_at  ISO
//
// ── CATEGORIES ───────────────────────────────────────────────────────────────
//
// The server's catalog has eight: leave, attendance, payroll, task, document,
// shift, employee, system. The filter strip only lists the ones the employee
// app actually surfaces today; the rest still render (via `metaFor`'s
// fallback) when they arrive, so adding a new category server-side never
// breaks the screen.
//
// ── BADGE / INBOX RE-READ ───────────────────────────────────────────────────
//
// `subscribeInbox(cb)` fires whenever something here changes the unread set:
// a successful mark-read, a dismiss, a mark-all, or a cached count update
// from a push. AppTopBar's bell uses it so the dot clears without a reload.
// ─────────────────────────────────────────────────────────────────────────────

import { notificationsAPI } from '../../api';

/** The filter strip, in order. `all` is not a category — it is the absence of one. */
export const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'leave', label: 'Leave' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'task', label: 'Tasks' },
  { value: 'document', label: 'Documents' },
];

/**
 * category → semantic icon from theme/icons.js plus the tone key from
 * theme/tokens.js. The catalog's keys (`leave`, `attendance`, `payroll`,
 * `task`, `document`, `shift`, `employee`, `system`) each resolve; anything
 * else falls through `metaFor`.
 */
export const CATEGORY_META = {
  leave: { icon: 'calendar', tone: 'purple', label: 'Leave' },
  attendance: { icon: 'clock', tone: 'purple', label: 'Attendance' },
  payroll: { icon: 'rupee', tone: 'purple', label: 'Payroll' },
  task: { icon: 'clipboardCheck', tone: 'purple', label: 'Task' },
  document: { icon: 'document', tone: 'purple', label: 'Document' },
  shift: { icon: 'clock', tone: 'purple', label: 'Shift' },
  employee: { icon: 'user', tone: 'purple', label: 'Employee' },
  system: { icon: 'info', tone: 'purple', label: 'Announcement' },
};

export const metaFor = (category) => CATEGORY_META[category] || CATEGORY_META.system;

/* ── 503 FEATURE_DISABLED helper ────────────────────────────────────────────
   Every endpoint answers 503 { errorCode: 'FEATURE_DISABLED' } when the kill
   switch is off — the client hides the UI rather than erroring. */

export function isFeatureDisabledError(err) {
  if (!err) return false;
  const code = err?.data?.errorCode || err?.errorCode || '';
  return err?.status === 503 && code === 'FEATURE_DISABLED';
}

/* ── Local cache for the bell badge ─────────────────────────────────────────
   The screen is the source of truth for the list; the badge needs a cheap
   synchronous read for first paint and a subscription so a mutation here
   clears it without a round trip. */

let cachedUnread = 0;
let cachedIsCapped = false;
let cachedDisabled = false;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => {
    try { fn({ unread: cachedUnread, isCapped: cachedIsCapped, disabled: cachedDisabled }); }
    catch (err) { if (__DEV__) console.error('[notifications] listener failed', err); }
  });
}

export function subscribeInbox(cb) {
  listeners.add(cb);
  cb({ unread: cachedUnread, isCapped: cachedIsCapped, disabled: cachedDisabled });
  return () => listeners.delete(cb);
}

export function cachedUnreadCount() {
  return { unread: cachedUnread, isCapped: cachedIsCapped, disabled: cachedDisabled };
}

/** Hint from a push: a new notification just arrived; bump the badge. */
export function bumpUnread(by = 1) {
  cachedUnread += by;
  cachedDisabled = false;
  emit();
}

/* ── API-backed reads ───────────────────────────────────────────────────── */

/**
 * @param {{ category?: string, page?: number, limit?: number, is_read?: boolean, signal?: AbortSignal }} params
 * @returns {Promise<{ items: object[], pagination: object, disabled: boolean }>}
 */
export async function listNotifications(params = {}) {
  const query = { page: 1, limit: 20, ...params };
  if (query.category === 'all') delete query.category;
  try {
    const res = await notificationsAPI.listNotifications(query);
    const data = res?.data ?? res ?? {};
    cachedDisabled = false;
    return {
      items: Array.isArray(data.items) ? data.items : [],
      pagination: data.pagination || { page: 1, limit: query.limit, total: 0, total_pages: 1 },
      disabled: false,
    };
  } catch (err) {
    if (isFeatureDisabledError(err)) {
      cachedDisabled = true;
      cachedUnread = 0;
      cachedIsCapped = false;
      emit();
      return { items: [], pagination: { page: 1, limit: query.limit, total: 0, total_pages: 1 }, disabled: true };
    }
    throw err;
  }
}

/** Refresh the bell badge from the server. */
export async function refreshUnreadCount(options) {
  try {
    const res = await notificationsAPI.getUnreadCount(options);
    const data = res?.data ?? res ?? {};
    cachedUnread = Number(data.unread_count) || 0;
    cachedIsCapped = !!data.is_capped;
    cachedDisabled = false;
    emit();
    return { unread: cachedUnread, isCapped: cachedIsCapped, disabled: false };
  } catch (err) {
    if (isFeatureDisabledError(err)) {
      cachedUnread = 0;
      cachedIsCapped = false;
      cachedDisabled = true;
      emit();
      return { unread: 0, isCapped: false, disabled: true };
    }
    throw err;
  }
}

/**
 * Mark one read, update the local cache. Idempotent on the server, so a
 * second call does not drive the badge negative.
 */
export async function markRead(id, options) {
  try {
    await notificationsAPI.markRead(id, options);
  } catch (err) {
    if (isFeatureDisabledError(err)) return;
    throw err;
  }
  if (cachedUnread > 0) {
    cachedUnread -= 1;
    emit();
  }
}

/** Mark everything read in the server's "as of now" watermark. Clears the badge. */
export async function markAllRead(options) {
  try {
    const res = await notificationsAPI.markAllRead(options);
    const updated = Number(res?.data?.updated_count) || 0;
    cachedUnread = 0;
    cachedIsCapped = false;
    emit();
    return updated;
  } catch (err) {
    if (isFeatureDisabledError(err)) return 0;
    throw err;
  }
}

/** Dismiss (hard delete). A second DELETE returns 404 — treat as success. */
export async function dismiss(id, options) {
  try {
    await notificationsAPI.dismiss(id, options);
  } catch (err) {
    if (isFeatureDisabledError(err)) return;
    if (err?.status === 404) return;
    throw err;
  }
}

/** For the push handler: a fresh notification arrived — nudge the badge. */
export function onPushReceived() {
  bumpUnread(1);
}
