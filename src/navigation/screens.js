// ─────────────────────────────────────────────────────────────────────────────
// navigation/screens.js — name → component.
//
// WHY A REGISTRY RATHER THAN DIRECT IMPORTS IN THE NAVIGATOR:
//
// You are going to build 24 screens over several weeks. Without this file the
// navigator doesn't compile until all 24 exist, so nothing runs until the end —
// which is the worst possible order to build a mobile app in. With it, the app
// RUNS ON DAY ONE: every route resolves, unbuilt ones render a Placeholder that
// says which file to create, and each screen goes live the moment you
// uncomment its line.
//
// HOW TO USE IT: build a screen, uncomment its require. That's the whole
// workflow. Delete the Placeholder machinery once all 24 are in — or keep it;
// it costs nothing in production and the manager app will want it again.
//
// The requires are deliberately NOT static `import`s: a static import of a file
// that doesn't exist is a Metro build failure, while a require inside a try is
// a Placeholder. That is the entire trick.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { EMPLOYEE_SCREEN_NAMES } from './tabs.employee';
import { color, gutter, space, text } from '../theme/tokens';
import { AppTopBar } from './AppTopBar';

/**
 * Where each screen lives once you build it. The paths follow
 * 00-plan/02-architecture.md — `features/<module>/screens/<Name>.jsx`.
 *
 * Uncomment as you go. The comment beside each one is its build spec in
 * 40-screens/.
 */
const MODULES = {
  // ── Phase 2–3: the heart of the app (40-screens/02-home-and-punch.md) ─────
  Home: () => require('../features/home/screens/HomeScreen').default,
  Notifications: () => require('../features/notifications/screens/NotificationsScreen').default,
  NotificationDetail: () => require('../features/notifications/screens/NotificationDetailScreen').default,
  // One day of attendance — a page since 2026-10-21 (it was a sheet nobody
  // could scroll). In both the Home and Time stacks; param `{ date }`.
  DayLog: () => require('../features/attendance/screens/DayLogScreen').default,

  // ── Phase 4: time (40-screens/03-time.md) ────────────────────────────────
  Time: () => require('../features/attendance/screens/TimeScreen').default,
  CorrectionForm: () => require('../features/attendance/screens/CorrectionFormScreen').default,
  // OvertimeForm and EarnedLeaveForm STAY COMMENTED OUT, and not because they
  // are the next thing to build: THERE IS NOTHING FOR THEM TO CALL. No
  // self-claim overtime endpoint and no earned-leave redeem endpoint exists —
  // not in api/attendance.api.js, not in the web app's api module. Overtime is
  // derived from punches and the shift; an earned day is applied for as leave.
  // The Overtime and Earned Leave tabs say so in words instead of offering a
  // button to a form that cannot submit (§2: a capability we lack is absent,
  // not broken). Uncomment them the day those routes land.
  // OvertimeForm:    () => require('../features/attendance/screens/OvertimeFormScreen').default,
  // EarnedLeaveForm: () => require('../features/attendance/screens/EarnedLeaveFormScreen').default,

  // ── Phase 5: leave (40-screens/04-leave.md) ──────────────────────────────
  // `Leave` and `Holidays` ARE NOT ROUTES. They are sections of My Time, like
  // the six beside them — a tile that pushed a screen while its neighbours
  // swapped the body was the one tile people stopped trusting. See
  // features/attendance/components/LeaveTab.jsx. Applying is still a page,
  // because a record being WRITTEN is a page (§3).
  ApplyLeave: () => require('../features/attendance/screens/ApplyLeaveScreen').default,

  // ── Phase 6: pay (00-plan/07-pay-screen-plan.md) ─────────────────────────
  // Salary, Payslips, Claims, Loans and Tax ARE NOT ROUTES — they are the
  // eight sections of My Pay, same as Leave and Holidays under My Time. The
  // three FORMS below stay routes, because a record being WRITTEN is a page.
  PayHome: () => require('../features/pay/screens/PayScreen').default,
  // All three forms are built. The file picker that blocked the last two
  // (07-pay-screen-plan.md §4) is ui/AttachmentPicker.
  BankAccount:     () => require('../features/pay/screens/BankAccountScreen').default,
  ClaimForm:       () => require('../features/pay/screens/ClaimFormScreen').default,
  DeclarationForm: () => require('../features/pay/screens/DeclarationFormScreen').default,

  // ── Phase 7: documents (40-screens/06-documents.md) ──────────────────────
  DocumentsHome:  () => require('../features/documents/screens/DocumentsScreen').default,
  UploadDocument: () => require('../features/documents/screens/UploadDocumentScreen').default,

  // ── Tasks — the web's MY TASKS (#249–#253) ───────────────────────────────
  // MyTasks is the one screen with its status sections and an Overdue section
  // (the web's separate "Overdue Tasks" route folded in, the way My Pay folded
  // its five routes into sections). TaskDetail is a pushed screen, not a sheet,
  // because opening a task is a WRITE and it is a workspace with a keyboard —
  // see MyTasksScreen's header.
  MyTasks:    () => require('../features/tasks/screens/MyTasksScreen').default,
  TaskDetail: () => require('../features/tasks/screens/TaskDetailScreen').default,

  // ── My Registered Devices (web MyDevicesPage) ────────────────────────────
  // A pushed stack screen, not a tab: it shows this device and the rest, with
  // the native back chevron home. One screen, no inner tabs (user, 2026-10-20).
  Devices: () => require('../features/devices/screens/DevicesScreen').default,
  // Registering THIS phone as a device_key (2026-10-21) — a form, so a modal route.
  RegisterDevice: () => require('../features/devices/screens/RegisterDeviceScreen').default,

  // ── Phase 8: org and profile (40-screens/07-org-and-profile.md) ──────────
  // More:      () => require('../features/more/screens/MoreScreen').default,
  // The web's Company section — three pushed stack screens, not tabs (user,
  // 2026-10-20). Read-only for an employee; editing the company and the org is
  // HR's, so those controls are absent here, never present-and-403 (§2).
  Company:   () => require('../features/org/screens/CompanyScreen').default,
  OrgChart:  () => require('../features/org/screens/OrgChartScreen').default,
  Directory: () => require('../features/org/screens/DirectoryScreen').default,
  Profile:   () => require('../features/profile/screens/ProfileScreen').default,
  Settings:  () => require('../features/settings/screens/SettingsScreen').default,
  QuickActions: () => require('../features/settings/screens/QuickActionsScreen').default,

  // ── First run (no spec — product decision) ───────────────────────────────
  Onboarding: () => require('../features/onboarding/screens/OnboardingScreen').default,

  // ── Auth (40-screens/01-auth.md) — Phase 1, built ────────────────────────
  Login: () => require('../features/auth/screens/LoginScreen').default,
  Otp: () => require('../features/auth/screens/OtpScreen').default,
  ForgotPassword: () => require('../features/auth/screens/ForgotPasswordScreen').default,
  NewPassword: () => require('../features/auth/screens/NewPasswordScreen').default,
  SelectOrg: () => require('../features/auth/screens/SelectOrgScreen').default,
};

