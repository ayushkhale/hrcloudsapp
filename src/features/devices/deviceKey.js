// ─────────────────────────────────────────────────────────────────────────────
// features/devices/deviceKey.js — this phone as a trusted attendance device.
//
// The backend's `device_key` credential (ATTENDANCE_API_CONTRACT §11; the
// frontend guide §8): a non-exportable P-256 key in the Android Keystore,
// created and used by the native module HRDeviceKey
// (android/…/devicekey/DeviceKeyModule.kt). Every use of the private key needs
// the person's fingerprint, face or screen lock.
//
// Two jobs:
//
//   REGISTER  createKey → POST registration/start (an OTP is emailed) →
//             the person types the code → POST registration/complete with
//             the SPKI public key. RegisterDeviceScreen drives it.
//   PUNCH     punchWithDeviceProof(): challenge → sign the canonical bytes
//             (deviceProofBytes.js) → the punch body plus `device_proof`.
//
// ── DECISIONS, AND WHY ──────────────────────────────────────────────────────
//
// • NO POSSESSION SIGNATURE AT REGISTRATION. The contract makes it optional
//   for device_key ("SPKI public key + optional possession signature",
//   §11.2) and documents NO byte layout for it — the canonical string needs
//   an operation and a device_id, and at registration there is neither. A
//   guessed layout would fail every enrollment with an unexplainable 403.
//   The OTP is the step-up; the first punch proves possession.
//
// • IOS IS ABSENT, NOT BROKEN. There is no Secure Enclave module yet
//   (IOS-TODO.md), so `deviceKeySupported()` is false there and the register
//   button is not drawn (CLAUDE.md §6).
//
// • MONITOR NEVER BLOCKS. In `monitor` the server accepts a punch with no
//   proof, so anything that goes wrong on the phone — a cancelled prompt, a
//   reset key — re-sends the punch WITHOUT `device_proof` and says nothing
//   (guide §3). Only `enforce` turns a phone-side failure into an error.
//
// • A CHALLENGE IS NEVER REUSED. DEVICE_CHALLENGE_INVALID (retriable) starts
//   again from a FRESH challenge, once.
//
// • KEY LOSS IS NORMAL. Adding a fingerprint destroys the key by design
//   (setInvalidatedByBiometricEnrollment). KEY_INVALIDATED forgets this
//   phone's record, so the screen offers registration again.
// ─────────────────────────────────────────────────────────────────────────────

import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { attendanceAPI } from '../../api';
import { canonicalProofBytes, toBase64 } from './deviceProofBytes';

const Native = Platform.OS === 'android' ? NativeModules.HRDeviceKey : null;
if (__DEV__ && Platform.OS !== 'android') {
  // IOS-TODO.md rule 2: an Android-only branch says so, loudly, on the other arm.
  console.warn('[deviceKey] No Secure Enclave module on iOS yet — device registration is hidden. See IOS-TODO.md.');
}

const aliasFor = (userId) => `hrclouds.attendance.${userId}`;
const recordKey = (userId) => `hrclouds.deviceKey.v1:${userId}`;

/** Is the native module here at all? (Android build with HRDeviceKey.) */
export const deviceKeyAvailable = () => !!Native;

/** `{ supported, reason }` — reason NONE_ENROLLED · NO_HARDWARE · UNAVAILABLE · NO_MODULE. */
export async function deviceKeySupported() {
  if (!Native) return { supported: false, reason: 'NO_MODULE' };
  try {
    return await Native.isSupported();
  } catch {
    return { supported: false, reason: 'UNAVAILABLE' };
  }
}

/** A device name to prefill: "Samsung SM-S918B". The person can edit it. */
export function suggestedDeviceName() {
  const c = Platform.constants || {};
  const brand = String(c.Brand || c.Manufacturer || '').trim();
  const model = String(c.Model || '').trim();
  const nice = brand ? brand[0].toUpperCase() + brand.slice(1) : '';
  const name = model.toLowerCase().startsWith(brand.toLowerCase()) ? model : [nice, model].filter(Boolean).join(' ');
  return (name || 'My phone').slice(0, 80);
}

/* ── This phone's record: which server device the key on it belongs to ──── */

/** `{ deviceId, status, registeredAt }` or null. Per user — two people, one phone. */
export async function getThisDeviceRecord(userId) {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(recordKey(userId));
    const rec = raw ? JSON.parse(raw) : null;
    if (!rec?.deviceId) return null;
    // A record without its key is a phone that was restored or reset.
    if (Native && !(await Native.hasKey(aliasFor(userId)))) {
      await AsyncStorage.removeItem(recordKey(userId));
      return null;
    }
    return rec;
  } catch {
    return null;
  }
}

/** Forget this phone's registration locally — key and record. */
export async function forgetThisDevice(userId) {
  if (!userId) return;
  try { await AsyncStorage.removeItem(recordKey(userId)); } catch { /* nothing to forget */ }
  try { await Native?.deleteKey(aliasFor(userId)); } catch { /* already gone */ }
}

/* ── Registration ────────────────────────────────────────────────────────── */

/**
 * Step 1: a fresh key on this phone, then open enrollment (the OTP goes out).
 * Resolves the start response's `data` plus `publicKey`. A 409
 * DEVICE_LIMIT_REACHED is thrown as-is — its `details.devices` is the list
 * to pick a replacement from.
 */
