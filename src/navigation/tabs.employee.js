// ─────────────────────────────────────────────────────────────────────────────
// navigation/tabs.employee.js — THE TAB SET IS DATA.
//
// That is the whole point of this file. When the manager app arrives it adds
// `tabs.manager.js` beside this one and AppTabs reads whichever the session's
// workspace names. It does NOT add conditionals to this file, and it does not
// widen the role gate (state/session.js). One role, one workspace, one tab set.
//
// ── FIVE TABS IS THE MAXIMUM ─────────────────────────────────────────────────
//
// A sixth means the grouping is wrong. The web employee sidebar has five
// sections and 24 screens; they map onto five tabs as below.
//
// ── THE ORDER, AND WHY HOME IS IN THE MIDDLE (2026-10-17) ────────────────────
//
//   Home · Time · ✚ · Pay · Schedules   (Docs moved to the sidebar 2026-10-22;
//   Schedules took its slot. The notes below are the history.)
//
// Home is the third of five because the centre slot is the one a thumb
// reaches without moving the hand, and Home is where the punch button is.
// The two most-opened sections sit on either side of it; the two that are
// read rather than used sit outside them.
//
// This replaced Home · Time · Leave · Pay · More. What changed and why:
//
//   • LEAVE lost its tab and moved INSIDE My Time, which is where the web
//     sidebar keeps it (MY TIME → My Leaves). It had a tab while there was a
//     slot going spare; Docs and Tasks are whole sections of the web menu and
//     outrank one screen.
//   • MORE is gone. A tab whose job is "everything else" is a menu with a tab
//     bar slot, and this app already has a real menu — AppDrawer, which lists
//     every section of the web sidebar. Its screens moved into HomeTab's
//     stack, because that is where the drawer is mounted.
//   • DOCS and TASKS are the web's MY DOCUMENTS and MY TASKS sections, each
//     of which was previously reachable only through the drawer.
//
// ── WHY PayTab IS ONE SCREEN, LIKE TimeTab (2026-10-18) ─────────────────────
//
// It used to be a menu of five cards that each pushed a screen. Five routes
// is five native headers and five back presses for figures people read
// AGAINST each other — what reached the bank, what is still owed, tax so far.
// My Pay now has the same shape as My Time: one root, a grid of eight
// sections, the body swapping underneath. See
// 00-plan/07-pay-screen-plan.md for the decision, and PayScreen.jsx's header
// for the mapping from the web's sidebar.
//
// Payslips is the natural default, the way Attendance is for Time.
//
// ── THE TITLE RULE ───────────────────────────────────────────────────────────
//
// `title` here is the native header title AND the screen's own <h1> AND, for a
// tab root, the tab label. Those three must be the same words (CLAUDE.md §2).
// It is the fastest parity check there is, so the strings live here once rather
// than being typed per screen.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `presentation`:
 *   undefined → a pushed stack screen (native header, back chevron)
 *   'modal'   → a full-screen FormSheet (its own header with an X)
 *
 * A record being READ is not here at all: a RecordSheet is local state inside
 * the screen that owns the list, not a route. Routing a sheet means the list
 * behind it unmounts, and the master–detail illusion is the point of it.
 */
