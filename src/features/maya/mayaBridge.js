// ─────────────────────────────────────────────────────────────────────────────
// features/maya/mayaBridge.js — how any screen opens Maya without owning her.
//
// Ported in spirit from the web's mayaBridge.js. Maya (MayaSheet) is mounted
// once at the app root (MayaProvider, beside the tab navigator). A screen, a
// drawer row, an ⓘ "Ask Maya" link, the floating button or a phone shake all
// reach her through this plain module rather than by props:
//
// • openMaya() opens her empty.
// • askMaya({ question }) pre-fills a question AND opens her. She only ever
//   PRE-FILLS — nothing is sent to the assistant until the person presses Send
//   (CLAUDE.md §10: Maya never auto-sends).
// • The pending question rides in a slot with a TTL, so an ask fired before the
//   provider has subscribed still lands, and a stale one can't surface minutes
//   later (web's rule).
// • mayaAvailable() is false when there is no DocMind key — then the ⓘ leaves
//   the Ask Maya link out and the floating button hides: absent, not broken.
// ─────────────────────────────────────────────────────────────────────────────

import { MAYA_CONFIGURED } from './mayaClient';

const PENDING_TTL_MS = 30000;

const listeners = new Set();
let pending = null;

const emit = () => listeners.forEach((fn) => {
  try { fn(); } catch { /* a faulty subscriber never breaks the opener */ }
});

/** Open Maya with no question. */
export function openMaya() {
  pending = null;
  emit();
}

/** Pre-fill a question and open Maya. Returns false if there was nothing to ask. */
export function askMaya({ question } = {}) {
  const text = typeof question === 'string' ? question.trim() : '';
  if (!text) { openMaya(); return false; }
  pending = { question: text, at: Date.now() };
  emit();
  return true;
}

/** Take the pending question, if a fresh one is waiting. Called by the provider only. */
export function consumePendingQuestion() {
  const next = pending;
  pending = null;
  if (!next || Date.now() - next.at > PENDING_TTL_MS) return null;
  return next.question;
}

/** Subscribe to open/ask events. The provider is the only subscriber. */
export function onMayaEvent(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Can Maya take a question at all? False with no key configured. */
export const mayaAvailable = () => MAYA_CONFIGURED;
