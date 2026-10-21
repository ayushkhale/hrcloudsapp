// ─────────────────────────────────────────────────────────────────────────────
// features/devices/deviceProofBytes.js — the exact bytes a device key signs.
//
// Spec: ref docs device_trust_frontend_guide.md §8.3, and NOTHING here may be
// "simplified". Field order is fixed; each value is its UTF-8 bytes exactly as
// the server returned it, prefixed by its BYTE length as a u32 big-endian. The
// length prefixes are what stop ("ab","c") and ("a","bc") signing the same —
// a join('|') would be a forgery primitive.
//
//   "HRMS-ATTN-DEVICE-PROOF-v1"
//   || u32be(len) || challenge_id || u32be(len) || challenge || u32be(len) || operation
//   || u32be(len) || device_id    || u32be(len) || user_id   || u32be(len) || org_id
//
// Pure JS, no React Native import, so __tests__/deviceProofBytes.test.js can
// check it against the guide's verified vector (244 bytes, sha256 e4414570…).
// NOTE: 8_device_trust_api_analysis.md §9.1 prints a DIFFERENT vector; it is
// wrong (its inputs make 249 bytes, not the 244 it claims). The guide's is the
// one that reproduces — checked 2026-10-21.
//
// Build these ONLY from the challenge response's `device_key` block, never
// from cached state: a stale org_id signs the wrong bytes and the server can
// only answer DEVICE_VERIFICATION_FAILED.
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable no-bitwise -- UTF-8, u32 big-endian and base64 ARE bit operations. */

export const PROOF_DOMAIN = 'HRMS-ATTN-DEVICE-PROOF-v1';
export const PROOF_FIELDS = ['challenge_id', 'challenge', 'operation', 'device_id', 'user_id', 'org_id'];

/** UTF-8 bytes of a string. Hand-rolled: TextEncoder is not on every Hermes build. */
export function utf8Bytes(str) {
  const out = [];
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/**
 * The canonical byte string, as a Uint8Array.
 * @param {Record<string, string>} fields  every name in PROOF_FIELDS, as strings
 */
export function canonicalProofBytes(fields) {
  const bytes = utf8Bytes(PROOF_DOMAIN);
  for (const key of PROOF_FIELDS) {
    const value = fields?.[key];
    if (typeof value !== 'string' || !value) {
      throw new Error(`Device proof is missing "${key}".`);
    }
    const v = utf8Bytes(value);
    const n = v.length;
    bytes.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    for (let i = 0; i < n; i += 1) bytes.push(v[i]);
  }
  return Uint8Array.from(bytes);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard (padded) base64 of a byte array — what the native module decodes. */
export function toBase64(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}${B64[(n >> 6) & 63]}=`;
  }
  return out;
}
