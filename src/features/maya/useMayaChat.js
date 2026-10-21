// ─────────────────────────────────────────────────────────────────────────────
// features/maya/useMayaChat.js — the conversation state for one Maya session.
//
// PORTED from the web's useDocMindChat.js (CLAUDE.md §10): an optimistic user
// message plus a streaming assistant placeholder, chunks appended as they
// arrive, the "no context" sentinel swapped for a friendly line, Stop keeps the
// half-answer. The transport is mayaClient.streamChat (one fetch — see that file).
//
// `send(text, instructions)` takes the hidden instruction block already built
// by the caller (mayaInstructions), so this stays language-agnostic. History is
// trimmed to the config's `maxHistoryTurns`, and nothing leaves the phone until
// send is called — Maya never auto-sends (CLAUDE.md §10).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAYA_DEFAULTS, NOT_IN_CONTEXT_REPLY, NOT_IN_CONTEXT_SENTINEL, fetchMayaConfig, streamChat,
} from './mayaClient';

const rid = () => `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function useMayaChat() {
  const [config, setConfig] = useState(MAYA_DEFAULTS);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const sessionId = useRef(rid());
  const active = useRef(null); // the in-flight { abort }
  const limits = useRef(MAYA_DEFAULTS);

  useEffect(() => {
    let alive = true;
    fetchMayaConfig().then((c) => { if (alive) { setConfig(c); limits.current = c; } });
    return () => { alive = false; };
  }, []);

  const patch = useCallback((id, updater) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updater(m) } : m)));
  }, []);

  const send = useCallback(async (text, instructions = '') => {
    const q = String(text || '').trim();
    if (!q || isStreaming) return;
    const sent = instructions ? `${q}\n\n${instructions}` : q;

    const userMsg = { id: rid(), role: 'user', content: q };
    const botId = rid();
    const maxTurns = limits.current?.maxHistoryTurns || 6;
    const history = messages.map((m) => ({ role: m.role, content: m.content })).slice(-maxTurns);

    setMessages((prev) => [...prev, userMsg, { id: botId, role: 'assistant', content: '', streaming: true }]);
    setIsStreaming(true);

    const { promise, abort } = streamChat({
      query: sent,
      sessionId: sessionId.current,
      history,
      onChunk: (chunk) => patch(botId, (m) => ({ content: m.content + chunk })),
    });
    active.current = { abort };

    try {
      await promise;
      patch(botId, (m) => ({
        streaming: false,
        content: m.content.trim() === NOT_IN_CONTEXT_SENTINEL ? NOT_IN_CONTEXT_REPLY : m.content,
      }));
    } catch (err) {
      if (err?.isAbort) {
        // Stop: keep whatever she had said; drop an empty bubble.
        setMessages((prev) => prev.flatMap((m) => {
          if (m.id !== botId) return [m];
          return m.content.trim() ? [{ ...m, streaming: false, stopped: true }] : [];
        }));
      } else {
        patch(botId, () => ({ streaming: false, error: true, content: err?.message || 'Maya ran into a problem. Please try again.' }));
      }
    } finally {
      active.current = null;
      setIsStreaming(false);
    }
  }, [isStreaming, messages, patch]);

  const stop = useCallback(() => { active.current?.abort?.(); }, []);
  const reset = useCallback(() => {
    active.current?.abort?.();
    setMessages([]);
    sessionId.current = rid();
  }, []);

  return { config, messages, isStreaming, send, stop, reset };
}

export default useMayaChat;
