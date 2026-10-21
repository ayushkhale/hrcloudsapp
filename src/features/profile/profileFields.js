// ─────────────────────────────────────────────────────────────────────────────
// features/profile/profileFields.js — what a profile is made of, and which
// parts of it this person is allowed to change.
//
// Ported from the web's MyProfilePage.jsx. The field list there carries the
// result of a field-by-field probe of PATCH /organizations/me (2026-09-24:
// each key sent back with the value it already held, a write that changes
// nothing but still exercises the whitelist). That is expensive knowledge and
// it is the SAME endpoint, so it is reproduced here rather than rediscovered.
//
// ── THE DISPLAY NAME IS ASYMMETRIC, AND IT IS THE ONE TRAP HERE ──────────────
//
// It is WRITTEN as `display_name` and READ BACK as `name`. The endpoint strips
// `name` on the way in and always returns `display_name: null` on the way out.
// It is also INDEPENDENT of first/last name — an account can read
// `name: "mealex517"` while `first_name` is "Diamond", because the display
// name is what somebody was called when they were invited. So it is its own
// field, never derived, and `displayName()` below is the only place that
// knows about the swap.
//
// ── WHAT IS LOCKED, AND WHY IT IS SHOWN ANYWAY ───────────────────────────────
//
// The endpoint rejects `department`, `designation`, `gender`,
// `marital_status`, `employee_code` and `pan_number` outright (400,
// unknown=false), and accepts neither `phone_number` nor `contact` — so there
// is currently NO WAY for a person to change their own phone number.
//
// A locked field is still shown. §2 says a capability we lack is absent, not
// broken: what is absent is the EDIT, not the fact. Employment information has
// no edit control at all and says in one line who to ask, which is the honest
// version of a disabled button nobody can explain.
//
// ── `avatar_url` IS NOT EDITABLE HERE, AND NOT FOR THE WEB'S REASON ──────────
//
// The web excludes it because every read hands back a presigned link that dies
// in about five minutes, and saving would send a dead link back as the
// person's photo. That is true here too. On top of it, THIS APP CANNOT PICK AN
// IMAGE: package.json has no image picker, so the three-step upload
// (requestAvatarUpload → PUT → confirmAvatarUpload) has no first step. The
// photo is read-only until a picker is added. No "Change photo" button, no
// camera badge on the avatar — an affordance that cannot do anything is worse
// than none.
// ─────────────────────────────────────────────────────────────────────────────

import { icons } from '../../theme/icons';
import { humanize } from '../../lib/enums';
import { fmtDate, ymdOnly } from '../../lib/dates';

/** Everything PATCH /organizations/me accepts. Nothing else may be sent. */
export const EDITABLE_KEYS = [
  'display_name',
  'first_name', 'last_name',
  'dob', 'blood_group', 'personal_email',
  'current_address', 'permanent_address', 'city', 'state', 'pincode',
];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/* ─── The three groups, in reading order ─────────────────────────────────────
   `kind` drives the EDITOR, `locked` keeps a field out of it entirely.
   A group with no unlocked field gets no edit control (see Employment). */

export const PERSONAL_FIELDS = [
  {
    key: 'display_name', label: 'Display name', icon: icons.profile, kind: 'text',
    hint: 'How your name appears across HR Clouds — on your dashboard and to your team.',
    required: true,
  },
  { key: 'first_name', label: 'First name', icon: icons.user, kind: 'text', required: true },
  { key: 'last_name', label: 'Last name', icon: icons.user, kind: 'text' },
  { key: 'email', label: 'Work email', icon: icons.mail, locked: true },
  { key: 'phone_number', label: 'Phone', icon: icons.phone, locked: true },
  // The column is `dob`. Sending `date_of_birth` 400s, so the key matches the
  // API even though the label does not.
  { key: 'dob', label: 'Date of birth', icon: icons.cake, kind: 'date' },
  { key: 'blood_group', label: 'Blood group', icon: icons.heart, kind: 'blood' },
  { key: 'personal_email', label: 'Personal email', icon: icons.mail, kind: 'email' },
];

