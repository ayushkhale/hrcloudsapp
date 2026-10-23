// ─────────────────────────────────────────────────────────────────────────────
// features/notifications/pushDevice.js — this handset's push registration.
//
// The server cannot wake a phone it has never been told about. Registering the
// FCM token is a HARD PREREQUISITE for on-demand location tracking: a locate
// against somebody with no active push device fails `422 NO_ACTIVE_DEVICE` on
// the requester's screen, and the employee sees absolutely nothing — so this
// failing quietly looks exactly like the employee refusing to answer.
//
// Two calls, and both are fire-and-forget by design:
//
//   registerThisDevice()    at sign-in, and again on every FCM token rotation
//   deregisterThisDevice()  at sign-out, BEFORE the token is cleared
//
// ── WHY IT IS FIRE-AND-FORGET, AND WHAT THAT COSTS ──────────────────────────
//
// Push is not a feature the person asked for and it is never the reason they
// opened the app. A failed registration must not stop a sign-in, show a toast
// or block the shell — somebody standing at a gate about to clock in does not
// need to hear that a notification route is down. So every path here resolves,
// never rejects, and logs in __DEV__ only.
//
// The cost is that a registration can silently not have happened. That is why
// it re-runs on every sign-in and every token refresh rather than once ever:
// re-posting the same token UPSERTS (api/notifications.api.js), so the cheap
// fix for "it might have failed" is to do it again.
//
// ── THE ID IS KEPT PER USER, NOT PER PHONE ──────────────────────────────────
//
// `deregisterDevice` takes the server's device id, which only comes back from
// the registration, so it is remembered on the phone. Keyed by user id for the
// same reason features/devices/deviceKey.js is: two people share a handset,
// and signing B out must not unbind A's row. The user id is read from the live
// access token rather than passed in, so no caller has to plumb it — which
// matters at sign-out, where `endSession` has already begun tearing the
// session down.
//
// NOT A SECRET. The device id identifies a row, not a credential; the push
// token itself is never stored here and never returned by the API. AsyncStorage
// is the right home — the Keychain is for the bearer token and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodeJWT, getToken, notificationsAPI } from '../../api';
import { ENV } from '../../config/env';
import { suggestedDeviceName } from '../devices/deviceKey';
import { THIS_PLATFORM } from '../devices/deviceMeta';

const TAG = '[push-device]';
const keyFor = (userId) => `hrclouds.pushDevice.v1:${userId}`;

/** Who the live token belongs to, or null. Read, never passed in — see the header. */
function currentUserId() {
  const claims = decodeJWT(getToken());
  return claims?.id || claims?.sub || null;
}

/**
 * Tell the server this handset can be woken.
 *
 * @param {string} token  the FCM registration token
 * @returns {Promise<string|null>} the server's device id, or null if it didn't land
 */
export async function registerThisDevice(token) {
  if (!token) return null;
  const userId = currentUserId();
  if (!userId) return null; // not signed in — nothing to attach the device to

  try {
    const res = await notificationsAPI.registerDevice({
      platform: THIS_PLATFORM,
      push_token: token,
      // Reused, not re-derived: "Samsung SM-S918B" is already what the trusted
      // -device screen prefills, and two names for one phone is a bug (§10).
      device_name: suggestedDeviceName().slice(0, 100),
      app_version: String(ENV.APP_VERSION || '').slice(0, 50),
    });
    const id = res?.data?.id || res?.id || null;
    if (id) await AsyncStorage.setItem(keyFor(userId), JSON.stringify({ id })).catch(() => {});
    if (__DEV__) console.log(`${TAG} registered:`, id || '(no id returned)');
    return id;
  } catch (err) {
    // An older gateway has no /notifications route at all. That is ABSENT, not
    // broken (CLAUDE.md §6): location requests simply never arrive, and
    // nothing else in the app depends on this.
    if (__DEV__) console.warn(`${TAG} registration failed:`, err?.message || err);
    return null;
  }
}

/**
 * Unbind this handset. MUST be awaited before the access token is cleared —
 * `request()` reads the token synchronously on its way to the fetch, so a
 * sign-out that clears first sends an unauthenticated DELETE.
 *
 * Carries its own ceiling so a dead network cannot hold a sign-out open: after
 * it, the local id is dropped anyway and the server's row is left to expire.
 * A stale row is a wasted push, not a leak — the next person to sign in on
 * this handset registers their own, and the token is scoped to the app, not to
 * the account.
 *
 * @returns {Promise<void>} always resolves
 */
export async function deregisterThisDevice() {
  const userId = currentUserId();
  if (!userId) return;
  const key = keyFor(userId);

  let id = null;
  try {
    const raw = await AsyncStorage.getItem(key);
    id = raw ? JSON.parse(raw)?.id : null;
  } catch {
    id = null;
  }

  // Dropped FIRST, and whatever the request does. A local id pointing at a row
  // we failed to delete is worse than no id: the next sign-out would try the
  // same dead call again.
  AsyncStorage.removeItem(key).catch(() => {});
  if (!id) return;

  try {
    await Promise.race([
      notificationsAPI.deregisterDevice(id),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    if (__DEV__) console.log(`${TAG} deregistered:`, id);
  } catch (err) {
    if (__DEV__) console.warn(`${TAG} deregistration failed:`, err?.message || err);
  }
}

export default { registerThisDevice, deregisterThisDevice };
