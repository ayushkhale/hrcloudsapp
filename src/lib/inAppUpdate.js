// ─────────────────────────────────────────────────────────────────────────────
// lib/inAppUpdate.js — Google Play In-App Updates (and iOS App Store update check).
//
// Uses `sp-react-native-in-app-updates` to invoke Google Play's official
// In-App Update API.
//
// ── TWO UPDATE MODES ──────────────────────────────────────────────────────────
//
// 1. FLEXIBLE (Default for regular updates):
//    - Google Play displays a native bottom sheet.
//    - Tapping "Update" downloads the package in the background while the user
//      continues using HR Clouds uninterrupted.
//    - When the download finishes (`DOWNLOADED`), we prompt the user to restart
//      and complete the installation.
//
// 2. IMMEDIATE (For breaking / mandatory updates):
//    - Google Play displays a full-screen blocking UI.
//    - The user cannot continue using the app until the update is installed.
//
// ── PLAY STORE REQUIREMENT NOTE ──────────────────────────────────────────────
// In-app updates ONLY work when the app was installed from Google Play (or
// Internal App Sharing / Internal Testing track) with a higher `versionCode`
// published in Play Console than the one installed on the device.
// They do NOT run in development/debug builds (`__DEV__`).
// ─────────────────────────────────────────────────────────────────────────────

import { Alert, NativeModules, Platform } from 'react-native';
import ENV from '../config/env';

export const IAUUpdateKind = {
  FLEXIBLE: 0,
  IMMEDIATE: 1,
};

export const IAUInstallStatus = {
  UNKNOWN: 0,
  PENDING: 1,
  DOWNLOADING: 2,
  INSTALLING: 3,
  INSTALLED: 4,
  FAILED: 5,
  CANCELED: 6,
  DOWNLOADED: 11,
};

export const IAUAvailabilityStatus = {
  UNKNOWN: 0,
  AVAILABLE: 2,
  UNAVAILABLE: 1,
  DEVELOPER_TRIGGERED: 3,
};

let inAppUpdatesInstance = null;
let isChecking = false;
let activeStatusListener = null;

function getInAppUpdates() {
  if (inAppUpdatesInstance) return inAppUpdatesInstance;

  // On Android, check that the native module was compiled into the binary
  if (Platform.OS === 'android' && !NativeModules.SpReactNativeInAppUpdates) {
    return null;
  }

  try {
    // Lazily require to avoid evaluating native dependencies in unsupported builds
    const SpInAppUpdates = require('sp-react-native-in-app-updates').default;
    inAppUpdatesInstance = new SpInAppUpdates(false);
    return inAppUpdatesInstance;
  } catch (err) {
    return null;
  }
}

/**
 * Checks for updates and triggers the native Google Play / App Store popup.
 *
 * @param {Object} options
 * @param {boolean} [options.isForceUpdate=false] - If true, triggers immediate full-screen update on Android.
 * @param {() => void} [options.onDownloaded] - Optional custom callback when background download completes.
 */
export async function checkForAppUpdate({
  isForceUpdate = false,
  onDownloaded,
} = {}) {
  // Google Play In-App Updates ONLY work in release builds distributed via Play Store.
  // In development/debug builds, exit early without attempting to contact Play Store.
  if (__DEV__) {
    return;
  }

  // Prevent duplicate concurrent checks
  if (isChecking) return;
  isChecking = true;

  try {
    const inAppUpdates = getInAppUpdates();
    if (!inAppUpdates) {
      return;
    }

    const currentVersion = ENV.APP_VERSION || '1.0.1';

    // Passing `curVersion` ensures the library doesn't try to query external device-info modules.
    const checkOptions = Platform.select({
      android: {
        curVersion: currentVersion,
        // Google Play's own SDK decides if updateAvailability === AVAILABLE.
        // Returning 1 guarantees the update flow starts if Play Store reports an update.
        customVersionComparator: () => 1,
      },
      ios: {
        curVersion: currentVersion,
        country: 'in',
      },
    });

    const result = await inAppUpdates.checkNeedsUpdate(checkOptions);

    if (!result || !result.shouldUpdate) {
      return;
    }

    if (Platform.OS === 'android') {
      const updateType = isForceUpdate
        ? IAUUpdateKind.IMMEDIATE
        : IAUUpdateKind.FLEXIBLE;

      if (updateType === IAUUpdateKind.FLEXIBLE) {
        if (activeStatusListener) {
          inAppUpdates.removeStatusUpdateListener(activeStatusListener);
          activeStatusListener = null;
        }

        activeStatusListener = (event) => {
          if (event && event.status === IAUInstallStatus.DOWNLOADED) {
            if (activeStatusListener) {
              inAppUpdates.removeStatusUpdateListener(activeStatusListener);
              activeStatusListener = null;
            }

            if (typeof onDownloaded === 'function') {
              onDownloaded(() => inAppUpdates.installUpdate());
            } else {
              Alert.alert(
                'Update Ready',
                'A new version of HR Clouds has finished downloading. Restart the app now to finish updating?',
                [
                  { text: 'Later', style: 'cancel' },
                  {
                    text: 'Restart Now',
                    style: 'default',
                    onPress: () => {
                      inAppUpdates.installUpdate();
                    },
                  },
                ],
                { cancelable: true }
              );
            }
          }
        };

        inAppUpdates.addStatusUpdateListener(activeStatusListener);
      }

      // Show the native Google Play update popup
      await inAppUpdates.startUpdate({ updateType });
    } else if (Platform.OS === 'ios') {
      // iOS fallback: prompts user with standard dialog linking to App Store
      await inAppUpdates.startUpdate({
        title: 'Update Available',
        message:
          'A new version of HR Clouds is available. Please update to enjoy the latest features and bug fixes.',
        buttonUpgradeText: 'Update Now',
        buttonCancelText: isForceUpdate ? undefined : 'Later',
      });
    }
  } catch (error) {
    // Gracefully ignore any store-check failures
  } finally {
    isChecking = false;
  }
}