/**
 * All of it, including what the API may not send.
 *
 * EVERY KEY THE PROFILE PAYLOAD CAN CARRY IS LISTED, and a field with nothing
 * behind it draws "Not set" rather than disappearing (user decision,
 * 2026-10-17: "make sure profile page is showing all data, no matter if its
 * null or what"). A row that vanishes when empty is why people ask HR whether
 * the app even has their joining date — a visible "Not set" answers that, and
 * tells them there is something to go and get filled in.
 *
 * ── THE SPEC NAMED TWO OF THESE WRONG (2026-10-18) ─────────────────────────
 *
 * NativeRef/10-api/03-payload-shapes.md describes this payload in prose and
 * calls them `date_of_joining` and "reporting manager". THE API SENDS NEITHER.
 * The backend contract (`md_organization/4_org_employee_api.md` — the same
 * employee detail view `/organizations/me` reuses) sends:
 *
 *   joining_date             "2022-05-16"
 *   reporting_person_details { name, email }
 *   department_head_details  { name, email }
 *
 * So both rows read "Not set" on every account in the app, while the web shows
 * neither field at all and so never noticed. §9: the live API beats the spec —
 * the keys below are the API's, and `ALIASES` keeps the spec's spellings
 * working in case some endpoint really does answer that way.
 */
export const EMPLOYMENT_FIELDS = [
  { key: 'designation', label: 'Designation', icon: icons.work, locked: true },
  { key: 'department', label: 'Department', icon: icons.office, locked: true },
  { key: 'employee_code', label: 'Employee code', icon: icons.idCard, locked: true },
  { key: 'joining_date', label: 'Joined', icon: icons.calendar, kind: 'date', locked: true },
  { key: 'employment_type', label: 'Employment type', icon: icons.work, locked: true },
  { key: 'reporting_person_details', label: 'Reports to', icon: icons.people, locked: true },
  { key: 'department_head_details', label: 'Department head', icon: icons.people, locked: true },
  { key: 'work_location', label: 'Work location', icon: icons.location, locked: true },
  { key: 'work_mode', label: 'Work mode', icon: icons.clock, locked: true },
  { key: 'gender', label: 'Gender', icon: icons.user, locked: true },
  { key: 'marital_status', label: 'Marital status', icon: icons.heart, locked: true },
];

export const ADDRESS_FIELDS = [
  { key: 'current_address', label: 'Current address', icon: icons.home, kind: 'multiline' },
  { key: 'permanent_address', label: 'Permanent address', icon: icons.home, kind: 'multiline' },
  { key: 'city', label: 'City', icon: icons.location, kind: 'text' },
  { key: 'state', label: 'State', icon: icons.location, kind: 'text' },
  { key: 'pincode', label: 'Pincode', icon: icons.location, kind: 'pincode' },
];

export const SECTIONS = [
  {
    id: 'personal',
    title: 'Personal information',
    fields: PERSONAL_FIELDS,
    note: 'Your work email and phone number are held by HR. Ask them if either is wrong.',
  },
  {
    id: 'employment',
    title: 'Employment information',
    fields: EMPLOYMENT_FIELDS,
    note: 'Your HR team keeps this up to date — none of it can be changed from here.',
  },
  {
    id: 'address',
    title: 'Address',
    fields: ADDRESS_FIELDS,
    note: 'Used for payroll and statutory records, so keep it current.',
  },
];

/* ─── Reading a profile ──────────────────────────────────────────────────── */

/** Written as `display_name`, read back as `name`. See the header. */
export const displayName = (p) => p?.display_name || p?.name || '';

/** `contact` on some reads, `phone_number` on others. */
export const phoneOf = (p) => p?.phone_number ?? p?.contact ?? '';

/**
 * `department` arrives as EITHER a name or a `{ name }` row — the 2026-10-02
 * repair migration started rewriting that column. Rendering the object would
 * throw and take the screen with it.
 */
const flatten = (value) => {
  if (!value || typeof value !== 'object') return value;
  // A person comes back under any of these, depending on the endpoint that
  // joined them in. `reporting_manager` is the one that actually varies.
  const joined = [value.name, value.display_name, value.full_name]
    .find((v) => typeof v === 'string' && v.trim());
  if (joined) return joined;
  const parts = [value.first_name, value.last_name].filter(Boolean).join(' ').trim();
  return parts || '';
};

