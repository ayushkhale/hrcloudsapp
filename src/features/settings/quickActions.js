// ─────────────────────────────────────────────────────────────────────────────
// features/settings/quickActions.js — what the centre ✚ button offers.
//
// One catalog, one saved choice, read by two places:
//
//   navigation/ActionSheet.jsx                      the sheet the ✚ tab opens
//   features/settings/screens/SettingsScreen.jsx    where a slot is replaced
//
// ── ALWAYS SIX SLOTS. REPLACE, NEVER ADD OR REMOVE (user, 2026-10-18) ───────
//
// The sheet always holds exactly six actions — the original six by default.
// The person can REPLACE what sits in a slot with another action from the
// catalog, and that is all: no adding, no removing, no empty slot, no
// reordering list. "we dont want user to edit anything, we have these 6
// default which were earlier, he can replace only."
//
// Picking an action that is already in another slot SWAPS the two, so the six
// stay six and stay unique.
//
// Saved per user on this phone (AsyncStorage): a phone preference with no
// server endpoint behind it. Two people sharing a phone each keep their own.
//
// ── A SLOT THAT CANNOT GO ANYWHERE FALLS BACK TO ITS DEFAULT ────────────────
//
// A saved key that is unknown, or whose destination this workspace lacks, is
// replaced on read by that slot's default (and, failing that, the first
// unused catalog entry). The six default forms are routes in the tab set, so
// they are always offered — exactly as before this setting existed.
//
// ── WHY THE SHEET NAVIGATES THROUGH navigationRef ───────────────────────────
//
// The sheet is mounted BESIDE the tab navigator in AppTabs, so
// `useNavigation()` there is the ROOT stack's navigation — which has no
// 'TimeTab' route. Every press used to fail with "The action 'NAVIGATE' … was
// not handled by any navigator". `navigationRef` dispatches to the focused
// navigator and bubbles up. A FORM in another tab opens with `initial: false`,
// so closing it lands on that tab's root, not an empty stack.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NAV, TERMS } from '../../config/dictionary';
import { icons } from '../../theme/icons';
import { ROUTES } from '../../navigation/routes';
import { navigationRef } from '../../navigation/navigationRef';
import { tabsForWorkspace } from '../../navigation/tabs.employee';
import { useAuth } from '../../state/AuthContext';

export const QUICK_ACTION_SLOTS = 6;

/* The first six are the sheet's original actions, with their original words.
   `form` opens a modal route in a tab; `route` is a routes.js key. */
export const QUICK_ACTION_CATALOG = [
  { key: 'applyLeave', group: 'Start something', label: 'Apply for Leave', caption: 'Request time off or sick leave', icon: icons.leave || icons.calendar, form: ['TimeTab', 'ApplyLeave'] },
  { key: 'correction', group: 'Start something', label: 'Request Correction', caption: 'Fix a missed clock-in or status', icon: icons.edit, form: ['TimeTab', 'CorrectionForm'] },
  { key: 'claim', group: 'Start something', label: 'Make a Claim', caption: 'Submit expense or allowance', icon: icons.claims || icons.rupee, form: ['PayTab', 'ClaimForm'] },
  { key: 'uploadDocument', group: 'Start something', label: 'Upload Document', caption: 'Share personal or tax documents', icon: icons.upload || icons.document, form: ['DocsTab', 'UploadDocument'] },
  { key: 'declaration', group: 'Start something', label: 'Declare Investment', caption: 'Submit tax saving proof (80C, HRA)', icon: icons.tax || icons.report, form: ['PayTab', 'DeclarationForm'] },
  { key: 'bank', group: 'Start something', label: 'Bank Account', caption: 'Update details for salary credit', icon: icons.bank, form: ['PayTab', 'BankAccount'] },

  { key: 'payslips', group: 'Go to', label: 'My Payslips', caption: 'Every month’s pay', icon: icons.document, route: 'payslips' },
  { key: 'attendance', group: 'Go to', label: 'My Attendance', caption: 'Your days this month', icon: icons.clock, route: 'attendance' },
  { key: 'leaves', group: 'Go to', label: 'My Leaves', caption: 'Balances and requests', icon: icons.calendar, route: 'leaves' },
  { key: 'holidays', group: 'Go to', label: 'Holidays', caption: 'This year’s calendar', icon: icons.holiday, route: 'holidays' },
  { key: 'earnedLeave', group: 'Go to', label: `My ${TERMS.COMP_OFF}`, caption: 'Days earned for off days', icon: icons.earnedLeave, route: 'earnedLeave' },
  { key: 'tax', group: 'Go to', label: 'My Tax & Investments', caption: 'Tax so far this year', icon: icons.tax, route: 'tax' },
  { key: 'myTasks', group: 'Go to', label: 'My Tasks', caption: 'Work given to you', icon: icons.clipboardCheck, route: 'myTasks' },
  // The drawer has both, so the catalog does too — the same two doors, the
  // same icons (user, 2026-10-20).
  { key: 'overdueTasks', group: 'Go to', label: 'Overdue Tasks', caption: 'Past the deadline, not handed in', icon: icons.flag, route: 'overdueTasks' },
  { key: 'directory', group: 'Go to', label: NAV.DIRECTORY, caption: 'Find a colleague', icon: icons.people, route: 'directory' },
  { key: 'notifications', group: 'Go to', label: 'Notifications', caption: 'What’s new for you', icon: icons.bell, route: 'notifications' },
];

