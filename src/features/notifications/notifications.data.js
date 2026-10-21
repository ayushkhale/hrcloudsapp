// ─────────────────────────────────────────────────────────────────────────────
// features/notifications/notifications.data.js — PLACEHOLDER CONTENT.
//
// THERE IS NO NOTIFICATIONS ENDPOINT YET. The gateway has no /notifications
// route and no announcements route (api/*.api.js is the full surface), so this
// module stands in for one and the screens are built against the shape we WANT
// the API to return, not against whatever is convenient to render.
//
// ── WHY FAKE DATA LIVES IN ITS OWN MODULE AND NOT IN THE SCREEN ──────────────
//
// So that wiring the real endpoint is a one-file change. `listNotifications()`
// and `getNotification(id)` are already async and already return the envelope
// the rest of the app's reads return, which means the screens handle loading
// and failure today — the two states that are always bolted on last and always
// wrong. Swapping the body of those two functions for a `request()` call is
// then the whole job.
//
// ── THE SHAPE ────────────────────────────────────────────────────────────────
//
//   id          string
//   category    one of CATEGORIES below — drives the filter strip and the icon
//   title       one line, sentence case
//   preview     the two-line body shown in the list
//   body        the full text, paragraphs separated by a blank line
//   created_at  ISO instant. The list groups and formats from THIS, never from
//               a pre-formatted "10:30 AM" string — a server that sends display
//               text decides the reader's timezone for them.
//   read        boolean — the unread dot
//   attachment  { name, size_label } | null
//
// EVERY DATE IS COMPUTED RELATIVE TO NOW so the screen always has a believable
// "Today / Yesterday / last week" spread instead of dates from whenever this
// file was written.
// ─────────────────────────────────────────────────────────────────────────────

/** The filter strip, in order. `all` is not a category — it is the absence of one. */
export const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'hr', label: 'HR Updates' },
  { value: 'leave', label: 'Leave' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'attendance', label: 'Attendance' },
];

/**
 * category → the semantic icon name from theme/icons.js plus the tone key from
 * theme/tokens.js. A category the data invents resolves through `metaFor()`
 * below rather than rendering a blank tile.
 */
export const CATEGORY_META = {
  announcement: { icon: 'info', tone: 'purple', label: 'Announcement' },
  hr: { icon: 'clipboard', tone: 'indigo', label: 'HR update' },
  leave: { icon: 'calendar', tone: 'emerald', label: 'Leave' },
  payroll: { icon: 'rupee', tone: 'amber', label: 'Payroll' },
  attendance: { icon: 'clock', tone: 'blue', label: 'Attendance' },
  document: { icon: 'document', tone: 'slate', label: 'Document' },
};

export const metaFor = (category) => CATEGORY_META[category] || CATEGORY_META.document;

/** `days` ago at `hh:mm` local, as an ISO instant. */
function ago(days, hh = 10, mm = 30) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

