// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/screens/EarnedLeaveDayScreen.jsx — one Earned Leave day,
// as a PAGE (user, 2026-10-22: "Time's screens all show well, but Earned
// Leave is hiding"). The other My Time records stay sheets; this one moved.
//
// A thin route around EarnedLeaveSheet (../components/SelfRecordSheets.jsx);
// RecordPageScope draws it as a page (ui/RecordPage.jsx). Params are the row
// and the four facts the list already worked out for it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { TERMS } from '../../../config/dictionary';
import { RecordPageScope } from '../../../ui';
import { EarnedLeaveSheet } from '../components/SelfRecordSheets';

export default function EarnedLeaveDayScreen({ route, navigation }) {
  const p = route?.params || {};
  return (
    <RecordPageScope>
      <EarnedLeaveSheet
        item={p.record}
        term={TERMS.COMP_OFF}
        workedOn={p.workedOn}
        credit={p.credit}
        expiresOn={p.expiry}
        expiringSoon={p.soon}
        onClose={() => navigation.goBack()}
      />
    </RecordPageScope>
  );
}

export { EarnedLeaveDayScreen };
