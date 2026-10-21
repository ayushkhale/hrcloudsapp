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
//
// ── EVERYTHING IN THE APP IS A CANDIDATE (user, 2026-10-22) ─────────────────
//
// "Add more features in it — all in our app — in the replaceable screen."
// The catalog is every destination the sidebar has, grouped the way the
// sidebar groups them, plus every form and Ask Maya. Keys of the original
// entries are unchanged, so saved choices survive. A new destination is ONE
// line here; `isAvailable` hides any whose route this workspace lacks.
//
// Three kinds: `form` (a modal route in a tab), `route` (a routes.js key),
// `run: 'maya'` (opens the assistant; absent when Maya has no key).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NAV, TERMS } from '../../config/dictionary';
import { icons } from '../../theme/icons';
import { ROUTES } from '../../navigation/routes';
import { navigationRef } from '../../navigation/navigationRef';
import { tabsForWorkspace } from '../../navigation/tabs.employee';
import { useAuth } from '../../state/AuthContext';
import { mayaAvailable, openMaya } from '../maya/mayaBridge';

export const QUICK_ACTION_SLOTS = 6;

/* The first six are the sheet's original actions, with their original words.
   Every destination wears the sidebar's icon for it (CLAUDE.md §5: one
   destination, one icon). Labels stay short: a card is half a phone wide. */
const START = 'Start something';
const TIME = 'My Time';
const PAY = 'My Pay';
const DOCS = 'My Documents';
const WORK = 'Work & people';
const ACCOUNT = 'Account';