const SEED = [
  {
    id: 'n-1',
    category: 'announcement',
    title: 'New work-from-office policy',
    preview: 'Please review the updated work-from-office policy, effective from the 1st of next month.',
    body: [
      'Dear Team,',
      'We are sharing an important update to our work-from-office policy, effective from the 1st of next month.',
      'The update introduces a hybrid working model, fixed office days per team, and flexible working guidelines intended to support better collaboration without losing the flexibility everyone has been working with this year.',
      'Please take a moment to read the full policy document attached below. If you have any questions, your reporting manager or the HR team can walk you through what changes for your team specifically.',
      'Thank you,\nHR Team',
    ].join('\n\n'),
    created_at: ago(0, 10, 30),
    read: false,
    attachment: { name: 'Work-from-office-policy.pdf', size_label: '2.4 MB' },
  },
  {
    id: 'n-2',
    category: 'leave',
    title: 'Leave request approved',
    preview: 'Your leave request has been approved by your reporting manager.',
    body: [
      'Your leave request has been approved.',
      'The days have been deducted from your Earned Leave balance and your attendance for those days will show as "On leave". You can see the updated balance on the Leave tab.',
      'If your plans change, cancel the request from the Leave tab before the first day — once a leave has started it has to be cancelled by your manager.',
    ].join('\n\n'),
    created_at: ago(0, 9, 15),
    read: false,
    attachment: null,
  },
  {
    id: 'n-3',
    category: 'payroll',
    title: 'Payslip available',
    preview: 'Last month’s payslip is now available. You can view and download it from the Pay tab.',
    body: [
      'Your payslip for last month has been released.',
      'You can view the full breakdown — earnings, deductions and net pay — on the Pay tab, and download a PDF copy for your records.',
      'If anything looks wrong, raise it with the payroll team within seven days of release so it can be corrected in the current cycle rather than as an adjustment in the next one.',
    ].join('\n\n'),
    created_at: ago(1, 18, 5),
    read: false,
    attachment: null,
  },
  {
    id: 'n-4',
    category: 'attendance',
    title: 'Missing check-out on Tuesday',
    preview: 'Your attendance for Tuesday has no check-out time. Submit a correction so the day is counted.',
    body: [
      'We could not find a check-out time against your attendance for Tuesday.',
      'A day without a check-out is not counted towards worked hours, and it stays open until it is corrected.',
      'Open My Time, find the day, and submit a correction with the time you actually left. Your manager will see the request and approve it.',
    ].join('\n\n'),
    created_at: ago(1, 8, 40),
    read: true,
    attachment: null,
  },
  {
    id: 'n-5',
    category: 'hr',
    title: 'Welcome to the team',
    preview: 'A new colleague has joined the product team this week.',
    body: [
      'Please join us in welcoming a new member to the product team.',
      'They will be working across the mobile and web products, and will be reaching out to each team over the next couple of weeks to get up to speed.',
      'You can find their details and reporting line in the Directory.',
    ].join('\n\n'),
    created_at: ago(3, 11, 0),
    read: true,
    attachment: null,
  },
  {
    id: 'n-6',
    category: 'announcement',
    title: 'Office closed for the public holiday',
    preview: 'The office will remain closed on the upcoming public holiday. Support rosters are unchanged.',
    body: [
      'The office will remain closed for the upcoming public holiday.',
      'Teams on a support roster should follow the schedule already shared by their manager; everyone else is not expected to be reachable that day.',
      'The holiday is already reflected in the attendance calendar, so no leave needs to be applied for.',
    ].join('\n\n'),
    created_at: ago(5, 16, 20),
    read: true,
    attachment: null,
  },
  {
    id: 'n-7',
    category: 'hr',
    title: 'Documents verified',
    preview: 'The documents you submitted have been verified. No further action is needed.',
    body: [
      'The documents you submitted have been checked and verified.',
      'Nothing further is needed from you. You can see the current state of each document, including anything still outstanding, under My Documents.',
    ].join('\n\n'),
    created_at: ago(7, 14, 10),
    read: true,
    attachment: null,
  },
];

/* The in-memory store. Marking something read has to survive leaving the screen
   and coming back, and until there is an endpoint this is where that lives.
   A module-level array is correct for placeholder data and WRONG for the real
   thing — the real one re-reads from the server. */
let store = SEED.map((n) => ({ ...n }));

const byNewest = (a, b) => (a.created_at < b.created_at ? 1 : -1);

/** Pretend-network delay, so loading states are visible in development. */
const settle = (value, ms = 220) => new Promise((resolve) => { setTimeout(() => resolve(value), ms); });

/**
 * @param {{category?: string}} params
 * @returns {Promise<{notifications: object[], unread: number}>}
 */
export async function listNotifications({ category = 'all' } = {}) {
  const all = [...store].sort(byNewest);
  const notifications = category === 'all' ? all : all.filter((n) => n.category === category);
  return settle({ notifications, unread: all.filter((n) => !n.read).length });
}

/** @returns {Promise<object|null>} */
export async function getNotification(id) {
  return settle(store.find((n) => n.id === id) || null, 80);
}

/** How many are unread, synchronously — for the bell badge on Home. */
export const unreadCount = () => store.filter((n) => !n.read).length;

export function markRead(id) {
  store = store.map((n) => (n.id === id ? { ...n, read: true } : n));
  return unreadCount();
}

export function markAllRead() {
  store = store.map((n) => ({ ...n, read: true }));
  return 0;
}

/**
 * The newest announcements, for the Home strip. Home shows ANNOUNCEMENTS only
 * — a leave approval or a payslip notice belongs in the bell, not pinned to
 * the dashboard where it stays long after it was acted on.
 */
export async function listAnnouncements(limit = 2) {
  const rows = [...store].filter((n) => n.category === 'announcement').sort(byNewest);
  return settle({ announcements: rows.slice(0, limit) });
}
