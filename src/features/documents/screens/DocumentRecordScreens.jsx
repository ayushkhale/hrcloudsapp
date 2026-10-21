// ─────────────────────────────────────────────────────────────────────────────
// features/documents/screens/DocumentRecordScreens.jsx — the documents that
// read as PAGES, not sheets (user, 2026-10-22: "everywhere the content is too
// much, change from bottom sheet to stack screen").
//
//   CompanyDocument  the issued document: open it, read the terms, acknowledge
//                    or sign, and the receipt — the longest record in the app
//   MyDocument       one of my uploads: why it was rejected, its details, its
//                    older versions, and what to do next
//
// Thin routes around the records' existing components (../components/
// CompanyTab.jsx, PersonalTab.jsx); RecordPageScope draws them as pages
// (ui/RecordPage.jsx). An upload the record asks for opens the upload form;
// "something changed" is the event bus the lists already re-read on.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { RecordPageScope } from '../../../ui';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../../lib/events';
import { CompanySheet } from '../components/CompanyTab';
import { DocumentSheet } from '../components/PersonalTab';

export function CompanyDocumentScreen({ route, navigation }) {
  return (
    <RecordPageScope>
      <CompanySheet
        row={route?.params?.row}
        onClose={() => navigation.goBack()}
        onChanged={() => emitAttendanceChanged(ATTENDANCE_EVENTS.ACKNOWLEDGEMENT, { action: 'changed' })}
      />
    </RecordPageScope>
  );
}

export function MyDocumentScreen({ route, navigation }) {
  const { doc, type } = route?.params || {};
  return (
    <RecordPageScope>
      <DocumentSheet
        doc={doc}
        type={type}
        onClose={() => navigation.goBack()}
        onUpload={(p = {}) => navigation.navigate('UploadDocument', p)}
        onChanged={() => emitAttendanceChanged(ATTENDANCE_EVENTS.DOCUMENT, { action: 'changed' })}
      />
    </RecordPageScope>
  );
}

export default CompanyDocumentScreen;
