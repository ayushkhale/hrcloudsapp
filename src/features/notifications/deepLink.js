// ─────────────────────────────────────────────────────────────────────────────
// features/notifications/deepLink.js — one place that knows which screen a
// server-side event_key or notification opens.
//
// Every notification carries `metadata.screen` and `metadata.id` (the deep
// link contract from the catalog). The server's screen names are the WEB's
// vocabulary; the native app translates them to a tab + screen pair.
// Where a notification doesn't name a screen explicitly, its category or
// event_key can resolve the destination.
//
// A notification without a target (e.g. announcements / system notices) returns
// null — a dead control is worse than an honest absence (CLAUDE.md §4).
// ─────────────────────────────────────────────────────────────────────────────

import { navigationRef } from '../../navigation/navigationRef';

/** Safely parse metadata if provided as a JSON string or object. */
export function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Normalize screen key for case-insensitive and snake_case matching. */
function normalizeKey(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[-_\s]/g, '').toLowerCase();
}

/**
 * server screen name → navigate(target).
 * Target is [tabName, screenName, optionalParams].
 */
const SCREENS = {
  // Leave
  leaverequestdetail: () => ['TimeTab', 'Time', { section: 'leave' }],
  leaverequests: () => ['TimeTab', 'Time', { section: 'leave' }],
  leaverequest: () => ['TimeTab', 'Time', { section: 'leave' }],
  leavedetail: () => ['TimeTab', 'Time', { section: 'leave' }],
  leavedetails: () => ['TimeTab', 'Time', { section: 'leave' }],
  leaves: () => ['TimeTab', 'Time', { section: 'leave' }],
  leave: () => ['TimeTab', 'Time', { section: 'leave' }],
  myleaves: () => ['TimeTab', 'Time', { section: 'leave' }],
  applyleave: () => ['TimeTab', 'ApplyLeave'],

  // Attendance
  attendanceanomalies: () => ['TimeTab', 'Time', { section: 'flags' }],
  attendanceanomaly: () => ['TimeTab', 'Time', { section: 'flags' }],
  anomalies: () => ['TimeTab', 'Time', { section: 'flags' }],
  flags: () => ['TimeTab', 'Time', { section: 'flags' }],

  regularization: () => ['TimeTab', 'Time', { section: 'corrections' }],
  regularizations: () => ['TimeTab', 'Time', { section: 'corrections' }],
  attendanceregularization: () => ['TimeTab', 'Time', { section: 'corrections' }],
  attendanceregularizations: () => ['TimeTab', 'Time', { section: 'corrections' }],
  corrections: () => ['TimeTab', 'Time', { section: 'corrections' }],
  correctionform: () => ['TimeTab', 'CorrectionForm'],

  attendance: () => ['TimeTab', 'Time', { section: 'attendance' }],
  attendances: () => ['TimeTab', 'Time', { section: 'attendance' }],
  attendancelog: () => ['TimeTab', 'Time', { section: 'attendance' }],
  daylog: () => ['TimeTab', 'DayLog'],

  locationcheck: () => ['TimeTab', 'Time', { section: 'locationChecks' }],
  locationchecks: () => ['TimeTab', 'Time', { section: 'locationChecks' }],
  locationcheckrequest: () => ['TimeTab', 'Time', { section: 'locationChecks' }],
  location: () => ['TimeTab', 'Time', { section: 'locations' }],
  locations: () => ['TimeTab', 'Time', { section: 'locations' }],
  worklocations: () => ['TimeTab', 'Time', { section: 'locations' }],

  overtime: () => ['TimeTab', 'Time', { section: 'overtime' }],
  overtimes: () => ['TimeTab', 'Time', { section: 'overtime' }],

  compoff: () => ['TimeTab', 'Time', { section: 'earned' }],
  compoffs: () => ['TimeTab', 'Time', { section: 'earned' }],
  earnedleave: () => ['TimeTab', 'Time', { section: 'earned' }],
  earnedleaves: () => ['TimeTab', 'Time', { section: 'earned' }],

  holidays: () => ['TimeTab', 'Time', { section: 'holidays' }],
  holiday: () => ['TimeTab', 'Time', { section: 'holidays' }],

  // Payroll
  payslip: () => ['PayTab', 'PayHome', { section: 'payslips' }],
  payslips: () => ['PayTab', 'PayHome', { section: 'payslips' }],
  payslipdetail: (p) => (p?.id ? ['PayTab', 'PayslipDetail', { payslipId: p.id }] : ['PayTab', 'PayHome', { section: 'payslips' }]),

  reimbursementdetail: () => ['PayTab', 'PayHome', { section: 'claims' }],
  reimbursement: () => ['PayTab', 'PayHome', { section: 'claims' }],
  reimbursements: () => ['PayTab', 'PayHome', { section: 'claims' }],
  claim: () => ['PayTab', 'PayHome', { section: 'claims' }],
  claims: () => ['PayTab', 'PayHome', { section: 'claims' }],
  claimdetail: (p) => (p?.id ? ['PayTab', 'ClaimDetail', { claimId: p.id }] : ['PayTab', 'PayHome', { section: 'claims' }]),

  salary: () => ['PayTab', 'PayHome', { section: 'salary' }],
  salaryrevision: () => ['PayTab', 'PayHome', { section: 'salary' }],
  salarystructure: () => ['PayTab', 'PayHome', { section: 'salary' }],

  benefit: () => ['PayTab', 'PayHome', { section: 'benefits' }],
  benefits: () => ['PayTab', 'PayHome', { section: 'benefits' }],

  loan: () => ['PayTab', 'PayHome', { section: 'loans' }],
  loans: () => ['PayTab', 'PayHome', { section: 'loans' }],
  loandetail: (p) => (p?.id ? ['PayTab', 'LoanDetail', { loanId: p.id }] : ['PayTab', 'PayHome', { section: 'loans' }]),

  bank: () => ['PayTab', 'PayHome', { section: 'bank' }],
  bankaccount: () => ['PayTab', 'PayHome', { section: 'bank' }],

  tax: () => ['PayTab', 'PayHome', { section: 'tax' }],
  taxdeclaration: () => ['PayTab', 'PayHome', { section: 'tax' }],

  pay: () => ['PayTab', 'PayHome'],
  mypay: () => ['PayTab', 'PayHome'],

  // Tasks
  taskdetail: (p) => (p?.id ? ['HomeTab', 'TaskDetail', { task: { id: p.id } }] : ['HomeTab', 'MyTasks']),
  taskdetails: (p) => (p?.id ? ['HomeTab', 'TaskDetail', { task: { id: p.id } }] : ['HomeTab', 'MyTasks']),
  task: (p) => (p?.id ? ['HomeTab', 'TaskDetail', { task: { id: p.id } }] : ['HomeTab', 'MyTasks']),
  tasks: () => ['HomeTab', 'MyTasks'],
  mytasks: () => ['HomeTab', 'MyTasks'],
  overduetasks: () => ['HomeTab', 'MyTasks', { section: 'overdue' }],

  // Documents
  documents: () => ['HomeTab', 'DocumentsHome', { section: 'personal' }],
  document: () => ['HomeTab', 'DocumentsHome', { section: 'personal' }],
  mydocuments: () => ['HomeTab', 'DocumentsHome', { section: 'personal' }],
  documentshome: () => ['HomeTab', 'DocumentsHome', { section: 'personal' }],
  companydocuments: () => ['HomeTab', 'DocumentsHome', { section: 'company' }],
  companydocument: (p) => (p?.id ? ['HomeTab', 'CompanyDocument', { documentId: p.id }] : ['HomeTab', 'DocumentsHome', { section: 'company' }]),
  documentrequests: () => ['HomeTab', 'DocumentsHome', { section: 'requests' }],
  documentrequest: () => ['HomeTab', 'DocumentsHome', { section: 'requests' }],
  forms: () => ['HomeTab', 'DocumentsHome', { section: 'forms' }],
  uploaddocument: () => ['HomeTab', 'UploadDocument'],

  // Shift / Schedules
  shifts: () => ['SchedulesTab', 'Schedules'],
  shift: () => ['SchedulesTab', 'Schedules'],
  schedules: () => ['SchedulesTab', 'Schedules'],
  schedule: () => ['SchedulesTab', 'Schedules'],
  myschedules: () => ['SchedulesTab', 'Schedules'],

  // Devices
  devices: () => ['HomeTab', 'Devices'],
  device: () => ['HomeTab', 'Devices'],
  registereddevices: () => ['HomeTab', 'Devices'],

  // Profile / Org
  profile: () => ['HomeTab', 'Profile'],
  myprofile: () => ['HomeTab', 'Profile'],
  company: () => ['HomeTab', 'Company'],
  orgchart: () => ['HomeTab', 'OrgChart'],
  directory: () => ['HomeTab', 'Directory'],
  settings: () => ['HomeTab', 'Settings'],
};

