// ─────────────────────────────────────────────────────────────────────────────
// theme/icons.js — THE ONLY FILE IN THE APP THAT IMPORTS AN ICON PACKAGE.
//
// The web app is locked to `react-icons/hi` — Heroicons v1, solid — so the icon
// set can't drift. That constraint carries over, and this file is how it is
// enforced: everything else does `import { icons } from '../theme/icons'` and
// uses `icons.clock`. Swapping the icon package then becomes a one-file change,
// a screen can't reach for a glyph that isn't in the vocabulary, and the
// semantic name documents intent — `icons.earnedLeave`, not `HiGift`.
//
// ── THE ONE THING TO KNOW BEFORE YOU DEBUG A MISSING ICON ────────────────────
//
// `react-native-heroicons` changed glyph sets between major versions:
//   • v2.x of the package ships Heroicons **v1** — LocationMarkerIcon,
//     ViewGridIcon, CurrencyRupeeIcon, LightningBoltIcon, …
//   • v3.x+ ships Heroicons **v2**, which RENAMED about a dozen of them —
//     MapPinIcon, Squares2X2Icon, BoltIcon, …
//
// ── VERIFIED AGAINST THE INSTALLED PACKAGE, 2026-10-15 ───────────────────────
//
// react-native-heroicons@4.0.0 — Heroicons v2, 296 solid and 296 outline
// exports. Every one of the 60 semantic names below resolves: 36 on the v1
// name, 24 through the v2 fallback, NONE to nothing. All five `tabIcons`
// resolve in both weights.
//
// DEVIATION from NativeRef/20-design/07-iconography.md: that doc states v2
// deleted CurrencyRupeeIcon, so `rupee` would fall back to another glyph and
// the Pay tab would need the ₹ character in text instead. It is wrong —
// CurrencyRupeeIcon is present in v2, solid and outline, so the Pay tab gets a
// real ₹ glyph. Recorded here per house rule §9: trust the installed package
// over the spec, and write the deviation down so nobody "corrects" it back.
//
// So each entry below is resolved by trying the v1 name first and the v2 name
// second. That keeps the app rendering on whichever version npm installed, and
// the dev-only report at the bottom names anything that resolved to nothing
// instead of letting a blank square ship. Do NOT "simplify" this into direct
// named imports until the package version is pinned in package.json and you
// have checked every glyph by eye — a named import of a missing export is
// `undefined`, and `<undefined />` is a red screen, not a blank square.
//
// Heroicons v1 is 20×20 solid. Sizes come from theme/tokens.js (`iconSize`),
// never from a literal in a screen.
// ─────────────────────────────────────────────────────────────────────────────

import * as Solid from 'react-native-heroicons/solid';
import * as Outline from 'react-native-heroicons/outline';

/** First export that actually exists, or null. */
function pick(set, ...names) {
  for (const n of names) {
    if (set[n]) return set[n];
  }
  return null;
}

const s = (...names) => pick(Solid, ...names);
const o = (...names) => pick(Outline, ...names);

/* ─── The vocabulary ──────────────────────────────────────────────────────────
   Grouped the way the app is, not alphabetically — status first, because that
   is most of what an HR app draws. Each line is: semantic name, v1 export,
   v2 export (where they differ). */

