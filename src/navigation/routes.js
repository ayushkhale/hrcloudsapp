// ─────────────────────────────────────────────────────────────────────────────
// navigation/routes.js — the native equivalent of the web's path hooks.
//
// On the web, nothing builds a link by typing a URL. Every link goes through
// `useMyPayPaths()`, `useMyDocumentPaths()` or `useOrgPaths()`, which return
// **null** for a workspace that has no such page — never another workspace's
// link. That is what stops a shared component from sending a manager to an
// employee URL, and it is the mechanism behind "a capability a role lacks is
// ABSENT, NOT BROKEN" (CLAUDE.md §2).
//
// This is that, for routes.
//
//   const payslips = useRouteTarget('payslips');
//   …
//   {payslips ? <Row title="Payslips" onPress={() => go(payslips)} /> : null}
//
// ── WHY A SHARED COMPONENT MUST NOT NAME A ROUTE ─────────────────────────────
//
// Today there is one workspace and every key resolves, so a hardcoded
// `navigate('PayTab', { screen: 'Payslips' })` works — which is exactly why it
// gets written. The day the manager app ships, that line either throws (the
// route doesn't exist there) or, far worse, silently lands a manager on an
// employee screen. A `null` from this file is a hidden link; a hardcoded name
// is a bug nobody finds until then.
//
// ── A KEY IS A DESTINATION, NOT A SCREEN NAME ────────────────────────────────
//
// The keys are the WEB's vocabulary — `payslips`, `leaves`, `documents` — so a
// screen ported from the web keeps the same word it used there. Where the
// mobile grouping differs (Payslips lives in PayTab, My Documents in MoreTab),
// the difference is absorbed here and nowhere else.
//
// ── NOTHING THAT ISN'T A PLACE ───────────────────────────────────────────────
//
// No form, no modal, no record sheet. A destination is somewhere a person can
// BE and come back from. `ApplyLeave` is deliberately absent: a link to a
// blank form with no list behind it has nothing to go back to, so the caller
// routes to `leaves` and the screen opens its own form. Same reason those
// paths aren't deep-linkable (linking.js).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../state/AuthContext';
import { navigationRef } from './navigationRef';

/**
 * workspace → key → [tabName, screenName].
 *
 * When the manager app arrives it adds a `manager:` block here. It does NOT
 * widen `employee`, and it does not get a fallback (see `useRouteTarget`).
 */
export const ROUTES = {
  employee: {
    // Home
    home: ['HomeTab', 'Home'],
    dayLog: ['HomeTab', 'DayLog'],
    notifications: ['HomeTab', 'Notifications'],

    // Time — one screen, and the third element SELECTS ITS SECTION. The web's
    // MY TIME dropdown has seven entries and they are seven sections of this
    // one screen, so a drawer row has to arrive with the right one open;
    // landing on Attendance every time is how the other six became invisible.
    attendance: ['TimeTab', 'Time', { section: 'attendance' }],
    workLocations: ['TimeTab', 'Time', { section: 'locations' }],
    corrections: ['TimeTab', 'Time', { section: 'corrections' }],
    overtime: ['TimeTab', 'Time', { section: 'overtime' }],
    flags: ['TimeTab', 'Time', { section: 'flags' }],
    earnedLeave: ['TimeTab', 'Time', { section: 'earned' }],
    locationChecks: ['TimeTab', 'Time', { section: 'locationChecks' }],

    // Tasks — matching web MY TASKS. Overdue is a SECTION of My Tasks, not a
    // screen of its own (the web's "Overdue Tasks" route folded in), so the
    // drawer row carries the section the way the My Pay rows do.
    myTasks: ['HomeTab', 'MyTasks'],
    overdueTasks: ['HomeTab', 'MyTasks', { section: 'overdue' }],

    // Leave — under Time now, as it is on the web (sidebar MY TIME → My
    // Leaves). See tabs.employee.js for why it lost its own tab.
    leaves: ['TimeTab', 'Time', { section: 'leave' }],
    holidays: ['TimeTab', 'Time', { section: 'holidays' }],

    // Pay — the web's MY PAY section, key for key. Every one of these is a
    // SECTION of My Pay, not a screen of its own (2026-10-18), so each
    // carries the section it wants and PayScreen clears the param after
    // applying it.
    pay: ['PayTab', 'PayHome'],
    salary: ['PayTab', 'PayHome', { section: 'salary' }],
    payslips: ['PayTab', 'PayHome', { section: 'payslips' }],
    bankAccount: ['PayTab', 'PayHome', { section: 'bank' }],
    claims: ['PayTab', 'PayHome', { section: 'claims' }],
    benefits: ['PayTab', 'PayHome', { section: 'benefits' }],
    loans: ['PayTab', 'PayHome', { section: 'loans' }],
    extras: ['PayTab', 'PayHome', { section: 'extras' }],
    tax: ['PayTab', 'PayHome', { section: 'tax' }],

    // Documents — the web's MY DOCUMENTS section
    // One screen with four sections since 2026-10-20 — the same shape as My
    // Time and My Pay (features/documents/screens/DocumentsScreen.jsx).
    // In HomeTab's stack since 2026-10-22, when Docs gave its tab to
    // Schedules and became a sidebar destination, like My Tasks.
    documentsHome: ['HomeTab', 'DocumentsHome'],
    documents: ['HomeTab', 'DocumentsHome', { section: 'personal' }],
    companyDocuments: ['HomeTab', 'DocumentsHome', { section: 'company' }],
    documentRequests: ['HomeTab', 'DocumentsHome', { section: 'requests' }],
    forms: ['HomeTab', 'DocumentsHome', { section: 'forms' }],

    // Schedules — its own tab, empty for now (tabs.employee.js).
    schedules: ['SchedulesTab', 'Schedules'],

    // Registered devices — the web's MY REGISTERED DEVICES. One pushed screen
    // here (this device + the rest), not the web's two tabs (user, 2026-10-20).
    devices: ['HomeTab', 'Devices'],
    devicesThis: ['HomeTab', 'Devices', { view: 'this' }],
    devicesAll: ['HomeTab', 'Devices', { view: 'all' }],

    // Company and self — in HomeTab's stack, because the drawer that opens
    // them is mounted inside HomeScreen (see tabs.employee.js).
    company: ['HomeTab', 'Company'],
    orgChart: ['HomeTab', 'OrgChart'],
    directory: ['HomeTab', 'Directory'],
    profile: ['HomeTab', 'Profile'],
    settings: ['HomeTab', 'Settings'],
    // Settings › Quick actions — the ✚ sheet's pencil opens it (2026-10-22).
    quickActions: ['HomeTab', 'QuickActions'],
  },
};

