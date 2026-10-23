// ─────────────────────────────────────────────────────────────────────────────
// api/notifications.api.js — PUSH DEVICES. The phones a notification can reach.
//
// Contract: NativeRef/10-api/06-location-requests.md §1, from the backend's
// 2026-10-23 on-demand location tracking guides.
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
//   /notifications/devices       THIS. An FCM token, so the server can WAKE
//                                this handset. No enrollment, no OTP, no
//                                screen — it is registered silently at sign-in
//                                and dropped at sign-out.
//
// A person can have a trusted device with no push token (notifications denied)
// and a push token with no trusted device (an org that doesn't enforce device
// trust). Neither implies the other, and neither id means anything to the
// other endpoint.
//
// ── WHY IT MATTERS THAT THIS RUNS AT LOGIN ───────────────────────────────────
//
// It is a HARD PREREQUISITE for on-demand location tracking: a locate against
// an employee with no active push device fails `422 NO_ACTIVE_DEVICE` on the
// requester's side, and the employee sees nothing at all — no error, no
// prompt, just HR being told the phone is unreachable. So registration is
// fire-and-forget but it is NOT optional, and it re-runs on every token
// refresh (features/notifications/pushDevice.js).
//
// Re-registering the same token UPSERTS — it does not pile up duplicates — so
// calling this more often than strictly necessary is safe and is the right
// trade against a stale token.
//
// The token and its hash are NEVER returned by any of these. Don't build
// anything that needs to read one back.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from './client';
// seg() lives in attendance.api.js and is re-exported from the barrel — one
// URI-encoder for the whole API surface, not a second copy here.
import { seg } from './attendance.api';

const post = (path, payload) =>
  request(path, payload === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(payload) });

export const notificationsAPI = {
  /**
   * Register (or re-register) this handset for push. → 201.
   *
   * body: { platform, push_token, device_name?, app_version? }
   *   platform    'android' | 'ios'  ('web' exists on the API, not here)
   *   push_token  the FCM registration token, 1–8192 chars
   *   device_name ≤100 chars — what a person would recognise, e.g. "Pixel 8"
   *   app_version ≤50 chars
   *
   * Returns the device WITHOUT the token: { id, platform, device_name,
   * app_version, is_active, last_seen_at, last_push_at, created_at }. Keep the
   * `id` — it is the only thing `deregister` takes.
   */
  registerDevice: (payload) => post('/notifications/devices', payload),

  /** My active push devices. No tokens in the rows. */
  getMyDevices: () => request('/notifications/devices'),

  /**
   * Unbind a handset, so nothing is pushed to it any more. Called at SIGN-OUT:
   * a logged-out phone that still receives location requests would answer them
   * with the next person's session, or with none.
   */
  deregisterDevice: (id) => request(`/notifications/devices/${seg(id)}`, { method: 'DELETE' }),
};

export default notificationsAPI;
