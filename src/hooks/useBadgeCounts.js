// ─────────────────────────────────────────────────────────────────────────────
// hooks/useBadgeCounts.js — single unified count store for the whole app.
//
// Ported from C:\Freelance Projects\HR Clouds\src\shared\contexts\badgeCountsStore.js
// and src/shared/hooks/useBadgeCounts.js.
//
// `GET /inbox/badges` (#278) answers all navigation badge numbers in ONE
// request, scoped to the caller by the server. It replaces separate fan-out
// calls with a single poll, debounced refresh on attendance/inbox mutations,
// AppState foreground sync, and graceful fallback to legacy reads for older servers.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { documentsAPI, getToken, inboxAPI, isBadgeSummaryMissing, badgeRetryAfterSeconds } from '../api';
import { INBOX_EVENT_KINDS, subscribeAttendanceChanged } from '../lib/events';
import { listFrom } from '../lib/normalize';

const POLL_MS = 60_000;
const STALE_MS = 30_000;
const MIN_GAP_MS = 5_000;
const EVENT_DEBOUNCE_MS = 600;

const INBOX_CATEGORIES = [
  { api: 'leaves', key: 'leaves' },
  { api: 'regularizations', key: 'regularizations' },
  { api: 'overtime', key: 'overtime' },
  { api: 'comp_offs', key: 'compOffs' },
  { api: 'anomalies', key: 'anomalies' },
  { api: 'tasks', key: 'tasks' },
  { api: 'salary_proposals', key: 'salaryApprovals' },
  { api: 'claims', key: 'claims' },
  { api: 'loans', key: 'loans' },
  { api: 'tax_declarations', key: 'declarations', read: (c) => num(c.submitted) },
  { api: 'devices', key: 'devices' },
  { api: 'letter_proposals', key: 'letterProposals' },
];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

const IDLE = Object.freeze({
  token: null,
  status: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  source: null, // 'badges' | 'legacy'
  counts: {},
  unavailable: null,
  sidebar: {
    inboxTotal: 0,
    notificationsUnread: 0,
    unverifiedBanks: 0,
    documentVerificationQueue: 0,
  },
  tasks: { open: 0, overdue: 0, inReview: 0 },
  documents: { outstanding: 0, overdue: 0, fulfilled: 0 },
  documentBadgeCount: 0,
  taskBadgeCount: 0,
  syncedAt: null,
  error: null,
  loadedAt: 0,
  cooldownUntil: 0,
});

let snapshot = { ...IDLE };
const listeners = new Set();
let pollTimer = null;
let eventTimer = null;
let cooldownTimer = null;
let inflight = null;
let lastReadAt = 0;
let cooldownUntil = 0;
let refreshQueued = false;
let watching = false;
let unsubscribeEvents = null;
let appStateSubscription = null;

function publish(patch) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((fn) => {
    try { fn(snapshot); }
    catch (err) { if (__DEV__) console.error('[badgeCounts] listener failed', err); }
  });
}

function resetFor(token) {
  cooldownUntil = 0;
  clearTimeout(cooldownTimer);
  cooldownTimer = null;
  publish({ ...IDLE, token });
}

export function shapeBadgeSummary(payload) {
  const data = payload?.data ?? payload ?? {};
  const categories = data.categories || {};
  const inbox = categories.inbox || {};
  const tasks = categories.tasks || {};
  const docReqs = categories.document_requests || {};
  const sidebar = data.sidebar || {};

  const unavailable = new Set(
    Array.isArray(data.meta?.unavailable_categories) ? data.meta.unavailable_categories : [],
  );

  const counts = {};
  INBOX_CATEGORIES.forEach(({ api, key, read }) => {
    if (unavailable.has(`inbox.${api}`)) return;
    const cat = inbox[api];
    if (!cat) return;
    counts[key] = read ? read(cat) : num(cat.total);
  });

  const taskMine = tasks.mine || {};
  const taskCounts = {
    open: num(taskMine.open ?? tasks.pending),
    overdue: num(taskMine.overdue ?? tasks.overdue),
    inReview: num(taskMine.in_review ?? tasks.in_review),
  };

  const documentCounts = {
    outstanding: num(docReqs.outstanding),
    overdue: num(docReqs.overdue),
    fulfilled: num(docReqs.fulfilled),
  };

  // For employees, pending document requests/acknowledgements are what needs action
  const docBadge = documentCounts.outstanding || num(sidebar.inbox_total);
  const taskBadge = taskCounts.overdue || taskCounts.open;

  return {
    counts,
    unavailable,
    sidebar: {
      inboxTotal: num(sidebar.inbox_total),
      notificationsUnread: num(sidebar.notifications_unread),
      unverifiedBanks: num(sidebar.unverified_banks),
      documentVerificationQueue: num(sidebar.document_verification_queue),
    },
    tasks: taskCounts,
    documents: documentCounts,
    documentBadgeCount: docBadge,
    taskBadgeCount: taskBadge,
    syncedAt: typeof data.synced_at === 'string' ? data.synced_at : null,
  };
}

