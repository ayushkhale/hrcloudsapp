// ─────────────────────────────────────────────────────────────────────────────
// lib/permissions.js — Unified upfront permission manager.
//
// Gathers and requests all required permissions upfront at app startup / login:
//   1. Notifications (FCM / Announcements / Verification pings)
//   2. Location (Fine & Coarse GPS for geofence & live location check)
//   3. Camera (Punch-in/out selfies, profile picture capture, claim receipts)
//   4. Photo & Video Library (Attachment upload, profile photo selection)
// ─────────────────────────────────────────────────────────────────────────────

import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import messaging from '@react-native-firebase/messaging';

const TAG = '[Permissions]';
const STORAGE_KEY = '@hrclouds/permissions_requested_v1';

/**
 * Check if the main runtime permissions are already granted.
 */
export async function checkAllAppPermissions() {
  if (Platform.OS === 'android') {
    try {
      const fineLocation = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      const camera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);

      let notifications = true;
      let media = true;

      if (Platform.Version >= 33) {
        notifications = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        media = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
      } else {
        media = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
      }

      return {
        allGranted: fineLocation && camera && notifications && media,
        fineLocation,
        camera,
        notifications,
        media,
      };
    } catch (err) {
      if (__DEV__) console.warn(`${TAG} check error:`, err);
      return { allGranted: false };
    }
  }

  // iOS check
  try {
    const loc = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
    const cam = await check(PERMISSIONS.IOS.CAMERA);
    const photo = await check(PERMISSIONS.IOS.PHOTO_LIBRARY);
    const allGranted = loc === RESULTS.GRANTED && cam === RESULTS.GRANTED && (photo === RESULTS.GRANTED || photo === RESULTS.LIMITED);
    return { allGranted, location: loc, camera: cam, photo };
  } catch (err) {
    if (__DEV__) console.warn(`${TAG} iOS check error:`, err);
    return { allGranted: false };
  }
}

/**
 * Request all app permissions in one upfront flow.
 * Called on first login / app entry.
 */
export async function requestAllAppPermissions({ force = false } = {}) {
  try {
    if (!force) {
      const alreadyAsked = await AsyncStorage.getItem(STORAGE_KEY);
      const status = await checkAllAppPermissions();
      if (alreadyAsked && status.allGranted) {
        if (__DEV__) console.log(`${TAG} All permissions already granted.`);
        return status;
      }
    }

    if (__DEV__) console.log(`${TAG} Requesting all permissions upfront...`);

    if (Platform.OS === 'android') {
      const toRequest = [];

      const fineGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      if (!fineGranted) {
        toRequest.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        toRequest.push(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
      }

      const cameraGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (!cameraGranted) {
        toRequest.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }

      if (Platform.Version >= 33) {
        const notifGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        if (!notifGranted) {
          toRequest.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }
        const mediaGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
        if (!mediaGranted) {
          toRequest.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
          toRequest.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO);
        }
      } else {
        const storageGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        if (!storageGranted) {
          toRequest.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        }
      }

      let results = {};
      if (toRequest.length > 0) {
        results = await PermissionsAndroid.requestMultiple(toRequest);
        if (__DEV__) console.log(`${TAG} Multi-permission results:`, results);
      }

      // If fine location was granted, on Android 10+ optionally ask for background location
      const fineNowGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      if (fineNowGranted && Platform.Version >= 29) {
        try {
          const bgCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
          if (!bgCheck) {
            const bgResult = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
            if (__DEV__) console.log(`${TAG} Background location result:`, bgResult);
          }
        } catch (bgErr) {
          if (__DEV__) console.warn(`${TAG} Background location request error:`, bgErr);
        }
      }

      await AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {});
      return results;
    }

    // iOS flow
    try {
      await messaging().requestPermission().catch(() => {});
      await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE).catch(() => {});
      await request(PERMISSIONS.IOS.CAMERA).catch(() => {});
      await request(PERMISSIONS.IOS.PHOTO_LIBRARY).catch(() => {});
      await AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {});
    } catch (iosErr) {
      if (__DEV__) console.warn(`${TAG} iOS request error:`, iosErr);
    }
  } catch (err) {
    if (__DEV__) console.warn(`${TAG} Request all permissions error:`, err);
  }
}
