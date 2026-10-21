// ─────────────────────────────────────────────────────────────────────────────
// features/onboarding/useOnboarding.js — has this person seen the tour?
//
// ── WHY ASYNCSTORAGE AND NOT THE KEYCHAIN ────────────────────────────────────
//
// CLAUDE.md §7 puts the access token and the refresh token in the Keychain and
// nothing else. That rule exists because those are bearer credentials to
// payroll data. This is a boolean about whether three illustrations have been
// swiped past: it identifies nobody, unlocks nothing, and reading it off a
// rooted phone tells an attacker precisely nothing. AsyncStorage is the right
// home, and the Keychain would be a slower one with no benefit.
//
// ── IT IS A DEVICE FLAG, NOT A USER FLAG ─────────────────────────────────────
//
// Deliberately NOT cleared on logout. The tour explains what the app is, not
// what this account is — showing it again to somebody who signs out and back
// in on their own phone would be a bug, not a feature. It survives logout and
// dies with the app's data.
//
// ── A FAILED READ SHOWS THE TOUR ─────────────────────────────────────────────
//
// If storage is unavailable the answer is "not seen", so a first-time person
// is never dropped straight onto a sign-in form with no explanation. The cost
// of being wrong the other way is three swipes.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* Versioned. Changing the tour's content and wanting it shown again is a
   matter of bumping the suffix, which is cheaper and clearer than a migration
   that deletes the old key. */
export const ONBOARDING_KEY = 'hrclouds.onboarding.seen.v1';

export function useOnboarding() {
  // `null` = we have not looked yet. The splash stays up while this is null,
  // so nobody sees Login flash before the tour replaces it.
  const [seen, setSeen] = useState(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (alive && seen === null) setSeen(false);
    }, 1500);

    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((value) => { if (alive) setSeen(value === '1'); })
      // Storage unavailable: show the tour. See the header.
      .catch(() => { if (alive) setSeen(false); })
      .finally(() => clearTimeout(timer));

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [seen]);

  /**
   * Remember that the tour is done.
   *
   * The state is set BEFORE the write resolves, on purpose: the person has
   * pressed "Get started" and must land on the sign-in screen now, not after
   * a disk round-trip. A failed write costs them the tour once more on the
   * next launch, which is not worth blocking the press for.
   */
  const markSeen = useCallback(() => {
    setSeen(true);
    AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {});
  }, []);

  return {
    checking: seen === null,
    needsOnboarding: seen === false,
    markSeen,
  };
}

/** Dev helper: `resetOnboarding()` then reload to see the tour again. */
export function resetOnboarding() {
  return AsyncStorage.removeItem(ONBOARDING_KEY);
}
