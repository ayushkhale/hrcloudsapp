// ─────────────────────────────────────────────────────────────────────────────
// api/inbox.api.js — the unified count API behind every badge in the app.
//
// Ported from C:\Freelance Projects\HR Clouds\src\shared\api\inbox.api.js.
// `GET /inbox/badges` returns the entire count tree — sidebar badges, inbox
// queue totals, task counts, document requests, and notifications — in a single
// round trip, scoped to the caller's role by the server.
//
// It replaces separate `limit: 1` reads across multiple modules with one call.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from './client';

export const inboxAPI = {
  /** The whole badge tree for the signed-in user, in one request (#278). */
  getBadgeSummary: () => request('/inbox/badges'),
};

/**
 * Is this failure "the server has no badge endpoint" rather than a fault?
 *
 * 404 is an unmounted route; 501 is deliberately absent. Either way the
 * answer is to fall back to the legacy per-queue reads quietly.
 */
export function isBadgeSummaryMissing(err) {
  const status = err?.status;
  return status === 404 || status === 501;
}

/** Seconds to wait after a 429, body first (a proxy can strip the header). */
export function badgeRetryAfterSeconds(err) {
  const fromBody = Number(err?.data?.details?.retry_after_seconds);
  if (Number.isFinite(fromBody) && fromBody >= 0) return fromBody;
  const fromHeader = Number(err?.retryAfter);
  return Number.isFinite(fromHeader) && fromHeader >= 0 ? fromHeader : 60;
}

export default inboxAPI;
