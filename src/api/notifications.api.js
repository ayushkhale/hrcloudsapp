// ─────────────────────────────────────────────────────────────────────────────
// api/notifications.api.js — PUSH DEVICES and the IN-APP INBOX.
//
// Two surfaces, both under /notifications. The devices half tells the server
// which handsets can be woken; the inbox half is the engine's REST feed and
// badge. Both ship behind `NOTIFICATION_ENGINE_ENABLED` — a 503
// `FEATURE_DISABLED` means "hide the bell", not "error" (CLAUDE.md §3).
//
// Contract source: public/md_notifications/notification_api_contract.md and
// 2026-10-24_notification_inbox_apis_and_push_payload.md.
//
// ── THIS IS NOT features/devices ─────────────────────────────────────────────
//
// Two different things are called "my devices" on this API and confusing them
// costs an afternoon:
//
//   /attendance/trusted-devices  DEVICE TRUST. A Keystore credential that
//                                SIGNS a punch, enrolled with an OTP, shown on
//                                the "My Registered Devices" screen, revocable
//                                for good. features/devices/*.
//   /notifications/devices       An FCM token, so the server can WAKE this
//                                handset. No enrollment, no OTP, no screen —
//                                it is registered silently at sign-in and
//                                dropped at sign-out.
//
// Re-registering the same token UPSERTS. Everything here is scoped to the
// caller; a notification id that is not theirs answers 404, never 403 — the
// caller learns nothing about whether the row exists elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from './client';
import { qs, seg } from './attendance.api';

const post = (path, payload, options) =>
  request(path, {
    method: 'POST',
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    ...(options?.signal ? { signal: options.signal } : {}),
  });

const patch = (path, options) =>
  request(path, {
    method: 'PATCH',
    body: JSON.stringify({}),
    ...(options?.signal ? { signal: options.signal } : {}),
  });

/** Allow-listed inbox query keys. The server answers 400 on anything else. */
const INBOX_FILTERS = ['page', 'limit', 'is_read', 'category'];
const only = (params, keys) => keys.reduce((out, k) => {
  if (params?.[k] !== undefined && params[k] !== null && params[k] !== '') out[k] = params[k];
  return out;
}, {});

export const notificationsAPI = {
  // ── Devices ────────────────────────────────────────────────────────────────

  /**
   * Register (or re-register) this handset for push. → 201.
   *
   * body: { platform, push_token, device_name?, app_version? }
   *   platform    'android' | 'ios'
   *   push_token  the FCM registration token
   *   device_name ≤100 chars — what a person would recognise
   *   app_version ≤50 chars
   */
  registerDevice: (payload) => post('/notifications/devices', payload),

  /** My active push devices. No tokens in the rows. */
  getMyDevices: () => request('/notifications/devices'),

  /**
   * Unbind a handset so nothing is pushed to it any more. Called at SIGN-OUT.
   */
  deregisterDevice: (id) => request(`/notifications/devices/${seg(id)}`, { method: 'DELETE' }),

  // ── Inbox ──────────────────────────────────────────────────────────────────

  /**
   * Paginated feed, newest first (created_at DESC, id DESC — the id tiebreaker
   * is what stops page 2 repeating or skipping a row shared microseconds).
   *
   * @param {{page?: number, limit?: number, is_read?: boolean, category?: string, signal?: AbortSignal}} params
   */
  listNotifications: (params = {}) =>
    request(`/notifications${qs(only(params, INBOX_FILTERS))}`, {
      ...(params.signal ? { signal: params.signal } : {}),
    }),

  /**
   * Bell badge. Capped at NOTIFICATION_UNREAD_COUNT_CAP (default 100) — read
   * `is_capped` and render "99+" when true, do not treat it as the exact count.
   */
  getUnreadCount: (options) =>
    request('/notifications/unread-count', { ...(options?.signal ? { signal: options.signal } : {}) }),

  /** Mark one notification read. Idempotent — second call still returns 200. */
  markRead: (id, options) => patch(`/notifications/${seg(id)}/read`, options),

  /**
   * Mark every unread notification read, bounded to those created up to now so
   * a notice that arrives mid-request is not silently swallowed.
   */
  markAllRead: (options) => patch('/notifications/mark-all-read', options),

  /** Hard-delete a notification. Dismiss is permanent. */
  dismiss: (id, options) =>
    request(`/notifications/${seg(id)}`, {
      method: 'DELETE',
      ...(options?.signal ? { signal: options.signal } : {}),
    }),
};

export default notificationsAPI;
