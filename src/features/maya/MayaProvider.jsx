// ─────────────────────────────────────────────────────────────────────────────
// features/maya/MayaProvider.jsx — mounts Maya once, beside the tab navigator.
//
// Maya lives here, not inside any screen, so a question asked from anywhere
// (an ⓘ, the floating button, the drawer) opens the SAME panel over whatever is
// on screen. It owns only "is the panel open, and with what pre-filled"; the
// conversation is the sheet's (useMayaChat), and the way in is the bridge.
//
// No key configured → nothing mounts (Maya is absent, not broken). The floating
// button obeys the person's Settings preference; it is never the only door.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { consumePendingQuestion, mayaAvailable, onMayaEvent } from './mayaBridge';
import { useMayaPrefs } from './mayaPrefs';
import { MayaSheet } from './MayaSheet';
import { MayaFab } from './MayaFab';

export function MayaProvider() {
  const { prefs } = useMayaPrefs();
  const [visible, setVisible] = useState(false);
  const [prefill, setPrefill] = useState('');

  useEffect(() => onMayaEvent(() => {
    setPrefill(consumePendingQuestion() || '');
    setVisible(true);
  }), []);

  if (!mayaAvailable()) return null;

  return (
    <>
      {prefs.fab && !visible ? <MayaFab /> : null}
      {visible ? (
        <MayaSheet visible={visible} prefill={prefill} onClose={() => { setVisible(false); setPrefill(''); }} />
      ) : null}
    </>
  );
}

export default MayaProvider;
