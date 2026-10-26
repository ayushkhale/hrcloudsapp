// ─────────────────────────────────────────────────────────────────────────────
// features/notifications/push.js — Firebase Cloud Messaging for the app.
//
// Three jobs, in the order they happen:
//   1. registerPushBackgroundHandler() — called at MODULE SCOPE in index.js, so
//      it is registered before React mounts. A data message that arrives while
//      the app is backgrounded or killed is handled here (a location request is acted
//      on; anything else is still only logged).
//   2. setupPush() — called once the person is signed in (AppTabs). Asks for the
//      notification permission (Android 13+ runtime, iOS prompt), reads the FCM
//      token and LOGS IT so it can be used to send a test push, and listens for
//      foreground messages (shown as a toast — the OS tray only shows them when
//      the app isn't in front). Returns an unsubscribe.
//   3. onTokenRefresh — the token can rotate; the new one is logged too.
//
// Both 2 and 3 REGISTER the token with the server (pushDevice.js) — without
// that the server cannot wake this phone and every location request against
// this person fails 422 NO_ACTIVE_DEVICE on the requester's screen.
//
// A `REQUEST_LOCATION` data message is dispatched to
// features/attendance/liveLocation.js from BOTH handlers — foreground and
// background/quit — and never shown as a toast.
//
// Everything is wrapped so a build without Firebase wired (no google-services
// .json, or the native rebuild not done yet) is a NO-OP, never a crash: Maya,
// attendance and the rest must not depend on push being set up.
//
// NATIVE SETUP REQUIRED (one-time, then a rebuild):
//   • android/app/google-services.json present (done)
//   • google-services gradle plugin applied (done — android build.gradle +
//     app/build.gradle)
//   • `cd android && ./gradlew clean && npx react-native run-android` to pick up
//     the native Firebase modules. iOS: `cd ios && pod install`.
// Until that rebuild runs, `messaging()` throws natively and this stays a no-op.
// ─────────────────────────────────────────────────────────────────────────────

import { PermissionsAndroid, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { showToast } from '../../ui/Toast';
import { registerThisDevice } from './pushDevice';
import { handleLocationRequest, isLocationRequest } from '../attendance/liveLocation';
import { navigateToLocationChecks, navigationRef } from '../../navigation/navigationRef';
import { bumpUnread, refreshUnreadCount } from './notifications.data';
import { navigateFromPushData } from './deepLink';

const TAG = '[FCM]';

/** Is this notification or push payload related to location checks? */
export function isLocationNotification(data, notification) {
  if (!data && !notification) return false;
  if (
    data?.type === 'location_check'
    || data?.section === 'locationChecks'
    || data?.action === 'REQUEST_LOCATION'
  ) {
    return true;
  }
  const title = (notification?.title || '').toLowerCase();
  const body = (notification?.body || '').toLowerCase();
  return title.includes('location') || body.includes('location');
}

/**
 * A VISIBLE message from the notification engine (the inbox + push shape added
 * on 2026-10-24). FCM carries a top-level `notification` block for these; the
 * silent location-request shape is data-only and has none.
 */
function isEngineNotification(msg) {
  if (!msg?.notification) return false;
  if (isLocationRequest(msg)) return false;
  return true;
}

/** Check notification permission status. Upfront requesting is handled by lib/permissions.js. */
async function askNotificationPermission() {
  try {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 33) {
        return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      return true;
    }
    // iOS (and Firebase's own permission on both platforms).
    const status = await messaging().hasPermission();
    return (
      status === messaging.AuthorizationStatus.AUTHORIZED
      || status === messaging.AuthorizationStatus.PROVISIONAL
    );
  } catch (err) {
    if (__DEV__) console.warn(`${TAG} permission check failed:`, err?.message || err);
    return false;
  }
}

/** Read and log the FCM token — the id you paste into a test send. */
async function logToken() {
  try {
    const token = await messaging().getToken();
    // eslint-disable-next-line no-console
    console.log(`${TAG} token:`, token);
    return token;
  } catch (err) {
    if (__DEV__) console.warn(`${TAG} getToken failed:`, err?.message || err);
    return null;
  }
}

/**
 * Set up push once signed in. Safe to call more than once; returns an
 * unsubscribe for the listeners it attached (or a no-op).
 */
