// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/liveLocation.js — answering an on-demand location request.
//
// Spec: NativeRef/10-api/06-location-requests.md. Read it before changing this.
//
// HR, or a reporting manager for their own reports, asks where somebody is
// during an open shift. The ask arrives as a SILENT FCM DATA PUSH
// ({ action: 'REQUEST_LOCATION', requestId, expiresAt }); this file takes ONE
// fresh fix and posts it back. The requester polls for it. That is all.
//
//   push → transparency notification → one GPS fix → POST live-ping
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
//
// Not tracking. No background location service, no watchPosition, no queue of
// fixes to upload later — one push, one fix, done. And ZERO TAPS: the employee
// approves nothing mid-shift. Do not add a confirm "for privacy"; the privacy
// is the notification below and the audit trail in My Time › Location checks.
//
// ── THE TRAPS, EACH OF WHICH HAS ALREADY BEEN WRITTEN WRONG ONCE IN A DRAFT ──
//
//   1. HEADLESS CONTEXT. From the background/quit handler this runs in a fresh
//      JS context: module state is empty, so the in-memory token is empty and
//      every call would 401. `loadSession()` reads the Keychain and primes it.
//      The entry is AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, so it is readable with
//      the screen locked once the phone has been unlocked since boot.
//
//   2. NOT `getPunchLocation()`. That takes a cached fix up to 60s old so the
//      Clock in button doesn't spin — right for a punch, and exactly what trips
//      the server's `stale_fix` signal here. `getFreshLocation()` is its
//      `maximumAge: 0` sibling in the same module.
//
//   3. `captured_at` IS THE HARDWARE TIMESTAMP. Never `Date.now()`: a device
//      clock skewed ~2 min from UTC then trips `future_fix`/`stale_fix`, and
//      "correcting" it is how you cause that.
//
//   4. `is_mock` IS REPORTED HONESTLY. The server records it and does not
//      reject on it — same rule as a punch.
//
//   5. 404 and 409 ARE DEAD ENDS (unknown request / TTL elapsed or already
//      answered). Never retried. Anything else gets ONE retry while the request
//      is still live — a successful re-post of the same request_id is
//      idempotent, so a retry can never double-count.
//
// ── THE NOTIFICATION IS A REQUIREMENT, NOT A NICETY ──────────────────────────
//
// The push has no `notification` block, by design, so the OS shows nothing on
// its own. The employee is told every time, before the fix is taken. The
// wording is REQUESTED, never "verified" (nothing is verified — the server can
// test plausibility, not truth), and never "HR has…": the push does not say
// who asked, and the audit trail does. A failed notification does not stop the
// fix — the request is already in flight on the requester's screen.
//
// ── battery_level IS DELIBERATELY NOT SENT ───────────────────────────────────
//
// It is optional in the contract and needs react-native-device-info. One more
// native dependency for one optional integer is a poor trade. Not forgotten.
//
// ── THE NOTICE ───────────────────────────────────────────────────────────────
//
// Where the org's policy is in `acknowledgement` mode, every locate fails
// `422 EMPLOYEE_CONSENT_PENDING` until the person has acknowledged once. The
// app CANNOT read the mode (the policy GET is HR-only), so the section always
// shows the notice and posts the acknowledgement when tapped — harmless in
// `notice_only`. The flag is also kept on the phone, per user, so the notice
// doesn't ask again on every open; the version string lives here, once.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { attendanceAPI, getToken } from '../../api';
import { loadSession } from '../../state/session';
import { getFreshLocation, GEO_STATUS } from '../../lib/location';
import { THIS_PLATFORM } from '../devices/deviceMeta';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../lib/events';

const TAG = '[live-location]';
const ACTION = 'REQUEST_LOCATION';
const CHANNEL_ID = 'attendance_location_channel';

/** The notice text's version. Bump it with the wording and everyone is asked again. */
export const LOCATION_NOTICE_VERSION = 'v1';

// The same request can reach us twice (a foreground message racing a resumed
// app). One fix per request is the whole contract.
const inFlight = new Set();

/** Is this FCM message an on-demand location request? */
export const isLocationRequest = (msg) => msg?.data?.action === ACTION;

const isDeadEnd = (err) => err?.status === 404 || err?.status === 409;
const isLive = (expiresAt) => {
  const t = new Date(expiresAt).getTime();
  // No or unreadable expiry: let the server decide — it answers 409 if late.
  return !Number.isFinite(t) || t > Date.now();
};