export const QUICK_ACTION_CATALOG = [
  { key: 'applyLeave', group: START, label: 'Apply for Leave', caption: 'Request time off or sick leave', icon: icons.leave || icons.calendar, form: ['TimeTab', 'ApplyLeave'] },
  { key: 'correction', group: START, label: 'Request Correction', caption: 'Fix a missed clock-in or status', icon: icons.edit, form: ['TimeTab', 'CorrectionForm'] },
  { key: 'claim', group: START, label: 'Make a Claim', caption: 'Submit expense or allowance', icon: icons.claims || icons.rupee, form: ['PayTab', 'ClaimForm'] },
  { key: 'uploadDocument', group: START, label: 'Upload Document', caption: 'Share personal or tax documents', icon: icons.upload || icons.document, form: ['HomeTab', 'UploadDocument'] },
  { key: 'declaration', group: START, label: 'Declare Investment', caption: 'Submit tax saving proof (80C, HRA)', icon: icons.tax || icons.report, form: ['PayTab', 'DeclarationForm'] },
  { key: 'bank', group: START, label: 'Bank Account', caption: 'Update details for salary credit', icon: icons.bank, form: ['PayTab', 'BankAccount'] },
  { key: 'registerDevice', group: START, label: 'Register Phone', caption: 'Make this your clock-in phone', icon: icons.device, form: ['HomeTab', 'RegisterDevice'] },
  { key: 'askMaya', group: START, label: 'Ask Maya', caption: 'Questions about leave, pay and more', icon: icons.maya, run: 'maya' },

  { key: 'attendance', group: TIME, label: 'My Attendance', caption: 'Your days this month', icon: icons.clock, route: 'attendance' },
  { key: 'workLocations', group: TIME, label: 'Work Locations', caption: 'Where you can clock in', icon: icons.location, route: 'workLocations' },
  { key: 'leaves', group: TIME, label: 'My Leaves', caption: 'Balances and requests', icon: icons.leave || icons.calendar, route: 'leaves' },
  { key: 'corrections', group: TIME, label: `${TERMS.REGULARIZATION}s`, caption: 'Requests and decisions', icon: icons.edit, route: 'corrections' },
  { key: 'overtime', group: TIME, label: 'My Overtime', caption: 'Extra hours and approvals', icon: icons.overtime, route: 'overtime' },
  { key: 'flags', group: TIME, label: 'My Flags', caption: 'Attendance that needs a look', icon: icons.flag, route: 'flags' },
  { key: 'earnedLeave', group: TIME, label: `My ${TERMS.COMP_OFF}`, caption: 'Days earned for off days', icon: icons.earnedLeave, route: 'earnedLeave' },
  { key: 'holidays', group: TIME, label: 'Holidays', caption: 'This year’s calendar', icon: icons.holiday, route: 'holidays' },
  { key: 'schedules', group: TIME, label: 'My Schedules', caption: 'Your shifts and weekly offs', icon: icons.schedule || icons.calendar, route: 'schedules' },

  { key: 'pay', group: PAY, label: 'My Pay', caption: 'What reached your bank', icon: icons.rupee, route: 'pay' },
  { key: 'payslips', group: PAY, label: 'My Payslips', caption: 'Every month’s pay', icon: icons.document, route: 'payslips' },
  { key: 'salary', group: PAY, label: 'My Salary', caption: 'Your salary structure', icon: icons.chart, route: 'salary' },
  { key: 'myClaims', group: PAY, label: 'My Claims', caption: 'Expenses you’ve claimed', icon: icons.claims || icons.rupee, route: 'claims' },
  { key: 'benefits', group: PAY, label: 'Benefits', caption: 'Insurance and other plans', icon: icons.heart, route: 'benefits' },
  { key: 'loans', group: PAY, label: 'Loans & Advances', caption: 'What you still owe', icon: icons.cash, route: 'loans' },
  { key: 'extras', group: PAY, label: 'Variable Pay', caption: 'Bonuses and adjustments', icon: icons.up, route: 'extras' },
  { key: 'tax', group: PAY, label: 'My Tax', caption: 'Tax so far this year', icon: icons.tax, route: 'tax' },

  { key: 'documentsHome', group: DOCS, label: 'My Documents', caption: 'Everything in one place', icon: icons.folder, route: 'documentsHome' },
  { key: 'personalDocuments', group: DOCS, label: 'Personal Docs', caption: 'IDs and certificates', icon: icons.folder, route: 'documents' },
  { key: 'companyDocuments', group: DOCS, label: 'Company Docs', caption: 'Letters and policies for you', icon: icons.office, route: 'companyDocuments' },
  { key: 'documentRequests', group: DOCS, label: 'Doc Requests', caption: 'What HR has asked for', icon: icons.clipboard, route: 'documentRequests' },
  { key: 'forms', group: DOCS, label: 'Forms', caption: 'Blank forms and templates', icon: icons.attachment, route: 'forms' },

  { key: 'myTasks', group: WORK, label: 'My Tasks', caption: 'Work given to you', icon: icons.clipboardCheck, route: 'myTasks' },
  // The drawer has both, so the catalog does too — the same two doors, the
  // same icons (user, 2026-10-20).
  { key: 'overdueTasks', group: WORK, label: 'Overdue Tasks', caption: 'Past the deadline, not handed in', icon: icons.flag, route: 'overdueTasks' },
  { key: 'directory', group: WORK, label: NAV.DIRECTORY, caption: 'Find a colleague', icon: icons.people, route: 'directory' },
  { key: 'orgChart', group: WORK, label: 'Org Chart', caption: 'Who reports to whom', icon: icons.orgChart, route: 'orgChart' },
  { key: 'orgProfile', group: WORK, label: 'Org Profile', caption: 'Your organization’s details', icon: icons.company, route: 'company' },

  { key: 'notifications', group: ACCOUNT, label: 'Notifications', caption: 'What’s new for you', icon: icons.bell, route: 'notifications' },
  { key: 'profile', group: ACCOUNT, label: 'My Profile', caption: 'Your details and photo', icon: icons.profile, route: 'profile' },
  { key: 'devices', group: ACCOUNT, label: 'My Devices', caption: 'Phones you clock in from', icon: icons.device, route: 'devicesAll' },
  { key: 'settings', group: ACCOUNT, label: 'Settings', caption: 'Privacy, actions and more', icon: icons.settings, route: 'settings' },
];

/** The original six, slot by slot. */
export const DEFAULT_QUICK_ACTIONS = ['applyLeave', 'correction', 'claim', 'uploadDocument', 'declaration', 'bank'];

const BY_KEY = new Map(QUICK_ACTION_CATALOG.map((a) => [a.key, a]));
export const quickActionFor = (key) => BY_KEY.get(key) || null;

/** Does this action have somewhere to go in this workspace? */
export function isAvailable(action, workspace) {
  if (!action) return false;
  if (action.run === 'maya') return mayaAvailable();
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
  if (!action) return;
  if (action.run === 'maya') { openMaya(); return; }
  if (!navigationRef.isReady()) return;
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