export async function setupPush() {
  try {
    const granted = await askNotificationPermission();
    if (__DEV__) console.log(`${TAG} notification permission:`, granted ? 'granted' : 'not granted');

    // Register the device with FCM and log the token even if the OS banner was
    // declined — a token still exists and a data message still arrives.
    await messaging().registerDeviceForRemoteMessages().catch(() => {});
    const token = await logToken();
    // Not awaited: a registration is never a reason to hold the shell
    // (pushDevice.js). Every sign-in re-posts it, because re-posting upserts.
    registerThisDevice(token);

    const unsubRefresh = messaging().onTokenRefresh((t) => {
      // eslint-disable-next-line no-console
      console.log(`${TAG} token refreshed:`, t);
      registerThisDevice(t);
    });

    const unsubForeground = messaging().onMessage(async (msg) => {
      // eslint-disable-next-line no-console
      console.log(`${TAG} foreground message:`, JSON.stringify(msg));
      // A location request is data-only and silent by contract — it posts
      // its own notification and must never ALSO surface as a toast.
      if (isLocationRequest(msg)) {
        handleLocationRequest(msg.data);
        return;
      }
      // Engine notification: the row is already written server-side, so just
      // bump the badge and refresh the real count — a toast is the only way
      // the person sees it while the app is in front.
      if (isEngineNotification(msg)) {
        bumpUnread(1);
        refreshUnreadCount().catch(() => {});
        const n = msg?.notification;
        const line = [n?.title, n?.body].filter(Boolean).join(' — ');
        if (line) showToast(line, 'info');
        return;
      }
      const n = msg?.notification;
      const line = [n?.title, n?.body].filter(Boolean).join(' — ');
      if (line) showToast(line, 'info');
    });

    const openFromPush = (msg) => {
      // Location checks keep their own deep-link path (notifee-posted channel).
      if (isLocationNotification(msg?.data, msg?.notification)) {
        navigateToLocationChecks();
        return;
      }
      // Engine notification tap: data carries { screen, id, event_key }.
      if (msg?.data?.screen) {
        if (navigateFromPushData(msg.data)) return;
      }
      // Fall back to the inbox for an unknown screen name.
      try {
        if (navigationRef.isReady()) {
          navigationRef.navigate('HomeTab', { screen: 'Notifications' });
        }
      } catch { /* no-op */ }
    };

    const unsubFcmOpened = messaging().onNotificationOpenedApp((msg) => {
      if (__DEV__) console.log(`${TAG} opened from background:`, JSON.stringify(msg?.data || {}));
      refreshUnreadCount().catch(() => {});
      openFromPush(msg);
    });

    messaging().getInitialNotification().then((msg) => {
      if (msg) {
        if (__DEV__) console.log(`${TAG} opened from quit:`, JSON.stringify(msg?.data || {}));
        refreshUnreadCount().catch(() => {});
        openFromPush(msg);
      }
    }).catch(() => {});

    // Notifee local notification events (when user taps transparency or location fetched notification)
    let unsubNotifee = () => {};
    try {
      const notifee = require('@notifee/react-native').default;
      const { EventType } = require('@notifee/react-native');

      unsubNotifee = notifee.onForegroundEvent(({ type, detail }) => {
        if (type === EventType.PRESS && detail?.notification) {
          if (__DEV__) console.log(`${TAG} notifee pressed in foreground:`, detail.notification.title);
          if (isLocationNotification(detail.notification.data, detail.notification)) {
            navigateToLocationChecks();
          }
        }
      });

      notifee.getInitialNotification().then((initial) => {
        if (initial?.notification) {
          if (__DEV__) console.log(`${TAG} notifee opened from quit:`, initial.notification.title);
          if (isLocationNotification(initial.notification.data, initial.notification)) {
            navigateToLocationChecks();
          }
        }
      }).catch(() => {});
    } catch (notifeeErr) {
      if (__DEV__) console.warn(`${TAG} notifee listener skipped:`, notifeeErr?.message || notifeeErr);
    }

    return () => {
      unsubRefresh?.();
      unsubForeground?.();
      unsubFcmOpened?.();
      unsubNotifee?.();
    };
  } catch (err) {
    // No Firebase native module (rebuild not done) → push is simply off.
    if (__DEV__) console.warn(`${TAG} setup skipped:`, err?.message || err);
    return () => {};
  }
}

/** Register the background/quit handler. MUST run at module scope in index.js. */
export function registerPushBackgroundHandler() {
  try {
    messaging().setBackgroundMessageHandler(async (msg) => {
      // eslint-disable-next-line no-console
      console.log(`${TAG} background message:`, JSON.stringify(msg));
      // AWAITED here, unlike the foreground: the OS may kill the headless
      // context as soon as this promise settles, before the fix is posted.
      if (isLocationRequest(msg)) await handleLocationRequest(msg.data);
    });
  } catch (err) {
    if (__DEV__) console.warn(`${TAG} background handler not registered:`, err?.message || err);
  }
}

/** Register the Notifee background event listener. Run at module scope in index.js. */
export function registerNotifeeBackgroundHandler() {
  try {
    const notifee = require('@notifee/react-native').default;
    const { EventType } = require('@notifee/react-native');
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      if (type === EventType.PRESS && detail?.notification) {
        if (__DEV__) console.log('[notifee] background press:', detail.notification.title);
      }
    });
  } catch (err) {
    if (__DEV__) console.warn('[notifee] background handler skipped:', err?.message || err);
  }
}