export async function beginRegistration({ userId, deviceName, replaceDeviceId }) {
  if (!Native) throw Object.assign(new Error('Not available on this phone.'), { data: { code: 'DEVICE_UNLOCK_UNAVAILABLE' } });
  const { publicKey } = await Native.createKey(aliasFor(userId));
  const res = await attendanceAPI.startDeviceRegistration({
    credential_type: 'device_key',
    device_name: deviceName,
    ...(replaceDeviceId ? { replace_device_id: String(replaceDeviceId) } : null),
  });
  return { ...(res?.data ?? res), publicKey };
}

/**
 * Step 2: the code from the email. Resolves the new device (`status` is
 * `active`, or `pending` when HR approves registrations) and remembers it.
 */
export async function finishRegistration({ userId, started, otp, deviceName, replaceDeviceId }) {
  const res = await attendanceAPI.completeDeviceRegistration({
    request_id: started.request_id,
    challenge_id: started.challenge_id,
    otp,
    credential_type: 'device_key',
    device_name: deviceName,
    platform: 'android',
    // ABSENT unless replacing — never null. The contract's examples show
    // `"replace_device_id": null`, but the live validator answers
    // "replace_device_id must be a string" (2026-10-21). The API wins (§9).
    ...(replaceDeviceId ? { replace_device_id: String(replaceDeviceId) } : null),
    public_key: started.publicKey,
    signature_algorithm: 'ES256',
  });
  const device = res?.data ?? res;
  if (device?.id) {
    await AsyncStorage.setItem(recordKey(userId), JSON.stringify({
      deviceId: device.id,
      status: device.status || 'active',
      registeredAt: device.registered_at || new Date().toISOString(),
    }));
  }
  return device;
}

/* ── The punch ───────────────────────────────────────────────────────────── */

const PROMPT_TITLE = {
  clock_in: 'Confirm it’s you to clock in',
  clock_out: 'Confirm it’s you to clock out',
  break_start: 'Confirm it’s you to start a break',
  break_end: 'Confirm it’s you to end your break',
};

/* The phone's failures, in the server's error shape (attendanceErrors.js). */
const UNLOCK_CODE = {
  CANCELLED: 'DEVICE_UNLOCK_CANCELLED',
  LOCKED_OUT: 'DEVICE_UNLOCK_LOCKED_OUT',
  NOT_AVAILABLE: 'DEVICE_UNLOCK_UNAVAILABLE',
  KEY_INVALIDATED: 'DEVICE_KEY_RESET',
  NO_KEY: 'DEVICE_KEY_RESET',
};
const phoneError = (nativeCode) => Object.assign(new Error('Device check failed on the phone.'), {
  status: 403,
  data: { code: UNLOCK_CODE[nativeCode] || 'DEVICE_VERIFICATION_FAILED' },
});

const codeOf = (err) => err?.data?.code || err?.data?.errorCode || null;

/** A signed `device_proof` for this operation, or null when none is wanted. */
async function proofFor(operation, userId) {
  const rec = await getThisDeviceRecord(userId);
  if (!rec) return null; // not registered here — the server decides (DEVICE_REQUIRED in enforce)

  let res;
  try {
    res = await attendanceAPI.getDeviceChallenge({ operation, credential_type: 'device_key' });
  } catch {
    return null; // an old server, or offline: the punch itself will say
  }
  const data = res?.data ?? res;
  if (!data?.required || data.registration_required) return null;
  const block = data.device_key;
  // The server's active device is another phone: this key can't sign for it.
  if (!block || block.device_id !== rec.deviceId) return null;

  const bytes = canonicalProofBytes({
    challenge_id: data.challenge_id,
    challenge: block.challenge,
    operation: block.operation,
    device_id: block.device_id,
    user_id: block.user_id,
    org_id: block.org_id,
  });
  try {
    const signature = await Native.sign(
      aliasFor(userId),
      toBase64(bytes),
      PROMPT_TITLE[operation] || 'Confirm it’s you',
      'Your organisation checks that attendance comes from your own phone.',
    );
    return {
      challenge_id: data.challenge_id,
      credential_type: 'device_key',
      device_id: block.device_id,
      signature,
    };
  } catch (err) {
    if (err?.code === 'KEY_INVALIDATED' || err?.code === 'NO_KEY') await forgetThisDevice(userId);
    throw phoneError(err?.code);
  }
}

async function enforced(operation) {
  try {
    const res = await attendanceAPI.getDeviceTrustContext();
    const ctx = res?.data ?? res ?? {};
    const ops = Array.isArray(ctx.enforced_operations) ? ctx.enforced_operations : [];
    return ctx.effective_mode === 'enforce' && ops.includes(operation);
  } catch {
    return false;
  }
}

/**
 * Send one punch, signed when the organisation asks for it.
 *
 * @param {'clock_in'|'clock_out'|'break_start'|'break_end'} operation
 * @param {string} userId
 * @param {object} payload        the punch body exactly as it would go without device trust
 * @param {(body: object) => Promise} send   the attendanceAPI call
 */
export async function punchWithDeviceProof(operation, userId, payload, send) {
  if (!Native || !userId) return send(payload);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let proof;
    try {
      proof = await proofFor(operation, userId);
    } catch (phoneErr) {
      // Monitor never blocks: the same punch, unsigned, and no word about it.
      if (!(await enforced(operation))) return send(payload);
      throw phoneErr;
    }
    if (!proof) return send(payload);
    try {
      return await send({ ...payload, device_proof: proof });
    } catch (err) {
      // Consumed or expired on the way: a FRESH challenge, once (guide §3.1).
      if (codeOf(err) === 'DEVICE_CHALLENGE_INVALID' && attempt === 0) continue;
      throw err;
    }
  }
  // Unreachable: the second attempt either returns or throws.
  throw new Error('Device proof retry exhausted.');
}