async function readLegacy() {
  const [issued, reqs] = await Promise.all([
    documentsAPI.getMyIssuedDocuments({ compliance_state: 'pending', limit: 50 }).catch(() => null),
    documentsAPI.getMyDocumentRequests({ status: ['open', 'overdue'], limit: 1 }).catch(() => null),
  ]);
  const ackCount = issued ? listFrom(issued, ['documents', 'issued_documents']).length : 0;
  const reqCount = Number(
    reqs?.data?.pagination?.total
    ?? reqs?.data?.pagination?.total_count
    ?? reqs?.data?.total
    ?? 0,
  ) || 0;

  const docTotal = ackCount + reqCount;
  return {
    counts: {},
    unavailable: new Set(),
    sidebar: {
      inboxTotal: docTotal,
      notificationsUnread: 0,
      unverifiedBanks: 0,
      documentVerificationQueue: 0,
    },
    tasks: { open: 0, overdue: 0, inReview: 0 },
    documents: { outstanding: reqCount, overdue: 0, fulfilled: 0 },
    documentBadgeCount: docTotal,
    taskBadgeCount: 0,
    syncedAt: new Date().toISOString(),
  };
}

async function read({ force = false } = {}) {
  const token = getToken();

  if (snapshot.token !== token) resetFor(token);
  if (!token) {
    publish({ status: 'idle' });
    return snapshot;
  }

  const now = Date.now();
  if (now < cooldownUntil) return snapshot;
  if (!force && now - lastReadAt < MIN_GAP_MS) return snapshot;
  if (inflight) {
    if (force) refreshQueued = true;
    return inflight;
  }

  publish({ status: snapshot.status === 'ready' ? 'ready' : 'loading', error: null });

  inflight = (async () => {
    let legacy = snapshot.source === 'legacy';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const shaped = legacy
          ? { ...(await readLegacy()), source: 'legacy' }
          : { ...shapeBadgeSummary(await inboxAPI.getBadgeSummary()), source: 'badges' };

        lastReadAt = Date.now();
        publish({
          status: 'ready',
          source: shaped.source,
          counts: shaped.counts,
          unavailable: shaped.unavailable ?? null,
          sidebar: shaped.sidebar,
          tasks: shaped.tasks,
          documents: shaped.documents,
          documentBadgeCount: shaped.documentBadgeCount,
          taskBadgeCount: shaped.taskBadgeCount,
          syncedAt: shaped.syncedAt,
          error: null,
          loadedAt: lastReadAt,
          cooldownUntil: 0,
        });
        return snapshot;
      } catch (err) {
        if (!legacy && isBadgeSummaryMissing(err)) {
          legacy = true;
          publish({ source: 'legacy' });
          continue;
        }
        if (err?.status === 429) {
          cooldownUntil = Date.now() + badgeRetryAfterSeconds(err) * 1000;
          clearTimeout(cooldownTimer);
          cooldownTimer = setTimeout(() => {
            cooldownTimer = null;
            publish({ cooldownUntil: 0 });
          }, Math.max(0, cooldownUntil - Date.now()) + 250);

          publish(snapshot.loadedAt ? { status: 'ready', cooldownUntil } : { status: 'error', error: err, cooldownUntil });
          return snapshot;
        }
        lastReadAt = Date.now();
        publish({ status: 'error', error: err });
        return snapshot;
      }
    }
    return snapshot;
  })().finally(() => {
    inflight = null;
    if (refreshQueued) {
      refreshQueued = false;
      read({ force: true });
    }
  });

  return inflight;
}

export function refreshBadgeCounts({ force = true } = {}) {
  return read({ force });
}

export function ensureBadgeCounts() {
  const token = getToken();
  if (snapshot.token !== token) resetFor(token);
  if (snapshot.status === 'idle' || Date.now() - snapshot.loadedAt > POLL_MS) {
    read({ force: false });
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (AppState.currentState !== 'active') return;
    if (Date.now() - snapshot.loadedAt < POLL_MS - 1_000) return;
    read({ force: false });
  }, POLL_MS);
}

function onAppStateChange(nextState) {
  if (nextState !== 'active') {
    clearInterval(pollTimer);
    pollTimer = null;
    return;
  }
  if (Date.now() - snapshot.loadedAt > STALE_MS) {
    read({ force: false });
  }
  startPolling();
}

function startWatching() {
  if (watching) return;
  watching = true;
  startPolling();

  appStateSubscription = AppState.addEventListener('change', onAppStateChange);

  unsubscribeEvents = subscribeAttendanceChanged((kind) => {
    if (!INBOX_EVENT_KINDS.includes(kind)) return;
    clearTimeout(eventTimer);
    const wait = Math.max(EVENT_DEBOUNCE_MS, MIN_GAP_MS - (Date.now() - lastReadAt));
    eventTimer = setTimeout(() => read({ force: true }), wait);
  });
}

function stopWatching() {
  watching = false;
  clearInterval(pollTimer);
  pollTimer = null;
  clearTimeout(eventTimer);
  eventTimer = null;
  clearTimeout(cooldownTimer);
  cooldownTimer = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  unsubscribeEvents?.();
  unsubscribeEvents = null;
}

export function subscribeBadgeCounts(cb) {
  listeners.add(cb);
  cb(snapshot);
  if (listeners.size === 1) startWatching();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stopWatching();
  };
}

export function getBadgeCountsSnapshot() {
  return snapshot;
}

/**
 * Main hook for components needing badge counts across navigation, drawers, and tabs.
 */
export function useBadgeCounts({ enabled = true } = {}) {
  const [state, setState] = useState(() => snapshot);

  useEffect(() => {
    if (!enabled) return undefined;
    ensureBadgeCounts();
    return subscribeBadgeCounts(setState);
  }, [enabled]);

  const refresh = useCallback(() => refreshBadgeCounts({ force: true }), []);

  return {
    ...state,
    refresh,
  };
}

export default useBadgeCounts;