/** Known tab sections for direct navigation */
const KNOWN_SECTIONS = {
  // TimeTab
  attendance: ['TimeTab', 'Time', { section: 'attendance' }],
  locations: ['TimeTab', 'Time', { section: 'locations' }],
  leave: ['TimeTab', 'Time', { section: 'leave' }],
  corrections: ['TimeTab', 'Time', { section: 'corrections' }],
  overtime: ['TimeTab', 'Time', { section: 'overtime' }],
  flags: ['TimeTab', 'Time', { section: 'flags' }],
  earned: ['TimeTab', 'Time', { section: 'earned' }],
  holidays: ['TimeTab', 'Time', { section: 'holidays' }],
  locationChecks: ['TimeTab', 'Time', { section: 'locationChecks' }],
  locationchecks: ['TimeTab', 'Time', { section: 'locationChecks' }],
  // PayTab
  salary: ['PayTab', 'PayHome', { section: 'salary' }],
  payslips: ['PayTab', 'PayHome', { section: 'payslips' }],
  bank: ['PayTab', 'PayHome', { section: 'bank' }],
  claims: ['PayTab', 'PayHome', { section: 'claims' }],
  benefits: ['PayTab', 'PayHome', { section: 'benefits' }],
  loans: ['PayTab', 'PayHome', { section: 'loans' }],
  extras: ['PayTab', 'PayHome', { section: 'extras' }],
  tax: ['PayTab', 'PayHome', { section: 'tax' }],
  // Documents
  personal: ['HomeTab', 'DocumentsHome', { section: 'personal' }],
  company: ['HomeTab', 'DocumentsHome', { section: 'company' }],
  requests: ['HomeTab', 'DocumentsHome', { section: 'requests' }],
  forms: ['HomeTab', 'DocumentsHome', { section: 'forms' }],
};

