// ─────────────────────────────────────────────────────────────────────────────
// hooks/useListRefresh.js — the two ways a section's data gets re-read.
//
// User, 2026-10-21: "add reload on every possible screen where data is being
// updated, like if I apply for leave then after applying, navigating back to
// the screen, auto reload it so I could see". Two things, one hook:
//
//   1. PULL TO REFRESH. Returns a ready `refreshControl` for the section's
//      FlatList / ScrollView. Its spinner runs only for a pull the person
//      made — a reload started by anything else stays quiet, because the
//      content it is refreshing is already on screen (CLAUDE.md §2).
//
//   2. RELOAD ON RETURN. When the screen regains focus — a modal form
//      closed over it, a pushed page popped, the tab was re-selected — the
//      data is read again, quietly. The event bus (lib/events.js) already
//      covers writes made IN this app; this covers everything else: a write
//      made from a screen that has no event, a manager deciding something on
//      the web, a punch from a kiosk. The FIRST focus is skipped — that is
//      the mount, which loads on its own — and a return within a few seconds
//      of the last read is skipped too, so flicking between tabs is not a
//      request per flick.
//
// `reload` may start several reads; `loading` is true while any of them runs.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { color } from '../theme/tokens';

const RETURN_COOLDOWN_MS = 4000;

/**
 * @param {() => void} reload   re-reads the section's data
 * @param {boolean} loading     true while a read is in flight
 * @returns {{ refreshControl: React.ReactElement, onRefresh: () => void, refreshing: boolean }}
 */
export function useListRefresh(reload, loading) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  // ── Pull ──────────────────────────────────────────────────────────────────
  // `pulled` holds the spinner from the pull until the read it started ends.
  // Cleared on the loading true → false edge, not on "not loading": a reload
  // that only schedules its read (usePagedList stepping back to page 1) is
  // not loading yet in the render right after the pull.
  const [pulled, setPulled] = useState(false);
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (wasLoading.current && !loading) setPulled(false);
    wasLoading.current = loading;
  }, [loading]);
  // Belt and braces: a reload that never reaches the network must not leave
  // the spinner up for ever.
  useEffect(() => {
    if (!pulled) return undefined;
    const t = setTimeout(() => setPulled(false), 15000);
    return () => clearTimeout(t);
  }, [pulled]);

  const lastRead = useRef(Date.now());
  useEffect(() => { if (loading) lastRead.current = Date.now(); }, [loading]);

  const onRefresh = useCallback(() => {
    setPulled(true);
    lastRead.current = Date.now();
    reloadRef.current?.();
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) {
      focusedOnce.current = true;
      return;
    }
    if (Date.now() - lastRead.current < RETURN_COOLDOWN_MS) return;
    lastRead.current = Date.now();
    reloadRef.current?.();
  }, []));

  const refreshing = pulled && !!loading;
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={color.brand}
      colors={[color.brand]}
    />
  );

  return { refreshControl, onRefresh, refreshing };
}

export default useListRefresh;
