// ─────────────────────────────────────────────────────────────────────────────
// ui/haptics.js — the app's touch feedback, in one vocabulary.
//
// One file for the same reason theme/motion.js is one file: haptics scattered
// as raw `trigger('impactHeavy')` calls drift into a phone that buzzes on
// everything, which people turn off — and then the punch confirmation is gone
// too. So screens never name a native effect; they name an INTENT:
//
//   selection  a choice moved — a tab, a filter, a section tile, a toggle,
//              an option picked, a month stepped. The lightest tick there is.
//   light      a press that starts something — a primary button, the ✚.
//   medium     a press with weight — the punch button, a destructive confirm
//              being opened.
//   success    a write landed (a success toast, a punch recorded).
//   warning    something needs a second look before it happens.
//   error      a write failed, or the form guard stopped a submit.
//
// ── THE RULES ────────────────────────────────────────────────────────────────
//
// 1. OUTCOMES, NOT EVERY TOUCH. Rows, links and scrolls get NO haptic: the
//    visual press tint already answers them, and a tick on every row is noise.
//    Feedback goes where a phone would give it — a choice, a commit, a result.
//
// 2. THE OS SETTING WINS. `ignoreAndroidSystemSettings: false` — somebody who
//    turned touch vibration off in Android settings gets none from us either.
//    iOS's Taptic Engine follows its own System Haptics switch.
//
// 3. THE PERSON CAN TURN IT OFF. Settings › "Vibrate on tap" writes the pref
//    below; it is per phone, not per account, because it is about the device in
//    the hand.
//
// 4. NEVER CRASH FOR A BUZZ. `react-native-haptic-feedback` looks its native
//    module up with `getEnforcing`, which THROWS when the binary was built
//    before the library was added (a dev client from last week). So it is
//    required lazily inside a try, and a missing module is SILENCE. Not a
//    `Vibration` fallback: that needs android.permission.VIBRATE, which the
//    library's manifest only merges in at the same rebuild — on the old binary
//    it would throw natively, i.e. crash for a buzz. After `npm run android` /
//    `pod install` the engine is there with no code change.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREF_KEY = 'hrc.haptics.enabled';

/* Intent → the native effect on each platform. Android's "virtual key" and
   "clock tick" are the system's own keyboard and picker ticks, which is what
   makes them feel native rather than like a vibration motor. */
const EFFECT = {
  selection: { ios: 'selection', android: 'clockTick' },
  light: { ios: 'impactLight', android: 'virtualKey' },
  medium: { ios: 'impactMedium', android: 'impactMedium' },
  success: { ios: 'notificationSuccess', android: 'confirm' },
  warning: { ios: 'notificationWarning', android: 'notificationWarning' },
  error: { ios: 'notificationError', android: 'reject' },
};

let engine; // undefined = not looked up yet, null = unavailable
function getEngine() {
  if (engine !== undefined) return engine;
  try {
    // eslint-disable-next-line global-require
    const mod = require('react-native-haptic-feedback');
    engine = mod?.default || mod || null;
    if (engine && typeof engine.trigger !== 'function') engine = null;
  } catch {
    engine = null;
  }
  return engine;
}

let enabled = true;
const listeners = new Set();

// Read once at start-up. Until it lands haptics are on — the default — so the
// first tap of a session is never silently dropped.
AsyncStorage.getItem(PREF_KEY)
  .then((raw) => { if (raw === 'false') enabled = false; listeners.forEach((fn) => fn(enabled)); })
  .catch(() => {});

/** Is touch feedback on? */
export const hapticsEnabled = () => enabled;

/** Turn touch feedback on or off, for this phone. */
export function setHapticsEnabled(value) {
  enabled = !!value;
  listeners.forEach((fn) => fn(enabled));
  AsyncStorage.setItem(PREF_KEY, enabled ? 'true' : 'false').catch(() => {});
  // A confirming tick when it is switched ON, so the person feels what they
  // just enabled. (Switching off is silent, obviously.)
  if (enabled) haptic('selection');
}

/** Subscribe to the setting (Settings' switch). Returns the unsubscribe. */
export function onHapticsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Fire one haptic by intent. Safe to call anywhere — from a press handler, an
 * effect, non-component code — and never throws.
 *
 * @param {'selection'|'light'|'medium'|'success'|'warning'|'error'} kind
 */
export function haptic(kind = 'selection') {
  if (!enabled) return;
  const effect = EFFECT[kind] || EFFECT.selection;
  const e = getEngine();
  if (!e) return;
  try {
    e.trigger(Platform.OS === 'ios' ? effect.ios : effect.android, {
      enableVibrateFallback: false,
      ignoreAndroidSystemSettings: false,
    });
  } catch {
    // A haptic is decoration on top of an action that already happened.
  }
}

export default haptic;