/**
 * Resolve a notification or metadata object to a destination tuple:
 * `[tabName, screenName, params]` or `null`.
 *
 * @param {object} itemOrMetadata
 * @returns {[string, string, object?]|null}
 */
export function resolveNotificationTarget(itemOrMetadata) {
  if (!itemOrMetadata) return null;

  const rawMetadata = itemOrMetadata.metadata ?? itemOrMetadata;
  const metadata = parseMetadata(rawMetadata);
  const id = metadata.id || metadata.taskId || metadata.recordId || itemOrMetadata.id;
  const params = { id, taskId: id };

  // 1. Direct screen name in metadata
  const screenCandidate = metadata.screen || metadata.target || metadata.route || metadata.type || itemOrMetadata.screen;
  if (screenCandidate) {
    const key = normalizeKey(screenCandidate);
    const resolver = SCREENS[key];
    if (resolver) {
      const target = resolver(params);
      if (Array.isArray(target) && target.length >= 2) return target;
    }
  }

  // 2. Direct section name in metadata
  const sectionCandidate = metadata.section || itemOrMetadata.section;
  if (sectionCandidate && KNOWN_SECTIONS[sectionCandidate]) {
    return KNOWN_SECTIONS[sectionCandidate];
  }

  // 3. Location check notifications (type, section, action or keyword in title/body)
  const title = String(itemOrMetadata.title || metadata.title || '').toLowerCase();
  const msg = String(itemOrMetadata.message || itemOrMetadata.body || metadata.message || '').toLowerCase();
  if (
    metadata.type === 'location_check'
    || metadata.section === 'locationChecks'
    || metadata.action === 'REQUEST_LOCATION'
    || title.includes('location check')
    || title.includes('location fetched')
    || title.includes('location requested')
    || (title.includes('location') && msg.includes('location'))
  ) {
    return ['TimeTab', 'Time', { section: 'locationChecks' }];
  }

  // 4. Fallback by event_key
  const eventKey = String(metadata.event_key || itemOrMetadata.event_key || '').toLowerCase();
  if (eventKey) {
    if (eventKey.startsWith('leave.')) return ['TimeTab', 'Time', { section: 'leave' }];
    if (eventKey.startsWith('attendance.regularization') || eventKey.startsWith('regularization.')) {
      return ['TimeTab', 'Time', { section: 'corrections' }];
    }
    if (eventKey.startsWith('attendance.location_check') || eventKey.startsWith('location_check.')) {
      return ['TimeTab', 'Time', { section: 'locationChecks' }];
    }
    if (eventKey.startsWith('attendance.anomaly') || eventKey.startsWith('attendance.flag')) {
      return ['TimeTab', 'Time', { section: 'flags' }];
    }
    if (eventKey.startsWith('attendance.overtime') || eventKey.startsWith('overtime.')) {
      return ['TimeTab', 'Time', { section: 'overtime' }];
    }
    if (eventKey.startsWith('attendance.comp_off') || eventKey.startsWith('attendance.earned')) {
      return ['TimeTab', 'Time', { section: 'earned' }];
    }
    if (eventKey.startsWith('attendance.') || eventKey.startsWith('punch.')) {
      return ['TimeTab', 'Time', { section: 'attendance' }];
    }
    if (eventKey.startsWith('payroll.payslip')) return ['PayTab', 'PayHome', { section: 'payslips' }];
    if (eventKey.startsWith('payroll.claim') || eventKey.startsWith('payroll.reimbursement')) {
      return ['PayTab', 'PayHome', { section: 'claims' }];
    }
    if (eventKey.startsWith('payroll.salary')) return ['PayTab', 'PayHome', { section: 'salary' }];
    if (eventKey.startsWith('payroll.benefit')) return ['PayTab', 'PayHome', { section: 'benefits' }];
    if (eventKey.startsWith('payroll.loan')) return ['PayTab', 'PayHome', { section: 'loans' }];
    if (eventKey.startsWith('payroll.')) return ['PayTab', 'PayHome', { section: 'payslips' }];
    if (eventKey.startsWith('task.')) {
      return id ? ['HomeTab', 'TaskDetail', { task: { id } }] : ['HomeTab', 'MyTasks'];
    }
    if (eventKey.startsWith('document.company')) return ['HomeTab', 'DocumentsHome', { section: 'company' }];
    if (eventKey.startsWith('document.request')) return ['HomeTab', 'DocumentsHome', { section: 'requests' }];
    if (eventKey.startsWith('document.')) return ['HomeTab', 'DocumentsHome', { section: 'personal' }];
    if (eventKey.startsWith('shift.') || eventKey.startsWith('schedule.')) return ['SchedulesTab', 'Schedules'];
    if (eventKey.startsWith('device.')) return ['HomeTab', 'Devices'];
  }

  // 5. Fallback by category
  const category = String(metadata.category || itemOrMetadata.category || '').toLowerCase();
  if (category) {
    if (category === 'leave') return ['TimeTab', 'Time', { section: 'leave' }];
    if (category === 'attendance') return ['TimeTab', 'Time', { section: 'attendance' }];
    if (category === 'payroll') return ['PayTab', 'PayHome', { section: 'payslips' }];
    if (category === 'task') return id ? ['HomeTab', 'TaskDetail', { task: { id } }] : ['HomeTab', 'MyTasks'];
    if (category === 'document') return ['HomeTab', 'DocumentsHome', { section: 'personal' }];
    if (category === 'shift') return ['SchedulesTab', 'Schedules'];
    if (category === 'employee') return ['HomeTab', 'Profile'];
    // 'system' or announcements have no target screen
    if (category === 'system') return null;
  }

  return null;
}

