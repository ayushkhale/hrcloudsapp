// ─────────────────────────────────────────────────────────────────────────────
// hooks/useCountdown.js — seconds remaining until a deadline.
//
// ── IT HOLDS A DEADLINE, NOT A REMAINING COUNT ───────────────────────────────
//
// The obvious version keeps `seconds` in state and decrements it on an
// interval. It is wrong in three ways that all show up on a real phone:
//
//   • a re-render between ticks (a keystroke, a parent update) restarts the
//     interval and the count stalls or jumps
//   • the phone sleeping stops the timer, so a 60s wait becomes 60s of
//     SCREEN-ON time — exactly the bug AuthContext avoids by re-checking the
//     token on AppState instead of trusting setTimeout
//   • two components counting the same cooldown drift apart
//
// Holding the absolute deadline and deriving the remainder from `Date.now()`
// on every tick fixes all three: the answer is correct the moment the app
// comes back, no matter what the timer did while it was away.
//
// The 40-screens/01-auth.md spec says this directly for the OTP resend —
// "keep the deadline, not the remaining seconds".
//
// ── WHY IT TICKS AT ALL ──────────────────────────────────────────────────────
//
// lib/formGuard.js's `submitState()` already formats "Try again in 12s" from a
// `cooldownUntil`, but nothing re-renders the button to update it. This hook is
// what makes that number live: it re-renders once a second, and stops dead when
// the deadline passes so an idle screen is not waking up forever.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

const secondsUntil = (deadline) => {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
};

/**
 * Seconds left until `deadline`, re-rendering once a second until it is 0.
 *
 * @param {number|null} deadline  an absolute `Date.now()`-style timestamp, or
 *   null/0 for "no cooldown running"
 * @returns {number} whole seconds remaining, 0 when done or not running
 */
export function useCountdown(deadline) {
  const [remaining, setRemaining] = useState(() => secondsUntil(deadline));

  useEffect(() => {
    // Recompute immediately: a new deadline must not wait a second to show,
    // and a cleared one must drop to 0 at once.
    setRemaining(secondsUntil(deadline));
    if (!deadline || deadline <= Date.now()) return undefined;

    const id = setInterval(() => {
      const left = secondsUntil(deadline);
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [deadline]);

  return remaining;
}

/** `true` while a deadline is still in the future. */
export const isCoolingDown = (deadline) => !!deadline && deadline > Date.now();

export default useCountdown;