export const EMPLOYEE_TABS = [
  {
    name: 'HomeTab',
    label: 'Home',
    icon: 'home',
    screens: [
      { name: 'Home', title: 'Home', headerShown: false },
      { name: 'DayLog', title: 'Attendance Log' },
      { name: 'Notifications', title: 'Notifications' },
      { name: 'NotificationDetail', title: 'Notification' },
      { name: 'Profile', title: 'My Profile' },
      { name: 'Settings', title: 'Settings' },
      { name: 'QuickActions', title: 'Quick actions' },
      // The picker, a page since 2026-10-22 (a sheet of ~40 cards wouldn't scroll well).
      { name: 'QuickActionPick', title: 'Change shortcut' },
      { name: 'Company', title: 'Org Profile' },
      { name: 'OrgChart', title: 'Org Chart' },
      { name: 'Directory', title: 'Directory' },
      { name: 'Devices', title: 'My Registered Devices' },
      { name: 'RegisterDevice', title: 'Register this phone', presentation: 'modal' },
      // Overdue is a SECTION of My Tasks, not a route — the same shape as My
      // Pay's sections (routes.js `overdueTasks` carries { section: 'overdue' }).
      // A PUSHED screen with the native header and a back button (user,
      // 2026-10-20) — it is not a tab, so it must not wear the tab roots'
      // greeting bar, and the tab bar hides under it (AppTabs).
      { name: 'MyTasks', title: 'My Tasks' },
      { name: 'TaskDetail', title: 'Task' },
      // My Documents left the tab bar for the sidebar (user, 2026-10-22) — a
      // pushed screen now, like My Tasks, with the native back header. Its
      // sections and the upload form are unchanged.
      { name: 'DocumentsHome', title: 'My Documents' },
      { name: 'UploadDocument', title: 'Upload a document', presentation: 'modal' },
      // Records READ on a page, not a sheet, because they hold too much for
      // one (user, 2026-10-22; ui/RecordPage.jsx).
      { name: 'CompanyDocument', title: 'Company document' },
      { name: 'MyDocument', title: 'My document' },
    ],
  },
  {
    name: 'TimeTab',
    label: 'Time',
    icon: 'clock',
    screens: [
      { name: 'Time', title: 'My Time', headerShown: false },
      { name: 'DayLog', title: 'Attendance Log' },
      { name: 'CorrectionForm', title: 'Request a correction', presentation: 'modal' },
      { name: 'ApplyLeave', title: 'Apply for leave', presentation: 'modal' },
      { name: 'OvertimeForm', title: 'Claim overtime', presentation: 'modal' },
      { name: 'EarnedLeaveForm', title: 'Use earned leave', presentation: 'modal' },
      // Read on a page (2026-10-22) — it hid content in a sheet.
      { name: 'EarnedLeaveDay', title: 'Earned Leave' },
    ],
  },
  {
    name: 'PayTab',
    label: 'Pay',
    icon: 'rupee',
    screens: [
      { name: 'PayHome', title: 'My Pay', headerShown: false },
      { name: 'BankAccount', title: 'Bank account', presentation: 'modal' },
      { name: 'ClaimForm', title: 'Make a claim', presentation: 'modal' },
      { name: 'DeclarationForm', title: 'Declare an investment', presentation: 'modal' },
      // Records READ on a page, not a sheet — too much for one (2026-10-22).
      { name: 'PayslipDetail', title: 'Payslip' },
      { name: 'SalaryRevision', title: 'Salary revision' },
      { name: 'LoanDetail', title: 'Loan' },
      { name: 'ClaimDetail', title: 'Claim' },
    ],
  },
  {
    // Took Docs' slot on 2026-10-22 (user: "move My Docs to the sidebar and
    // replace it with a new tab, My Schedules"). Empty for now — see
    // features/schedules/screens/SchedulesScreen.jsx.
    name: 'SchedulesTab',
    label: 'Schedules',
    icon: 'schedule',
    screens: [
      { name: 'Schedules', title: 'My Schedules', headerShown: false },
    ],
  },
];

/** Every screen name in the tab set, for the registry's dev-time check. */
export const EMPLOYEE_SCREEN_NAMES = EMPLOYEE_TABS
  .flatMap((tab) => tab.screens.map((s) => s.name));

/**
 * The tab set for a workspace. There is exactly one today, and the gate in
 * state/session.js guarantees nothing else reaches AppTabs — but this returns
 * `null` for an unknown workspace rather than defaulting to employee, because
 * "default to employee" is precisely how the web app once let HR walk the
 * employee tabs (CLAUDE.md §2).
 */
export function tabsForWorkspace(workspace) {
  if (workspace === 'employee') return EMPLOYEE_TABS;
  return null;
}
