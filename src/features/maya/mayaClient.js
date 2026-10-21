// ─────────────────────────────────────────────────────────────────────────────
// features/maya/mayaClient.js — the DocMind client for Maya.
//
// PORTED from the web's useDocMindChat.js (CLAUDE.md §10): same endpoints, same
// sentinel handling. The ONE difference is the transport: the web streams the
// answer (SSE); this app asks for it whole (`stream: false`) with plain fetch,
// because the streamed path gave people no reply on the phone (2026-10-21 —
// streamChat's comment has the evidence).
//
// No secret here: the DocMind key is compiled into the app and is client-side on
// the web too (config/env.js). No key → MAYA_CONFIGURED is false and nothing
// routes a question to Maya (the bridge reports her absent).
//
// Endpoints: GET /config (widget copy + limits), POST /chat (`stream: false`).
//
// ── EVERY REQUEST CARRIES AN ORIGIN (2026-10-21) ────────────────────────────
//
// The key is restricted to websites. A browser adds `Origin` on its own; RN's
// fetch and XHR do not, and DocMind answered every call from this app with
// 403 ORIGIN_REQUIRED — /config fell back to defaults silently and /chat
// failed, which is "Maya doesn't work". ENV.DOCMIND_ORIGIN names the allowed
// site the app speaks for. The cleaner long-term fix is a key of the app's
// own in the DocMind dashboard; until then, don't drop this header.
// ─────────────────────────────────────────────────────────────────────────────

import { ENV } from '../../config/env';

const API_URL = ENV.DOCMIND_API_URL;
const API_KEY = ENV.DOCMIND_API_KEY;
const ORIGIN = ENV.DOCMIND_ORIGIN;

export const MAYA_CONFIGURED = !!API_KEY;

// The RAG backend emits this when it finds nothing relevant; we show a friendly
// line instead of exposing the implementation detail.
export const NOT_IN_CONTEXT_SENTINEL =
  'I could not find any relevant information in the uploaded documents to answer your question.';
export const NOT_IN_CONTEXT_REPLY =
  "I don't have anything on that just yet. Try rephrasing it, or ask your HR team for the specifics.";

// The server answers in ~2–8 s when healthy; past this it is not coming.
const ANSWER_TIMEOUT_MS = 45000;

export const MAYA_DEFAULTS = {
  welcome: "Hi, I’m Maya — your HR assistant. Ask me about leave, pay, attendance, documents or anything on HR Clouds.",
  placeholder: 'Ask Maya anything…',
  suggestions: [
    'How do I apply for leave?',
    'What is earned leave?',
    'When will my payslip be ready?',
  ],
  maxQueryLength: 1000,
  maxHistoryTurns: 6,
};

/** Read the widget config once (copy + limits). Never throws — falls back to defaults. */
export async function fetchMayaConfig() {
  if (!API_KEY) return MAYA_DEFAULTS;
  try {
    const res = await fetch(`${API_URL}/config`, { headers: { 'X-Api-Key': API_KEY, Origin: ORIGIN } });
    if (!res.ok) return MAYA_DEFAULTS;
    const data = await res.json();
    const w = data?.widget || {};
    const l = data?.limits || {};
    return {
      welcome: w.welcomeMessage || MAYA_DEFAULTS.welcome,
      placeholder: w.placeholder || MAYA_DEFAULTS.placeholder,
      suggestions: Array.isArray(w.suggestedQuestions) && w.suggestedQuestions.length
        ? w.suggestedQuestions.slice(0, 4)
        : MAYA_DEFAULTS.suggestions,
      maxQueryLength: Number(l.maxQueryLength) || MAYA_DEFAULTS.maxQueryLength,
      maxHistoryTurns: Number(l.maxHistoryTurns) || MAYA_DEFAULTS.maxHistoryTurns,
    };
  } catch {
    return MAYA_DEFAULTS;
  }
}

/** A message for a refused or failed answer, by status. */
function failureMessage(status) {
  if (status === 429) return 'Maya is busy right now. Give it a moment and try again.';
  if (status === 401 || status === 403) return 'Maya isn’t available right now. Try again later.';
  return 'Maya ran into a problem. Please try again.';
}

/**
 * Ask one question. Returns `{ promise, abort }` — the shape the hook expects.
 *
 * NOT STREAMED (2026-10-21). This used to read the SSE stream through XHR
 * incremental events, and on the phone people got no reply at all — while the
 * same stream, captured from the server and replayed through the same parser,
 * produced the whole answer. Rather than depend on RN's incremental XHR path
 * (which could not be watched on a device from here), the app asks with
 * `stream: false` and gets one JSON `{ answer }` — the server's own
 * non-streaming mode, ~2–8 s. The answer lands in one piece via `onChunk`, so
 * useMayaChat is unchanged; the typing dots cover the wait. Every failure is
 * now a visible error bubble, never an empty one. Diverges from the web's
 * useDocMindChat on purpose — the web keeps streaming, where fetch can.
 *
 * @param {object} opts
 * @param {string} opts.query          what to send (already carries any hidden instructions)
 * @param {string} opts.sessionId
 * @param {Array<{role,content}>} opts.history
 * @param {(text: string) => void} opts.onChunk
 * @param {(sources: any[]) => void} [opts.onSources]
 */
export function streamChat({ query, sessionId, history, onChunk, onSources }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ANSWER_TIMEOUT_MS);

  const promise = (async () => {
    let res;
    try {
      res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Api-Key': API_KEY,
          Origin: ORIGIN,
        },
        body: JSON.stringify({ query, stream: false, sessionId, history }),
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) throw Object.assign(new Error('Maya took too long to respond. Please try again.'), { isTimeout: true });
      if (err?.name === 'AbortError') throw Object.assign(new Error('stopped'), { isAbort: true });
      throw new Error('Can’t reach Maya. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }

    let data = null;
    try { data = await res.json(); } catch { /* not JSON — judged by status below */ }
    if (!res.ok || data?.success === false) {
      if (__DEV__) console.warn('[Maya] refused', res.status, data?.code, data?.error);
      throw new Error(failureMessage(res.status));
    }
    const answer = typeof data?.answer === 'string' ? data.answer : '';
    if (!answer.trim()) throw new Error('Maya didn’t have an answer for that. Try asking another way.');
    if (Array.isArray(data?.sources)) onSources?.(data.sources);
    onChunk(answer);
  })();

  return { promise, abort: () => controller.abort() };
}
