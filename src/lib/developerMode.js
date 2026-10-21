// ─────────────────────────────────────────────────────────────────────────────
// lib/developerMode.js — the developer-mode gate on punches.
//
// User, 2026-10-21: "when Developer's mode is on kindly tell the user to turn
// off if he wants to clock in, clock out or take break — don't allow user to
// clock in, clock out if user has developer mode turned on". Developer options
// is where mock locations and a faked clock live, so a punch from such a phone
// proves nothing about where or when it happened.
//
// Native half: android/…/devicesafety/DeviceSafetyModule.kt (HRDeviceSafety).
//
// FAILS OPEN WHEN THE QUESTION CAN'T BE ASKED. iOS has no readable equivalent,
// and an Android build made before the module existed has no HRDeviceSafety —
// both read as "off". This is a gate on a punch, not a reason the app breaks.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import { useOnAppActive } from '../hooks/useAppActive';

const Native = Platform.OS === 'android' ? NativeModules.HRDeviceSafety : null;

/** The sentence every blocked punch shows. One wording, one place. */
export const DEV_MODE_MESSAGE =
  'Developer options is on. Turn it off in your phone’s Settings to clock in, clock out or take a break.';

/** @returns {Promise<boolean>} true when Developer options is switched on */
export async function isDeveloperModeOn() {
  if (!Native?.isDeveloperModeOn) return false;
  try {
    return (await Native.isDeveloperModeOn()) === true;
  } catch {
    return false;
  }
}

/** Opens Settings › Developer options. Resolves false when nothing could open. */
export async function openDeveloperSettings() {
  if (!Native?.openDeveloperSettings) return false;
  try {
    return (await Native.openDeveloperSettings()) === true;
  } catch {
    return false;
  }
}

/**
 * The current answer, kept fresh: read on mount and again every time the app
 * returns to the foreground — which is exactly when somebody has just been to
 * Settings to switch it off. `recheck` asks again and returns the answer.
 */
export function useDeveloperMode() {
  const [on, setOn] = useState(false);

  const recheck = useCallback(async () => {
    const next = await isDeveloperModeOn();
    setOn(next);
    return next;
  }, []);

  useEffect(() => { recheck(); }, [recheck]);
  useOnAppActive(recheck);

  return { on, recheck };
}
