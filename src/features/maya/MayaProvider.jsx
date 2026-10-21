// ─────────────────────────────────────────────────────────────────────────────
// features/maya/MayaProvider.jsx — mounts Maya once, beside the tab navigator.
//
// Maya lives here, not inside any screen, so a question asked from anywhere
// (an ⓘ, the sparkle in the top bar, the drawer) opens the SAME panel over
// whatever is on screen. It owns only "is the panel open, and with what
// pre-filled"; the conversation is the sheet's (useMayaChat), and the way in
// is the bridge.
//
// No key configured → nothing mounts (Maya is absent, not broken).
//
// There is no floating button any more (user, 2026-10-21: "place ask maya next
// to notification, remove floating everywhere, just sparkle icon"). It covered
// the bottom of every list; the way in is the sparkle in navigation/AppTopBar.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { consumePendingQuestion, mayaAvailable, onMayaEvent } from './mayaBridge';
import { MayaSheet } from './MayaSheet';

export function MayaProvider() {
  const [visible, setVisible] = useState(false);
  const [prefill, setPrefill] = useState('');

  useEffect(() => onMayaEvent(() => {
    setPrefill(consumePendingQuestion() || '');
    setVisible(true);
  }), []);

  if (!mayaAvailable() || !visible) return null;

  return (
    <MayaSheet visible={visible} prefill={prefill} onClose={() => { setVisible(false); setPrefill(''); }} />
  );
}

export default MayaProvider;