/** Check if a notification can be deep-linked. */
export function canNavigateNotification(itemOrMetadata) {
  return resolveNotificationTarget(itemOrMetadata) !== null;
}

/**
 * Dispatch navigation to a target tuple `[tab, screen, params]`.
 */
export function navigateToTarget(navigation, target) {
  if (!Array.isArray(target) || target.length < 2) return false;
  const [tab, name, defaults] = target;
  const navParams = { screen: name, params: { ...defaults } };

  try {
    // 1. Root navigation container has the tab navigator and knows all tabs and stacks
    if (navigationRef.isReady()) {
      navigationRef.navigate(tab, navParams);
      return true;
    }

    // 2. Parent tab navigator if available
    const parent = navigation?.getParent?.();
    if (parent?.navigate) {
      parent.navigate(tab, navParams);
      return true;
    }

    // 3. Current navigator if in the same tab
    if (tab === 'HomeTab' && navigation?.navigate) {
      navigation.navigate(name, defaults || {});
      return true;
    }

    // 4. Direct navigation fallback
    if (navigation?.navigate) {
      navigation.navigate(tab, navParams);
      return true;
    }
  } catch (err) {
    if (__DEV__) console.warn('[deepLink] navigate failed:', err?.message || err);
    return false;
  }
  return false;
}

/**
 * Navigate to the target of a notification.
 *
 * @param {object} navigation
 * @param {object} itemOrMetadata
 * @returns {boolean} true if navigated, false if target could not be resolved
 */
export function navigateNotification(navigation, itemOrMetadata) {
  const target = resolveNotificationTarget(itemOrMetadata);
  if (!target) return false;
  return navigateToTarget(navigation, target);
}

/**
 * Backward compatibility: translate `metadata` to a navigate call.
 * Accepts optional third parameter `item` for full context.
 *
 * @param {object} navigation
 * @param {object|string} metadata
 * @param {object} [item]
 */
export function navigateFromMetadata(navigation, metadata, item) {
  const payload = item ? { ...item, metadata: metadata || item.metadata } : (metadata || {});
  return navigateNotification(navigation, payload);
}

/** Same, but driven straight off the navigation ref — for push taps outside a screen. */
export function navigateFromPushData(data) {
  if (!data) return false;
  return navigateNotification(null, data);
}

