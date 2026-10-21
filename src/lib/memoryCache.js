// ─────────────────────────────────────────────────────────────────────────────
// lib/memoryCache.js — the last answer to a read, held for this app session.
//
// User, 2026-10-22: "profile and all should be cached, they take a little time
// to show up." The second open of My Profile, Org Profile or the drawer's org
// block waited on the network like the first. Now a read that opts in
// (`useResource(…, { cacheKey })`) is drawn at once from the last answer and
// refreshed underneath — the refresh never shows a skeleton (§2: only the
// first load does).
//
// MEMORY ONLY, ON PURPOSE. A profile carries personal details (phone, date of
// birth, address); writing it to the phone's storage would leave it readable
// after sign-out on a shared phone. The cost is one network wait per app
// launch, which is what "a little time" was about anyway.
//
// Cleared when a session ends or changes (state/AuthContext.jsx), so the next
// person to sign in never sees the last one's profile, even for a frame.
// ─────────────────────────────────────────────────────────────────────────────

const store = new Map();

export const readCache = (key) => (key && store.has(key) ? store.get(key) : undefined);

export function writeCache(key, value) {
  if (key) store.set(key, value);
}

export function clearMemoryCache() {
  store.clear();
}

export default { readCache, writeCache, clearMemoryCache };
