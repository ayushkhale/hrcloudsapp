// ─────────────────────────────────────────────────────────────────────────────
// features/devices/deviceMeta.js — what Device Trust MEANS, for My Registered
// Devices.
//
// PORTED from the web's shared/attendance/deviceTrustMeta.js (CLAUDE.md §10),
// trimmed to what the employee screen reads. Device status LABELS and TONES are
// NOT here — they are in lib/enums.js (`device` kind), drawn by
// <StatusBadge kind="device" />. These are the predicates and the sentences.
//
// Device Trust answers one question at punch time: "did this clock-in come from
// a device the organisation knows about?" On the web a person registers a laptop
// or phone with its screen lock (WebAuthn). THIS NATIVE APP CANNOT RUN THAT
// CEREMONY yet, so the mobile screen reads, renames and shuts off devices but
// does not register them — and says where registration happens instead of
// offering a button that can't work (CLAUDE.md §2).
//
// THE RULE THAT MATTERS: branch on `effective_mode`, never on `mode`. `mode` is
// what HR configured; `effective_mode` is what is in force today — an `enforce`
// with a future `enforce_from` still behaves as `monitor`. An absent/`off`
// context means attendance behaves exactly as before the feature (CLAUDE.md §7).
//
// Contract: HR Clouds web md_attendance/8_device_trust_api_analysis.md.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import { todayYMD } from '../../lib/dates';
import { icons } from '../../theme/icons';

export const DEVICE_MODES = { OFF: 'off', MONITOR: 'monitor', ENFORCE: 'enforce' };

export const DEVICE_NAME_MAX = 100;

/* ── Platforms ────────────────────────────────────────────────────────────── */

const PLATFORM_LABELS = {
  web: 'Computer or browser',
  android: 'Android phone',
  ios: 'iPhone or iPad',
};
export const platformLabel = (value) => PLATFORM_LABELS[String(value || '').toLowerCase()]
  || (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : 'N/A');

/** The platform key for the phone this app is running on. */
export const THIS_PLATFORM = Platform.OS === 'ios' ? 'ios' : 'android';

/* ── What each status means for the device's owner ──────────────────────────
   The badge comes from statusMeta('device', …); these are the sentences under
   it, VERBATIM from the web. */
export const DEVICE_STATUS_NOTES = {
  pending: 'Waiting for HR to approve it. It can’t be used to clock in yet.',
  active: 'Ready to use for clocking in and out.',
  suspended: 'Temporarily blocked. HR can switch it back on.',
  revoked: 'Shut off for good. The same screen lock or fingerprint can’t be registered again.',
};
export const deviceStatusNote = (status) => DEVICE_STATUS_NOTES[String(status || '').toLowerCase()] || '';

/** Only an active device can clock in. */
export const isDeviceUsable = (device) => String(device?.status || '').toLowerCase() === 'active';

/* ── Reading the context ────────────────────────────────────────────────────
   `effectiveModeOf(null)` is "off": an absent context, or the feature switched
   off, both mean "behave exactly as before". */
export function effectiveModeOf(ctx) {
  if (!ctx || ctx.enabled === false) return DEVICE_MODES.OFF;
  const mode = String(ctx.effective_mode || '').toLowerCase();
  return mode === DEVICE_MODES.MONITOR || mode === DEVICE_MODES.ENFORCE ? mode : DEVICE_MODES.OFF;
}

/** Should the device screen and its menu entry exist at all? Feature answered, not off. */
export function deviceTrustVisible(ctx) {
  return !!ctx && ctx.enabled !== false;
}

/** At the cap, a new device would have to replace an existing one. */
export function atDeviceCap(ctx) {
  const max = Number(ctx?.max_active_devices);
  if (!Number.isFinite(max) || max <= 0) return false;
  return Number(ctx?.my_active_device_count || 0) >= max;
}

/** The soft `monitor` banner only makes sense while there is a date to beat. */
export function enforceFromUpcoming(ctx) {
  const from = ctx?.enforce_from;
  return from && String(from) > todayYMD() ? String(from) : null;
}

/* ── How the mode reads to the person (web MyDevicesPage MODE_VIEW) ──────────
   Tones are NOT the HR policy tones (where `enforce` is rose): nothing has gone
   wrong when a device is required — that is the feature working — and rose is
   reserved for errors and destructive actions (CLAUDE.md §5). On = purple,
   watching = blue, off = slate. */
export const MODE_VIEW = {
  [DEVICE_MODES.ENFORCE]: {
    pill: 'Required', tone: 'purple', icon: icons.secure,
    headline: 'A registered device is required to clock in.',
  },
  [DEVICE_MODES.MONITOR]: {
    pill: 'Watch only', tone: 'blue', icon: icons.view,
    headline: 'A registered device isn’t required yet.',
  },
  [DEVICE_MODES.OFF]: {
    pill: 'Not required', tone: 'slate', icon: icons.device,
    headline: 'Your organisation doesn’t ask for a registered device.',
  },
};

export const modeViewOf = (ctx) => MODE_VIEW[ctx?.enabled === false ? DEVICE_MODES.OFF : effectiveModeOf(ctx)]
  || MODE_VIEW[DEVICE_MODES.OFF];

/* ── Ordering the list ──────────────────────────────────────────────────────
   Live devices first, each group newest-used first — or a year of replaced
   phones buries the one the person actually punches from (web header). */
const STATUS_ORDER = { active: 0, pending: 1, suspended: 2, revoked: 3 };
export const sortDevices = (devices) => [...(devices || [])].sort((a, b) => {
  const rank = (d) => STATUS_ORDER[String(d?.status || '').toLowerCase()] ?? 9;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const when = (d) => String(d?.last_used_at || d?.registered_at || d?.created_at || '');
  return when(b).localeCompare(when(a));
});

/**
 * Which registered device is the phone in the person's hand — best effort.
 *
 * On the web this is the id remembered when a registration completed in that
 * browser. This app never registers, so there is no marker; instead, if exactly
 * ONE live device (active or pending) matches this phone's platform, it is
 * almost certainly this one. Two matching devices is genuinely ambiguous, so we
 * say nothing rather than guess. Display-only — nothing is written, so a wrong
 * guess costs nothing and self-corrects.
 */
export function inferThisDevice(devices) {
  const live = (devices || []).filter((d) => {
    const platform = String(d?.platform || '').toLowerCase();
    const alive = d?.status === 'active' || d?.status === 'pending';
    return alive && platform === THIS_PLATFORM;
  });
  return live.length === 1 ? live[0] : null;
}

/** The revoke reason, in the person's words. The only self-revoke value is `user_revoked`. */
export const revokeReasonText = (reason) =>
  (reason === 'user_revoked' ? 'You shut this device off yourself.' : reason || '');
