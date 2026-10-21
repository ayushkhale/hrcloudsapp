// ─────────────────────────────────────────────────────────────────────────────
// features/maya/mayaPrefs.js — the per-phone Maya preferences.
//
// A phone preference with no server home, saved in AsyncStorage keyed per user
// (the same shape as quickActions.js). Three things a person controls:
//
//   fab    the floating Maya button — on by default
//   shake  open Maya on a phone shake — on by default (needs react-native-shake
//          linked; the hook is a no-op until the native module is present)
//   lang   the language Maya answers in — English by default
//
// A blocked or empty store falls back to the defaults, so Maya always works.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../state/AuthContext';

export const MAYA_PREF_DEFAULTS = Object.freeze({ fab: true, shake: true, lang: 'en-IN' });

const storageKey = (userId) => `hrc.maya.prefs.${userId || 'anon'}`;

async function loadMayaPrefs(userId) {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return { ...MAYA_PREF_DEFAULTS };
    const saved = JSON.parse(raw);
    return {
      fab: typeof saved?.fab === 'boolean' ? saved.fab : MAYA_PREF_DEFAULTS.fab,
      shake: typeof saved?.shake === 'boolean' ? saved.shake : MAYA_PREF_DEFAULTS.shake,
      lang: ['en-IN', 'hi-IN', 'hinglish'].includes(saved?.lang) ? saved.lang : MAYA_PREF_DEFAULTS.lang,
    };
  } catch {
    return { ...MAYA_PREF_DEFAULTS };
  }
}

/* ONE STORE, NOT ONE COPY PER HOOK (2026-10-20). Every caller used to hold its
   own useState, so the floating button (MayaProvider, mounted once at sign-in)
   read the prefs once and never heard Settings change them: switching
   "Floating Maya button" back on did nothing until the app restarted. The
   values now live here, per user, and every hook subscribes to them. */
const store = { userId: undefined, prefs: { ...MAYA_PREF_DEFAULTS }, ready: false };
const subscribers = new Set();
const publish = () => subscribers.forEach((fn) => fn({ ...store }));

function ensureLoaded(userId) {
  if (store.userId === userId) return;
  store.userId = userId;
  store.ready = false;
  store.prefs = { ...MAYA_PREF_DEFAULTS };
  publish();
  loadMayaPrefs(userId).then((p) => {
    if (store.userId !== userId) return; // signed in as somebody else meanwhile
    store.prefs = p;
    store.ready = true;
    publish();
  });
}

/**
 * The prefs, and a setter for one key. `ready` is false until the first read
 * lands, so a toggle never flips from a default to the saved value under the
 * person's finger.
 */
export function useMayaPrefs() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [snap, setSnap] = useState(() => ({ ...store }));

  useEffect(() => {
    subscribers.add(setSnap);
    ensureLoaded(userId);
    setSnap({ ...store });
    return () => { subscribers.delete(setSnap); };
  }, [userId]);

  const setPref = useCallback((key, value) => {
    store.prefs = { ...store.prefs, [key]: value };
    AsyncStorage.setItem(storageKey(userId), JSON.stringify(store.prefs)).catch(() => {});
    publish();
  }, [userId]);

  return { prefs: snap.prefs, setPref, ready: snap.ready };
}
