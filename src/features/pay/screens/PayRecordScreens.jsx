// ─────────────────────────────────────────────────────────────────────────────
// features/pay/screens/PayRecordScreens.jsx — the pay records that read as
// PAGES, not sheets (user, 2026-10-22: "payslip, claims, salary — the content
// is too much, it's hiding; make them stack screens").
//
//   PayslipDetail   two money tables, the stat tiles, the statutory note
//   SalaryRevision  stat tiles, the revision grid, two component tables
//   LoanDetail      the terms grid and the whole repayment schedule
//   ClaimDetail     the claim's lines, its receipts, where it stands, actions
//
// Each is a thin route around the record's EXISTING component (they live in
// ../components/*Tab.jsx beside the list that opens them). RecordPageScope
// makes their RecordSheet draw as a full page — ui/RecordPage.jsx's header
// says why one body serves both. Params are plain data; what used to be a
// callback is navigation or the event bus the lists already listen to.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { RecordPageScope } from '../../../ui';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../../lib/events';
import { PayslipSheet } from '../components/PayslipsTab';
import { RevisionSheet } from '../components/SalaryTab';
import { LoanSheet } from '../components/LoansTab';
import { ClaimSheet } from '../components/ClaimsTab';

export function PayslipDetailScreen({ route, navigation }) {
  const { runId, period } = route?.params || {};
  return (
    <RecordPageScope>
      <PayslipSheet runId={runId} period={period} onClose={() => navigation.goBack()} />
    </RecordPageScope>
  );
}

export function SalaryRevisionScreen({ route, navigation }) {
  return (
    <RecordPageScope>
      <RevisionSheet revision={route?.params?.revision} onClose={() => navigation.goBack()} />
    </RecordPageScope>
  );
}

export function LoanDetailScreen({ route, navigation }) {
  return (
    <RecordPageScope>
      <LoanSheet loan={route?.params?.loan} onClose={() => navigation.goBack()} />
    </RecordPageScope>
  );
}

export function ClaimDetailScreen({ route, navigation }) {
  return (
    <RecordPageScope>
      <ClaimSheet
        claim={route?.params?.claim}
        onClose={() => navigation.goBack()}
        // The claims list re-reads on CLAIM (ClaimsTab) — and on return anyway.
        onCancelled={() => emitAttendanceChanged(ATTENDANCE_EVENTS.CLAIM, { action: 'cancel' })}
        onContinue={(c) => navigation.navigate('ClaimForm', { claimId: c?.id })}
      />
    </RecordPageScope>
  );
}

export default PayslipDetailScreen;
