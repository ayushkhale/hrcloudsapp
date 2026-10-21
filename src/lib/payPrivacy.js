// ─────────────────────────────────────────────────────────────────────────────
// lib/payPrivacy.js — My Pay's AMOUNTS stay as dots until the phone confirms it's you
// (the screens load as normal — `formatPay` masks the figures, nothing else).
//
// User, 2026-10-21: "in salary showing screen, show it hidden, ask biometric
// and then show it, it can be turned off from settings". Pay is the one thing
// in this app people don't want read over their shoulder on a bus.
//
//   • ON BY DEFAULT, per user, per phone (AsyncStorage — the same shape as
//     features/maya/mayaPrefs.js). Settings › Privacy switches it off.
//   • ONE UNLOCK PER VISIT TO THE APP. Unlocked stays unlocked across tabs —
//     a fingerprint every time somebody flicks from Pay to Time and back is a
//     setting people turn off — and LOCKS AGAIN the moment the app goes to
//     the background, which is when the phone might change hands.
//   • The check is the phone's own sheet: fingerprint, face or screen-lock
//     PIN (android/…/devicesafety/DeviceSafetyModule.kt `confirmIdentity`).
//   • NO LOCK TO CHECK AGAINST = NOTHING TO GUARD. A phone with no screen lock
//     (NOT_AVAILABLE), or a build without the module (iOS today), opens
//     straight away — the pay is not more private than the phone it is on,
//     and a screen that can never open is a broken screen (CLAUDE.md §2).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../state/AuthContext';
import { formatMoney } from './format';

const Native = Platform.OS === 'android' ? NativeModules.HRDeviceSafety : null;
const storageKey = (userId) => `hrc.pay.hidden.${userId || 'anon'}`;

/* ── One store, every hook subscribed (the mayaPrefs pattern) ────────────── */
const store = { userId: undefined, hide: true, unlocked: false };
const subscribers = new Set();
const publish = () => subscribers.forEach((fn) => fn({ ...store }));

function ensureLoaded(userId) {
  if (store.userId === userId) return;
  store.userId = userId;
  store.hide = true;
  store.unlocked = false;
  publish();
  AsyncStorage.getItem(storageKey(userId))
    .then((raw) => {
      if (store.userId !== userId) return;
      store.hide = raw !== 'false';
      publish();
    })
    .catch(() => {});
}

// Background → locked. Registered once, for the life of the JS runtime.
AppState.addEventListener('change', (next) => {
  if (next === 'background' && store.unlocked) {
    store.unlocked = false;
    publish();
  }
});

/** Amounts are masked right now (the setting is on and nobody has unlocked). */
export const payMasked = () => store.hide && !store.unlocked;

/**
 * `formatMoney`, but dots while the pay is hidden. Every AMOUNT on My Pay
 * goes through this; the screens themselves load and draw as normal.
 * Same signature as lib/format `formatMoney`.
 */
export function formatPay(val, opts = {}) {
  if (payMasked()) return opts.withSymbol === false ? '••••' : '₹ ••••';
  return formatMoney(val, opts);
}

/**
 * Ask the phone. Resolves 'ok' | 'cancelled' | 'locked_out' | 'failed'.
 * 'ok' also when there is nothing to check against — see the header.
 */
export async function confirmIdentity() {
  if (!Native?.confirmIdentity) return 'ok';
  try {
    await Native.confirmIdentity('Show your pay', 'Confirm it’s you to see your salary');
    return 'ok';
  } catch (e) {
    const code = e?.code;
    if (code === 'NOT_AVAILABLE') return 'ok';
    if (code === 'CANCELLED') return 'cancelled';
    if (code === 'LOCKED_OUT') return 'locked_out';
    return 'failed';
  }
}

/**
 * @returns {{ locked: boolean, hideEnabled: boolean, unlock: () => Promise<string>,
 *             lock: () => void, setHideEnabled: (on: boolean) => void }}
 */
export function usePayPrivacy() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [snap, setSnap] = useState(() => ({ ...store }));

  useEffect(() => {
    subscribers.add(setSnap);
    ensureLoaded(userId);
    setSnap({ ...store });
    return () => { subscribers.delete(setSnap); };
  }, [userId]);

  const unlock = useCallback(async () => {
    const result = await confirmIdentity();
    if (result === 'ok') {
      store.unlocked = true;
      publish();
    }
    return result;
  }, []);

  const lock = useCallback(() => {
    store.unlocked = false;
    publish();
  }, []);

  const setHideEnabled = useCallback((on) => {
    store.hide = !!on;
    if (!on) store.unlocked = false;
    AsyncStorage.setItem(storageKey(userId), on ? 'true' : 'false').catch(() => {});
    publish();
  }, [userId]);

  return {
    locked: snap.hide && !snap.unlocked,
    hideEnabled: snap.hide,
    unlock,
    lock,
    setHideEnabled,
  };
}