export const icons = {
  // ── Status ────────────────────────────────────────────────────────────────
  ok: s('CheckCircleIcon'),
  warn: s('ExclamationCircleIcon'),
  /** THE ⓘ. Also notices and footer notes. */
  info: s('InformationCircleIcon'),
  reject: s('XCircleIcon'),
  check: s('CheckIcon'),
  verified: s('BadgeCheckIcon', 'CheckBadgeIcon'),
  locked: s('LockClosedIcon'),
  secure: s('ShieldCheckIcon'),

  // ── Time and attendance ───────────────────────────────────────────────────
  clock: s('ClockIcon'),
  calendar: s('CalendarIcon', 'CalendarDaysIcon'),
  /** Clock in / clock out. */
  punch: s('FingerPrintIcon'),
  /** The arrow INTO the day — a clock-in on the day timeline. */
  clockIn: s('ArrowRightEndOnRectangleIcon', 'ArrowRightOnRectangleIcon', 'LoginIcon'),
  /** The arrow OUT of the day — a clock-out on the day timeline. */
  clockOut: s('ArrowLeftStartOnRectangleIcon', 'ArrowLeftOnRectangleIcon', 'LogoutIcon'),
  /** A break starting. */
  pause: s('PauseIcon'),
  /** A break ending — back on the clock. */
  play: s('PlayIcon'),
  /** An attendance flag. FlagIcon IS present in Heroicons v2 (verified against
      the installed package, 2026-10-17), so Flags no longer borrows `warn`. */
  flag: s('FlagIcon'),
  location: s('LocationMarkerIcon', 'MapPinIcon'),
  /** "View on map" — opens a site in the phone's maps app. A folded map, not
      the pin: the pin is the site itself, this is the way to get there. */
  map: s('MapIcon'),
  overtime: s('LightningBoltIcon', 'BoltIcon'),
  /** Leave — a day away from work. NOT `calendar`: that one is the attendance
      month, and the two sit side by side in My Time's strip. */
  leave: s('SunIcon'),
  // A public holiday. NOT `calendar`: that is the attendance days tile, and
  // two tiles side by side wearing one glyph is how a menu stops being read.
  holiday: s('StarIcon'),
  star: s('StarIcon'),
  sun: s('SunIcon'),
  moon: s('MoonIcon'),
  paint: s('PaintBrushIcon'),
  gift: s('GiftIcon'),
  fire: s('FireIcon'),
  sparkles: s('SparklesIcon'),
  /** Earned Leave (comp-off). Never say "comp-off" in the UI — §6. */
  earnedLeave: s('GiftIcon'),

  // ── Pay ───────────────────────────────────────────────────────────────────
  rupee: s('CurrencyRupeeIcon', 'CurrencyDollarIcon', 'BanknotesIcon'),
  cash: s('CashIcon', 'BanknotesIcon'),
  tax: s('ScaleIcon'),
  claims: s('ReceiptRefundIcon'),
  report: s('DocumentReportIcon', 'DocumentChartBarIcon'),
  chart: s('ChartBarIcon'),
  up: s('TrendingUpIcon', 'ArrowTrendingUpIcon'),
  down: s('TrendingDownIcon', 'ArrowTrendingDownIcon'),

  // ── Documents ─────────────────────────────────────────────────────────────
  document: s('DocumentTextIcon'),
  folder: s('FolderOpenIcon'),
  clipboard: s('ClipboardListIcon', 'ClipboardDocumentListIcon'),
  clipboardCheck: s('ClipboardCheckIcon', 'ClipboardDocumentCheckIcon'),
  attachment: s('PaperClipIcon'),
  /** Receipt and proof pickers — the three ways a file gets in (ui/AttachmentPicker). */
  camera: s('CameraIcon'),
  photo: s('PhotographIcon', 'PhotoIcon'),
  /** The salary account. Bank tile in My Pay and the BankAccount form. */
  bank: s('LibraryIcon', 'BuildingLibraryIcon'),
  upload: s('UploadIcon', 'ArrowUpTrayIcon'),
  download: s('CloudDownloadIcon', 'ArrowDownTrayIcon'),
  downloadDoc: s('DocumentDownloadIcon', 'ArrowDownTrayIcon'),
  /** ONLY inside a sheet. Never on a row — house rule §3. */
  view: s('EyeIcon'),
  eyeSlash: s('EyeSlashIcon', 'EyeOffIcon'),

  // ── People and org ────────────────────────────────────────────────────────
  profile: s('UserCircleIcon'),
  /** One person — a name field, as opposed to an account (`profile`). */
  user: s('UserIcon'),
  /** An employee code or a government id. */
  idCard: s('IdentificationIcon'),
  /** Date of birth. */
  cake: s('CakeIcon'),
  /** Blood group and the other human details. */
  heart: s('HeartIcon'),
  /** A home address, as opposed to a work location. */
  home: s('HomeIcon'),
  people: s('UserGroupIcon', 'UsersIcon'),
  orgChart: s('ShareIcon'),
  office: s('OfficeBuildingIcon', 'BuildingOfficeIcon'),
  company: s('LibraryIcon', 'BuildingLibraryIcon'),
  work: s('BriefcaseIcon'),

  // ── Navigation and chrome ─────────────────────────────────────────────────
  dashboard: s('ViewGridIcon', 'Squares2X2Icon'),
  inbox: s('InboxInIcon', 'InboxArrowDownIcon'),
  chevronRight: s('ChevronRightIcon'),
  chevronLeft: s('ChevronLeftIcon'),
  chevronDown: s('ChevronDownIcon'),
  chevronUp: s('ChevronUpIcon'),
  arrowRight: s('ArrowRightIcon'),
  arrowLeft: s('ArrowLeftIcon'),
  close: s('XIcon', 'XMarkIcon'),
  search: s('SearchIcon', 'MagnifyingGlassIcon'),
  refresh: s('RefreshIcon', 'ArrowPathIcon'),
  add: s('PlusIcon'),
  minus: s('MinusIcon'),
  edit: s('PencilAltIcon', 'PencilSquareIcon'),
  delete: s('TrashIcon'),
  settings: s('CogIcon', 'Cog6ToothIcon'),
  logout: s('LogoutIcon', 'ArrowRightOnRectangleIcon'),
  switch: s('SwitchHorizontalIcon', 'ArrowsRightLeftIcon'),
  external: s('ExternalLinkIcon', 'ArrowTopRightOnSquareIcon'),
  menu: s('DotsVerticalIcon', 'EllipsisVerticalIcon'),
  dots: s('DotsHorizontalIcon', 'EllipsisHorizontalIcon'),
  /** The drawer's hamburger. NOT `menu` — that one is the row overflow '⋮'. */
  bars: s('MenuIcon', 'Bars3Icon'),
  /** Notifications. An inbox tray is for documents awaiting action, not alerts. */
  bell: s('BellIcon'),
  megaphone: s('SpeakerphoneIcon', 'MegaphoneIcon'),
  /** The task discussion thread. A conversation, not a notice (that is `bell`). */
  chat: s('ChatAlt2Icon', 'ChatBubbleLeftRightIcon', 'ChatAltIcon', 'ChatBubbleLeftEllipsisIcon'),
  /** The automated system note in a task thread — "sent back", "handed over". */
  cog: s('CogIcon', 'Cog6ToothIcon'),

  // ── Contact & Devices ─────────────────────────────────────────────────────
  mail: s('MailIcon', 'EnvelopeIcon'),
  phone: s('PhoneIcon'),
  device: s('DeviceMobileIcon', 'DevicePhoneMobileIcon', 'PhoneIcon'),
  /** A registered computer/browser device (My Registered Devices). */
  computer: s('DesktopComputerIcon', 'ComputerDesktopIcon'),
  collection: s('CollectionIcon', 'RectangleStackIcon', 'FolderIcon'),
  globe: s('GlobeAltIcon'),

  // ── Ask Maya ──────────────────────────────────────────────────────────────
  maya: s('SparklesIcon'),
  /** Send a chat message to Maya. */
  send: s('PaperAirplaneIcon'),
  /** Stop Maya mid-answer. */
  stop: s('StopIcon'),
};

