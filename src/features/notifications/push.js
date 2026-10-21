// ─────────────────────────────────────────────────────────────────────────────
// features/notifications/push.js — Firebase Cloud Messaging for the app.
//
// Three jobs, in the order they happen:
//   1. registerPushBackgroundHandler() — called at MODULE SCOPE in index.js, so
//      it is registered before React mounts. A data message that arrives while
//      the app is backgrounded or killed is handled here (logged for now).
//   2. setupPush() — called once the person is signed in (AppTabs). Asks for the
//      notification permission (Android 13+ runtime, iOS prompt), reads the FCM
//      token and LOGS IT so it can be used to send a test push, and listens for
//      foreground messages (shown as a toast — the OS tray only shows them when
//      the app isn't in front). Returns an unsubscribe.
//   3. onTokenRefresh — the token can rotate; the new one is logged too.
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

const TAG = '[FCM]';

/** Android 13+ needs the POST_NOTIFICATIONS runtime grant; earlier Android and iOS don't. */
async function askNotificationPermission() {
  try {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 33) {
        const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        return res === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    }
    // iOS (and Firebase's own permission on both platforms).
    const status = await messaging().requestPermission();
    return (
      status === messaging.AuthorizationStatus.AUTHORIZED
      || status === messaging.AuthorizationStatus.PROVISIONAL
    );
  } catch (err) {
    if (__DEV__) console.warn(`${TAG} permission request failed:`, err?.message || err);
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
    await logToken();

    const unsubRefresh = messaging().onTokenRefresh((t) => {
      // eslint-disable-next-line no-console
      console.log(`${TAG} token refreshed:`, t);
    });

    const unsubForeground = messaging().onMessage(async (msg) => {
      // eslint-disable-next-line no-console
      console.log(`${TAG} foreground message:`, JSON.stringify(msg));
      const n = msg?.notification;
      const line = [n?.title, n?.body].filter(Boolean).join(' — ');
      if (line) showToast(line, 'info');
    });

    // The app was opened by TAPPING a notification (from background or cold).
    messaging().onNotificationOpenedApp((msg) => {
      // eslint-disable-next-line no-console
      console.log(`${TAG} opened from background:`, JSON.stringify(msg?.data || {}));
    });
    messaging().getInitialNotification().then((msg) => {
      if (msg) {
        // eslint-disable-next-line no-console
        console.log(`${TAG} opened from quit:`, JSON.stringify(msg?.data || {}));
      }
    }).catch(() => {});

    return () => { unsubRefresh?.(); unsubForeground?.(); };
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
    });
  } catch (err) {
    if (__DEV__) console.warn(`${TAG} background handler not registered:`, err?.message || err);
  }
}