// WrongWorkspace is NOT in the list above and must never be commented out: it
// is where the role gate lands somebody, and a Placeholder there would tell an
// HR admin "this screen isn't built yet" instead of "this app is for
// employees". It is a real component, inline, with no dependencies.
function WrongWorkspaceFallback() {
  return null; // replaced by the real screen in RootNavigator — see that file
}

const TAB_ROOT_SCREENS = new Set(['Home', 'Time', 'PayHome', 'DocumentsHome', 'MyTasks']);

/** What an unbuilt route renders: the file to create, and nothing else. */
function placeholderFor(name) {
  const isTab = TAB_ROOT_SCREENS.has(name);
  function Placeholder() {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        {isTab ? <AppTopBar /> : null}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: gutter, gap: space[2] }}>
          <Text style={text.label}>Not built yet</Text>
          <Text style={[text.h2, { textAlign: 'center' }]}>{name}</Text>
          <Text style={[text.small, { textAlign: 'center', maxWidth: 300 }]}>
            Create the screen, then uncomment `{name}` in navigation/screens.js.
            Its build spec is in NativeRef/40-screens/.
          </Text>
        </View>
      </View>
    );
  }
  Placeholder.displayName = `Placeholder(${name})`;
  return Placeholder;
}

const cache = new Map();

/**
 * The component for a route name. Never throws, never returns undefined — a
 * missing screen is a Placeholder, so one unbuilt route can't take the
 * navigator down with it.
 */
export function screenFor(name) {
  if (cache.has(name)) return cache.get(name);

  let component;
  const loader = MODULES[name];
  if (loader) {
    try {
      component = loader();
    } catch (err) {
      // The file is named in the registry but doesn't exist (or threw on
      // import). Say which, loudly, and carry on — a typo'd path otherwise
      // shows up as a blank screen with no clue.
      if (__DEV__) console.error(`[screens] "${name}" failed to load:`, err?.message || err);
      component = null;
    }
  }

  const resolved = component || placeholderFor(name);
  cache.set(name, resolved);
  return resolved;
}

/**
 * Is there a real screen behind this route, or would it render the
 * Placeholder? A shortcut to an unbuilt form is a button to nowhere, so the
 * quick-actions catalog asks this before it offers one (CLAUDE.md §6).
 */
export const isScreenBuilt = (name) => !!MODULES[name];

/** Called by RootNavigator to register the real WrongWorkspace screen. */
export function registerScreen(name, component) {
  if (component) cache.set(name, component);
}

if (__DEV__) {
  const missing = EMPLOYEE_SCREEN_NAMES.filter((n) => !MODULES[n]);
  if (missing.length) {
    console.log(
      `[screens] ${EMPLOYEE_SCREEN_NAMES.length - missing.length}/${EMPLOYEE_SCREEN_NAMES.length} built. `
      + `Still placeholders: ${missing.join(', ')}`,
    );
  }
}

export { WrongWorkspaceFallback };