/**
 * A field's key, then the other keys the same fact has been seen under. In
 * order: the API's own spelling first, the spec's second (see
 * EMPLOYMENT_FIELDS), so a correct payload never depends on a fallback.
 */
const ALIASES = {
  joining_date: ['joining_date', 'date_of_joining', 'doj'],
  reporting_person_details: ['reporting_person_details', 'reporting_person_name', 'reporting_manager', 'reporting_person'],
  department_head_details: ['department_head_details', 'department_head_name', 'department_head'],
};

/**
 * `reporting_person` is a USER ID on most endpoints and a name on none of
 * them, but it sits in the alias chain because a flattened `{ name }` can
 * arrive under it too. §4 — never show somebody a UUID — so a value shaped
 * like one is treated as nothing at all and the row reads "Not set".
 */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const usable = (value) => (
  value !== null && value !== undefined && value !== ''
  && !(typeof value === 'string' && UUID_LIKE.test(value.trim()))
);

/** The raw value behind a field, before any formatting. */
export function rawValue(profile, key) {
  if (key === 'display_name') return displayName(profile);
  if (key === 'phone_number') return phoneOf(profile);

  const chain = ALIASES[key];
  if (chain) {
    for (const alias of chain) {
      const value = flatten(profile?.[alias]);
      if (usable(value)) return value;
    }
    return null;
  }
  return flatten(profile?.[key]);
}

const ENUM_KEYS = new Set(['gender', 'marital_status', 'work_mode', 'employment_type', 'job_status']);

/**
 * What a field reads as on screen. `null` means NOT SET, which the row draws
 * as "Not set" — never an empty line and never a dash (§8).
 */
export function shownValue(profile, field) {
  const value = rawValue(profile, field.key);
  if (value === null || value === undefined || value === '') return null;
  if (field.kind === 'date') return fmtDate(ymdOnly(value), '');
  // Raw enums never reach the screen (§4). These are the only keys that
  // arrive as one — `employment_type` is `full_time`, not "Full time".
  if (ENUM_KEYS.has(field.key)) return humanize(value);
  return String(value);
}

/* ─── Writing a profile ──────────────────────────────────────────────────── */

/** The form's starting values for one section — only its editable fields. */
export function seedFrom(profile, fields) {
  const seed = {};
  for (const field of fields) {
    if (field.locked) continue;
    const value = rawValue(profile, field.key);
    seed[field.key] = value == null ? '' : String(value);
  }
  return seed;
}

const trimmed = (value) => (typeof value === 'string' ? value.trim() : value);

/**
 * ONLY WHAT CHANGED. The endpoint takes a partial body and rejects the whole
 * request if it carries a key outside the whitelist, so sending the profile
 * back wholesale fails — and sending unchanged fields would overwrite an edit
 * somebody else made while this screen was open.
 */
export function changedFields(profile, form) {
  const payload = {};
  for (const key of EDITABLE_KEYS) {
    if (!(key in form)) continue;
    const next = trimmed(form[key]) ?? '';
    const prev = trimmed(rawValue(profile, key)) ?? '';
    if (String(next) !== String(prev)) payload[key] = next;
  }
  return payload;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Problems, keyed by field — the shape useFormFocus and `Field` expect.
 *
 * Only what the SERVER will refuse, plus the two names it will accept as empty
 * and then show nobody a name. A profile is somebody's own record; a form that
 * argues with them about their own address helps no one.
 */
export function validateProfile(form) {
  const errors = {};
  const has = (key) => key in form;
  const val = (key) => String(form[key] ?? '').trim();

  if (has('display_name') && !val('display_name')) {
    errors.display_name = 'A display name is needed — it is what people see.';
  }
  if (has('first_name') && !val('first_name')) {
    errors.first_name = 'A first name is needed.';
  }
  if (has('personal_email') && val('personal_email') && !EMAIL.test(val('personal_email'))) {
    errors.personal_email = 'That doesn’t look like an email address.';
  }
  if (has('pincode') && val('pincode') && !/^\d{6}$/.test(val('pincode'))) {
    errors.pincode = 'A pincode is six digits.';
  }
  return errors;
}