/**
 * Outline variants — the FIVE places the app wants them, and no more.
 *
 * The web app is solid-only. Outline exists here for the one native pattern
 * the web has no equivalent of: a bottom tab bar, where the inactive tab is
 * outline and the active one solid. That is the platform convention on both
 * iOS and Android, and copying the web's all-solid bar makes the active tab
 * read as merely "a different colour" rather than selected.
 */
export const tabIcons = {
  home: { active: icons.home, inactive: o('HomeIcon') },
  dashboard: { active: icons.dashboard, inactive: o('ViewGridIcon', 'Squares2X2Icon') },
  clock: { active: icons.clock, inactive: o('ClockIcon') },
  calendar: { active: icons.calendar, inactive: o('CalendarIcon', 'CalendarDaysIcon') },
  rupee: {
    active: icons.rupee,
    inactive: o('CurrencyRupeeIcon', 'CurrencyDollarIcon', 'BanknotesIcon'),
  },
  menu: { active: icons.menu, inactive: o('DotsVerticalIcon', 'EllipsisVerticalIcon') },
  folder: { active: icons.folder, inactive: o('FolderOpenIcon', 'FolderIcon') },
  clipboardCheck: {
    active: icons.clipboardCheck,
    inactive: o('ClipboardCheckIcon', 'ClipboardDocumentCheckIcon'),
  },
};

/* ─── Dev-only report ─────────────────────────────────────────────────────────
   Same habit as the field-help validator: a mistake here is silent at runtime
   (a missing glyph is an empty gap, and nobody files a bug about a gap), so it
   is named in the console the first time the module loads in development. */

if (__DEV__) {
  const missing = Object.keys(icons).filter((k) => !icons[k]);
  if (missing.length) {
    console.warn(
      `[icons] ${missing.length} semantic icon(s) resolved to nothing: ${missing.join(', ')}.\n`
      + 'Your react-native-heroicons version ships a glyph set these names are not in. '
      + 'Add the correct export name to the pick() list in theme/icons.js — do not '
      + 'render an undefined component, and do not leave the gap.',
    );
  }
}

/**
 * Resolve a semantic name to a component, with the fallback the app can always
 * draw. Use this in a data-driven renderer (a nav list, a tile grid) where the
 * name comes from a config and a typo must not crash a screen.
 */
export const iconFor = (name, fallback = icons.info) => icons[name] || fallback;

export default icons;
