// ─────────────────────────────────────────────────────────────────────────────
// authErrors.js — what we tell somebody who cannot get in.
//
// ── WHY AUTH NEEDS ITS OWN MAPPER ────────────────────────────────────────────
//
// Every other module maps HTTP 401 to "your session ended". On `/auth/*` that
// sentence is actively wrong: a 401 here means THE PASSWORD WAS WRONG, and
// telling somebody their session expired while they are trying to start one
// reads as a broken app. api/client.js already knows this and refuses to sign
// anyone out on an `/auth/*` 401 (its NON_SESSION_401_CODES); this file is the
// copy half of the same rule.
//
// The one exception is `/auth/switch-organization`, which runs on the live
// access token and so really can report a dead session. It is a signed-in
// action, not a sign-in one, and its caller is in the app — so it uses the
// ordinary mapper, not this one.
//
// ── THE CODE LIST IS NOT CONTRACT-VERIFIED ───────────────────────────────────
//
// attendanceErrors.js can say "if a code is not on this list the backend does
// not emit it", because ATTENDANCE_API_CONTRACT.md §3 enumerates them. THERE IS
// NO EQUIVALENT DOCUMENT FOR AUTH in NativeRef/10-api/.
//
// Four codes are verified, because api/client.js names them:
// INVALID_CREDENTIALS, LOGIN_NOT_ALLOWED, GOOGLE_TOKEN_INVALID,
// UNAUTHORIZED_DEVICE. The OTP and lockout codes below are PLAUSIBLE NAMES,
// not confirmed ones — mapping a code the backend never sends is harmless (it
// simply never matches), so they cost nothing and win the right wording if
// they are right.
//
// What carries the screens regardless is the status-based copy underneath:
// every state the auth spec requires is reachable from the HTTP status alone.
// Confirm the code names against the backend and delete this paragraph.
//
// NEVER show `err.message` raw (CLAUDE.md §6) — on these endpoints it is
// frequently a Joi string naming a payload key ("identifier is required").
// ─────────────────────────────────────────────────────────────────────────────

/* ─── Shared sentences ────────────────────────────────────────────────────── */

const BAD_CREDENTIALS =
  'That email or password didn’t match. Check them and try again.';
const OTP_WRONG = 'That code didn’t match. Check it and try again.';
// Deliberately NOT the same sentence as OTP_WRONG: the person typed the code
// correctly and being told they got it wrong sends them hunting for a typo
// that isn't there. Name the real problem and the way out of it.
const OTP_EXPIRED = 'That code has expired. Send a new one.';
const OTP_STALE_REQUEST =
  'That code belongs to an earlier request. Use the newest code we sent, or send another.';
const SERVER_ERROR = 'Something went wrong at our end. Please try again in a moment.';
const RATE_LIMITED = 'Too many tries. Wait a minute and try again.';
const OFFLINE = 'You’re offline. Connect and try again.';

const AUTH_ERROR_MESSAGES = {
  /* ── Verified: named in api/client.js ──────────────────────────────────── */
  INVALID_CREDENTIALS: BAD_CREDENTIALS,
  // Not a wrong password — the account exists but may not sign in at all
  // (deactivated, or not permitted on mobile). No retry will fix it.
  LOGIN_NOT_ALLOWED:
    'This account can’t sign in. Contact your HR administrator to have it re-enabled.',
  GOOGLE_TOKEN_INVALID:
    'Google couldn’t confirm that sign-in. Try again, or use your email and password.',
  UNAUTHORIZED_DEVICE:
    'This device isn’t approved for your account. Contact your HR administrator.',

  /* ── Plausible, unverified — see the header ────────────────────────────── */
  ACCOUNT_LOCKED:
    'This account is locked after too many failed attempts. Reset your password, or contact your HR administrator.',
  ACCOUNT_DEACTIVATED:
    'This account has been deactivated. Contact your HR administrator.',
  USER_NOT_FOUND: BAD_CREDENTIALS, // never confirm which addresses exist
  INVALID_OTP: OTP_WRONG,
  OTP_INVALID: OTP_WRONG,
  OTP_EXPIRED,
  OTP_MISMATCH: OTP_WRONG,
  OTP_ATTEMPTS_EXCEEDED:
    'Too many attempts on that code. Send a new one and try again.',
  INVALID_REQUEST_ID: OTP_STALE_REQUEST,
  REQUEST_EXPIRED: OTP_STALE_REQUEST,
  INVALID_SELECTION_TOKEN:
    'That took too long. Sign in again to pick your workspace.',
  SELECTION_TOKEN_EXPIRED:
    'That took too long. Sign in again to pick your workspace.',
  ORGANIZATION_NOT_FOUND:
    'That workspace is no longer available on your account. Sign in again.',
  // Phrased as advice, not as a rule: the server's actual policy is not
  // documented in NativeRef/10-api/, and naming a requirement we have not
  // confirmed is how a form starts lying to people.
  WEAK_PASSWORD:
    'That password isn’t strong enough. Try a longer one, mixing letters, numbers and symbols.',
};