/** Every key this app knows, for the dev-time check below. */
export const ROUTE_KEYS = Object.keys(ROUTES.employee);

/**
 * The destination for a key in THIS session's workspace, or `null`.
 *
 * `null` means HIDE THE LINK. Never fall back to another workspace's
 * destination, and never default a missing workspace to `employee` — that is
 * precisely how the web app once let HR walk the employee tabs (CLAUDE.md §2).
 *
 * @param {string} key
 * @returns {[string, string]|null}
 */
export function useRouteTarget(key) {
  const { workspace } = useAuth();
  const target = ROUTES[workspace]?.[key] ?? null;

  if (__DEV__ && workspace && target == null && ROUTE_KEYS.includes(key)) {
    // The key exists for employees but not for this workspace. That is a
    // legitimate `null` — logged once because the usual cause is a typo.
    console.log(`[routes] "${key}" has no destination in the "${workspace}" workspace — link hidden.`);
  }

  return target;
}

/**
 * Navigate to a target from `useRouteTarget`, with optional params.
 *
 * Crossing tabs needs BOTH names — `navigate('PayTab')` alone lands on the
 * tab's root, which is the wrong screen four times out of five. This always
 * passes both, so a cross-tab jump can't quietly become a tab switch.
 *
 *   const go = useGo();
 *   const payslips = useRouteTarget('payslips');
 *   <Row onPress={() => go(payslips, { month: '2026-09' })} />
 */
export function useGo() {
  const navigation = useNavigation();

  return useCallback((target, params) => {
    // A null target is a no-op, not a crash: the caller should have hidden the
    // control, and a dead press is better than a red screen if it didn't.
    if (!Array.isArray(target) || target.length < 2) {
      if (__DEV__) console.log('[routes] go() called with no destination — the link should have been hidden.');
      return;
    }
    // A destination may carry its OWN params as a third element — which
    // section of My Time to open, which tab of the devices page. The caller's
    // params win, so a row can still override one.
    const [tab, screen, defaults] = target;
    const navParams = { screen, params: { ...defaults, ...params } };
    if (navigationRef.isReady()) {
      navigationRef.navigate(tab, navParams);
    } else {
      navigation.navigate(tab, navParams);
    }
  }, [navigation]);
}

/**
 * Key → navigate, for the common case of a menu row.
 *
 *   const { target, go } = useRouteFor('payslips');
 *   {target ? <Row title="Payslips" onPress={go} /> : null}
 */
export function useRouteFor(key, params) {
  const target = useRouteTarget(key);
  const go = useGo();
  return {
    target,
    go: useCallback(() => go(target, params), [go, target, params]),
  };
}

if (__DEV__) {
  // Every destination must name a screen the tab set actually has. A route
  // table pointing at a renamed screen fails as a silent no-op at the tap,
  // weeks later — this says so at startup instead.
  // eslint-disable-next-line global-require
  const { EMPLOYEE_TABS } = require('./tabs.employee');
  const known = new Set(
    EMPLOYEE_TABS.flatMap((t) => t.screens.map((s) => `${t.name}/${s.name}`)),
  );
  const broken = Object.entries(ROUTES.employee)
    .filter(([, [tab, screen]]) => !known.has(`${tab}/${screen}`))
    .map(([key, [tab, screen]]) => `${key} → ${tab}/${screen}`);
  if (broken.length) {
    console.error(`[routes] destinations that don't exist in the tab set:\n  ${broken.join('\n  ')}`);
  }
}

export default ROUTES;