export async function notifyRequested(requestId) {
  try {
    // REQUIRED LAZILY, NEVER AT MODULE SCOPE. @notifee/react-native throws from
    // its constructor the moment it is imported on a build where the native
    // module isn't linked ("Notifee native module not found"). This file is
    // pulled in by index.js at app BOOT (push.js → here), so a top-level import
    // would crash the whole app on launch on any build predating the notifee
    // rebuild — not merely make this one feature a no-op. The require lives
    // inside this try so that same "not linked" case is caught and logged, and
    // the fix below is still taken and reported.
    const notifee = require('@notifee/react-native').default;
    const { AndroidImportance } = require('@notifee/react-native');
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Location requests',
      importance: AndroidImportance.HIGH,
    });
    await notifee.displayNotification({
      id: requestId ? `location_${requestId}` : 'location_check',
      title: 'Location requested',
      body: 'Your workplace has requested your current location.',
      data: {
        type: 'location_check',
        section: 'locationChecks',
        requestId: requestId || '',
      },
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default' },
      },
    });
  } catch (err) {
    // Before the native rebuild notifee isn't linked. Never a reason to drop the fix.
    if (__DEV__) console.warn(`${TAG} notification not shown:`, err?.message || err);
  }
}

export async function notifyFetched(requestId) {
  try {
    const notifee = require('@notifee/react-native').default;
    const { AndroidImportance } = require('@notifee/react-native');
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Location requests',
      importance: AndroidImportance.HIGH,
    });
    await notifee.displayNotification({
      id: requestId ? `location_${requestId}` : 'location_check',
      title: 'Location fetched',
      body: 'Your workplace verified your current location. Tap to view.',
      data: {
        type: 'location_check',
        section: 'locationChecks',
        requestId: requestId || '',
      },
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default' },
      },
    });
  } catch (err) {
    if (__DEV__) console.warn(`${TAG} fetched notification not shown:`, err?.message || err);
  }
}

async function post(payload, expiresAt) {
  try {
    await attendanceAPI.reportLiveLocation(payload);
    return true;
  } catch (err) {
    if (isDeadEnd(err) || !isLive(expiresAt)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await attendanceAPI.reportLiveLocation(payload);
    return true;
  }
}

/**
 * Answer one location request. NEVER rejects — it runs from a push handler,
 * where a throw is only a log line nobody reads.
 *
 * @param {{ action?: string, requestId?: string, expiresAt?: string }} data
 */
export async function handleLocationRequest(data) {
  const { action, requestId, expiresAt } = data || {};
  if (action !== ACTION || !requestId) return;
  // Past the TTL: no fix AND no notification — telling somebody their location
  // was requested, for a request that is already over, is noise.
  if (!isLive(expiresAt)) return;
  if (inFlight.has(requestId)) return;
  inFlight.add(requestId);

  try {
    if (!getToken()) await loadSession();
    if (!getToken()) return; // signed out on this phone — nobody to answer for

    await notifyRequested(requestId);

    const fix = await getFreshLocation({ timeout: 10000 });
    const c = fix?.coords;
    if ((fix.status !== GEO_STATUS.GRANTED && fix.status !== GEO_STATUS.COARSE_ONLY) || !c) {
      // No fix is not an error to report: the requester's poll times out and
      // the employee's trail reads "No location sent".
      if (__DEV__) console.log(`${TAG} no fix:`, fix?.status);
      return;
    }

    await post({
      request_id: requestId,
      latitude: c.latitude,
      longitude: c.longitude,
      // The contract needs > 0. A platform that reports none gets a 1m floor
      // rather than a rejected ping.
      accuracy_meters: Math.min(Math.max(Number(c.accuracy) || 1, 1), 100000),
      is_mock: c.mocked === true,
      captured_at: new Date(c.at).toISOString(),
      platform: THIS_PLATFORM,
    }, expiresAt);
    if (__DEV__) console.log(`${TAG} reported:`, requestId);

    // Notify user that location has been fetched/verified and reported
    await notifyFetched(requestId);

    // Signal any active screens (like LocationChecksTab) to reload their list
    emitAttendanceChanged(ATTENDANCE_EVENTS.LOCATION_CHECK, { requestId });
  } catch (err) {
    if (__DEV__) console.warn(`${TAG} not reported:`, err?.status || '', err?.message || err);
  } finally {
    inFlight.delete(requestId);
  }
}

/* ─── The notice ───────────────────────────────────────────────────────────── */

const noticeKey = (userId) => `hrclouds.locationNotice.${LOCATION_NOTICE_VERSION}:${userId || 'anon'}`;

/** Has this person acknowledged the current notice on this phone? Never rejects. */
export async function noticeAcknowledged(userId) {
  try {
    return (await AsyncStorage.getItem(noticeKey(userId))) === 'true';
  } catch {
    return false;
  }
}

/**
 * Post the acknowledgement, then remember it. REJECTS on a failed write so
 * the caller can toast it (§3) — the local flag is only set once the server
 * has it, or the notice would vanish while the org still counts it pending.
 */
export async function acknowledgeNotice(userId) {
  await attendanceAPI.acknowledgeLocationNotice({ version: LOCATION_NOTICE_VERSION });
  AsyncStorage.setItem(noticeKey(userId), 'true').catch(() => {});
}

export default {
  handleLocationRequest,
  isLocationRequest,
  notifyRequested,
  notifyFetched,
  noticeAcknowledged,
  acknowledgeNotice,
};