/* ─── Reading the code ────────────────────────────────────────────────────── */

/**
 * The typed code, whichever key this half of the gateway used.
 *
 * Auth sits across both conventions (`code` and `errorCode`, see
 * errors/index.js), so unlike the domain mappers this one reads both rather
 * than picking a side.
 */
export function authErrorCode(err) {
  return err?.data?.errorCode || err?.data?.code || null;
}

/* ─── Branching helpers ───────────────────────────────────────────────────── */

/** A wrong password or a wrong code — the person can fix it by retyping. */
export const isBadCredentials = (err) => {
  const code = authErrorCode(err);
  if (code === 'INVALID_CREDENTIALS' || code === 'USER_NOT_FOUND') return true;
  // Any other 401 on an auth endpoint is still a credential failure, unless a
  // code says otherwise.
  return err?.status === 401 && !AUTH_ERROR_MESSAGES[code];
};

/**
 * The code is right but too old. The spec requires this to read differently
 * from a wrong code, so the screen needs to be able to ask.
 */
export const isOtpExpired = (err) => {
  const code = authErrorCode(err);
  return code === 'OTP_EXPIRED' || code === 'REQUEST_EXPIRED' || code === 'INVALID_REQUEST_ID';
};

/** Nothing the person types will help: locked, deactivated, not permitted. */
export const isAccountUnusable = (err) => {
  const code = authErrorCode(err);
  if (code === 'LOGIN_NOT_ALLOWED' || code === 'ACCOUNT_LOCKED'
    || code === 'ACCOUNT_DEACTIVATED' || code === 'UNAUTHORIZED_DEVICE') return true;
  return err?.status === 403;
};

/** The short-lived multi-org selection token is spent or stale. */
export const isSelectionExpired = (err) => {
  const code = authErrorCode(err);
  return code === 'INVALID_SELECTION_TOKEN' || code === 'SELECTION_TOKEN_EXPIRED'
    || err?.status === 401;
};

/**
 * How long to wait, in seconds, after a 429.
 *
 * The body is preferred over the header because a proxy can strip a header but
 * not a payload (api/client.js header). 60 is the floor when neither says.
 */
export function rateLimitSeconds(err) {
  const fromBody = Number(
    err?.data?.details?.retry_after_seconds ?? err?.data?.retry_after_seconds,
  );
  if (Number.isFinite(fromBody) && fromBody > 0) return Math.ceil(fromBody);
  if (Number.isFinite(err?.retryAfter) && err.retryAfter > 0) return Math.ceil(err.retryAfter);
  return 60;
}

export const isRateLimited = (err) => err?.status === 429;

/* ─── The sentence ────────────────────────────────────────────────────────── */

/**
 * What to show somebody who could not sign in.
 *
 * @param {Error & {status?: number, data?: object, isNetworkError?: boolean}} err
 * @param {string} [fallback] — say what couldn’t be done, not "an error occurred"
 * @returns {string}
 */
export function authErrorMessage(err, fallback = 'Couldn’t sign you in. Please try again.') {
  if (!err) return fallback;

  // Offline first: there is no server code to read, and the server's copy
  // would be misleading for a phone in a lift.
  if (err.isNetworkError) return OFFLINE;
  if (err.isTimeout || err.name === 'AbortError') {
    return 'That took too long. Check your connection and try again.';
  }

  const code = authErrorCode(err);
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];

  // Status-based copy. This is what makes the screens correct whether or not
  // the code names above match the backend.
  if (err.status === 429) return RATE_LIMITED;
  if (err.status === 401) return BAD_CREDENTIALS;
  if (err.status === 403) {
    return 'This account can’t sign in. Contact your HR administrator.';
  }
  if (err.status >= 500) return SERVER_ERROR;
  // A 400 here is a validation failure whose message names a PAYLOAD KEY
  // ("identifier is required"), so it is never shown. The screen's own §11
  // check should have caught it before the request left.
  return fallback;
}

export { AUTH_ERROR_MESSAGES, BAD_CREDENTIALS, OTP_EXPIRED, OTP_WRONG, OFFLINE };