/** The original six, slot by slot. */
export const DEFAULT_QUICK_ACTIONS = ['applyLeave', 'correction', 'claim', 'uploadDocument', 'declaration', 'bank'];

const BY_KEY = new Map(QUICK_ACTION_CATALOG.map((a) => [a.key, a]));
export const quickActionFor = (key) => BY_KEY.get(key) || null;

/** Does this action have somewhere to go in this workspace? */
export function isAvailable(action, workspace) {
  if (!action) return false;
  if (action.route) return !!ROUTES[workspace]?.[action.route];
  const [tab, screen] = action.form || [];
  const tabs = tabsForWorkspace(workspace) || [];
  return tabs.some((t) => t.name === tab && t.screens.some((s) => s.name === screen));
}

export function availableActions(workspace) {
  return QUICK_ACTION_CATALOG.filter((a) => isAvailable(a, workspace));
}

/** Exactly six unique, available keys: the saved ones, gaps filled by defaults. */
function clean(saved, workspace) {
  const list = Array.isArray(saved) ? saved : [];
  const out = [];
  const used = new Set();
  const ok = (k) => k && !used.has(k) && isAvailable(BY_KEY.get(k), workspace);
  const spare = () => QUICK_ACTION_CATALOG.map((a) => a.key).find(ok);
  for (let i = 0; i < QUICK_ACTION_SLOTS; i += 1) {
    const k = [list[i], DEFAULT_QUICK_ACTIONS[i]].find(ok) || spare();
    if (!k) break;
    used.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Put `key` into slot `index`. If it already sits in another slot, the two
 * swap — the sheet always holds six different actions.
 */
export function replaceSlot(keys, index, key) {
  const next = [...keys];
  const from = next.indexOf(key);
  if (from === index) return next;
  if (from >= 0) next[from] = next[index];
  next[index] = key;
  return next;
}

/* ── The store: one value per user, shared by every reader ─────────────────── */

const storageKey = (userId) => `hrclouds.quickActions.v2:${userId || 'anon'}`;
const cache = new Map(); // userId → keys
const listeners = new Set();

async function load(userId) {
  if (cache.has(userId)) return cache.get(userId);
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const keys = raw ? JSON.parse(raw) : null;
    cache.set(userId, Array.isArray(keys) ? keys : null);
  } catch {
    cache.set(userId, null);
  }
  return cache.get(userId);
}

/** Save the six. Anything that isn't six is a bug in the caller, not a user. */
export async function saveQuickActions(userId, keys) {
  if (!Array.isArray(keys) || keys.length !== QUICK_ACTION_SLOTS) {
    throw new Error('Quick actions always hold six actions.');
  }
  cache.set(userId, keys);
  listeners.forEach((fn) => fn(userId));
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(keys));
}

/** The person's six quick actions, as catalog entries, slot by slot. */
export function useQuickActions() {
  const { user, workspace } = useAuth();
  const userId = user?.id;
  const [saved, setSaved] = useState(() => (cache.has(userId) ? cache.get(userId) : undefined));

  useEffect(() => {
    let cancelled = false;
    load(userId).then((keys) => { if (!cancelled) setSaved(keys); });
    const onChange = (changed) => { if (changed === userId) setSaved(cache.get(userId)); };
    listeners.add(onChange);
    return () => {
      cancelled = true;
      listeners.delete(onChange);
    };
  }, [userId]);

  const keys = useMemo(() => clean(saved, workspace), [saved, workspace]);
  return {
    ready: saved !== undefined,
    keys,
    actions: keys.map((k) => BY_KEY.get(k)),
    userId,
    workspace,
  };
}

/** Open an action from anywhere — including from outside the tab navigator. */
export function runQuickAction(action, workspace) {
  if (!navigationRef.isReady() || !action) return;
  if (action.form) {
    const [tab, screen] = action.form;
    navigationRef.navigate(tab, { screen, initial: false });
    return;
  }
  const target = ROUTES[workspace]?.[action.route];
  if (!target) return;
  const [tab, screen, params] = target;
  navigationRef.navigate(tab, { screen, params: { ...params } });
}
