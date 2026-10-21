// ─────────────────────────────────────────────────────────────────────────────
// features/documents/components/RequestsTab.jsx — My Documents › Requests.
// The web's "My Document Requests" (shared/screens/MyRequestsPage.jsx +
// ChecklistPanel + RequestsTable).
//
// One question: what do I have to provide, and how urgent is it?
//
//   Required   — the checklist (#98): everything my job needs on file, whether
//                or not anybody has asked yet. The default, as on the web — a
//                missing document matters before somebody chases it.
//   Asked of me — the requests (#97) HR or my manager raised, with due dates.
//
// ── NOTHING HERE CLOSES A REQUEST ───────────────────────────────────────────
//
// Uploading the document does, on the server, inside the upload's own
// transaction — the upload form's toast says so. There is deliberately no
// "mark as done" (the web's rule). Every outstanding item's tap goes straight
// to the upload form with the type already chosen.
//
// The self projection withholds reminder counts; this screen doesn't hide
// them, the server never sends them, and that is right.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ScrollView, Text } from 'react-native';
import { documentsAPI } from '../../../api';
import { fmtDate } from '../../../lib/dates';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { Button, EmptyState, ErrorState, FilterTabs, HeroCard, InlineAlert, StatusBadge } from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import {
  OUTSTANDING, arrayPayload, checklistCounts, checklistOf, groupLabel, isRequestActive, listPayload,
  requestDisplayStatus, requestFilterQuery, requestTypeOf, requesterLabel,
} from '../docMeta';

const VIEWS = [
  { value: 'required', label: 'Required' },
  { value: 'asked', label: 'Asked of me' },
];

const REQUEST_FILTERS = [
  { value: OUTSTANDING, label: 'Still open' },
  { value: 'fulfilled', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: '', label: 'All' },
];

/* The completeness score — the one figure this section has, as the soft
   state card with a bar (ui/HeroCard, 2026-10-20). A complete file is the
   calm card. */
function Completeness({ completeness, todo }) {
  const { required, satisfied, percent } = completeness;
  if (!required) return null;
  const pct = percent ?? Math.round((satisfied / required) * 100);
  const done = pct >= 100 && !todo;
  return (
    <HeroCard
      icon={icons.folder}
      eyebrow="Your file"
      metric
      title={`${pct}%`}
      caption={`${satisfied} of ${required} on file${todo ? ` · ${todo} to do` : ''}`}
      calm={done}
      progress={pct}
    />
  );
}

export function RequestsTab({ onUpload }) {
  const [view, setView] = useState('required');
  const [filter, setFilter] = useState(OUTSTANDING);
  const [checklist, setChecklist] = useState({ data: null, loading: true, error: null });
  const [requests, setRequests] = useState({ rows: [], loading: true, error: null });
  const [types, setTypes] = useState(new Map());

  const loadChecklist = useCallback(async () => {
    setChecklist((c) => ({ ...c, loading: true, error: null }));
    try {
      setChecklist({ data: checklistOf(await documentsAPI.getMyChecklist()), loading: false, error: null });
    } catch (error) {
      setChecklist((c) => ({ ...c, loading: false, error }));
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setRequests((r) => ({ ...r, loading: true, error: null }));
    try {
      const res = await documentsAPI.getMyDocumentRequests({ ...requestFilterQuery(filter), limit: 50 });
      setRequests({ rows: listPayload(res).rows, loading: false, error: null });
    } catch (error) {
      setRequests((r) => ({ ...r, loading: false, error }));
    }
  }, [filter]);

  useEffect(() => { loadChecklist(); }, [loadChecklist]);
  useEffect(() => { loadRequests(); }, [loadRequests]);
  useEffect(() => {
    documentsAPI.getMyUploadTypes()
      .then((res) => setTypes(new Map(arrayPayload(res).map((t) => [t.id, t]))))
      .catch(() => {});
  }, []);

  useAttendanceChanged(
    [ATTENDANCE_EVENTS.DOCUMENT, ATTENDANCE_EVENTS.DOCUMENT_REQUEST],
    useCallback(() => { loadChecklist(); loadRequests(); }, [loadChecklist, loadRequests]),
  );

  const { refreshControl } = useListRefresh(
    useCallback(() => { loadChecklist(); loadRequests(); }, [loadChecklist, loadRequests]),
    checklist.loading || requests.loading,
  );

  const items = useMemo(() => checklist.data?.items || [], [checklist.data]);
  const todo = items.filter((it) => !checklistCounts(it)).length;
  const canUpload = (typeId) => types.has(typeId);

  const renderChecklist = () => {
    if (checklist.error && !checklist.data) {
      return <ErrorState error={checklist.error} domain="documents" onRetry={loadChecklist} fallback="We couldn’t load what your file needs." />;
    }
    if (checklist.loading && !checklist.data) return <CardsSkeleton rows={4} height={76} />;
    const data = checklist.data;
    if (!data.hasEmployeeRecord || items.length === 0) {
      return (
        <EmptyState
          icon={icons.clipboardCheck}
          title="Nothing required yet"
          message="Your organisation hasn’t listed any documents your role needs on file."
        />
      );
    }
    return (
      <>
        <Completeness completeness={data.completeness} todo={todo} />
        {data.profileIncomplete ? (
          <InlineAlert tone="blue">
            Your department, location and job details aren’t filled in yet, so this is the smallest list. It may grow once HR completes your profile.
          </InlineAlert>
        ) : null}
        {items.map((it, i) => {
          const outstanding = !checklistCounts(it) || it.state === 'expiring';
          const uploadable = outstanding && canUpload(it.document_type_id);
          return (
            <RecordCard
              key={String(it.document_type_id || i)}
              icon={checklistCounts(it) && it.state !== 'expiring' ? icons.ok : icons.document}
              tone={it.state === 'expired' ? 'rose' : 'purple'}
              title={it.name || 'Document'}
              subtitle={[
                it.group ? groupLabel(it.group) : null,
                it.is_statutory ? 'Required by law' : null,
                it.expires_on ? `${it.state === 'expired' ? 'Expired' : 'Expires'} ${fmtDate(it.expires_on)}` : null,
              ].filter(Boolean).join(' · ') || null}
              badge={<StatusBadge kind="checklist" status={it.state} />}
              action={uploadable ? (
                <Button
                  title={it.state === 'expired' || it.state === 'expiring' ? 'Upload renewed' : 'Upload'}
                  size="sm"
                  icon={icons.upload}
                  onPress={() => onUpload({ typeId: it.document_type_id, title: it.name })}
                />
              ) : null}
              onPress={uploadable ? () => onUpload({ typeId: it.document_type_id, title: it.name }) : undefined}
              accessibilityLabel={uploadable ? `${it.name}. Upload it.` : it.name}
            />
          );
        })}
        {items.some((it) => !checklistCounts(it) && !canUpload(it.document_type_id)) ? (
          <Text style={text.caption}>
            Some of these can only be added by HR. They’ll ask you for the paper copy when they need it.
          </Text>
        ) : null}
      </>
    );
  };

  const renderRequests = () => {
    const rows = requests.rows;
    return (
      <>
        <FilterTabs options={REQUEST_FILTERS} value={filter} onChange={setFilter} />
        {requests.error && rows.length === 0 ? (
          <ErrorState error={requests.error} domain="documents" onRetry={loadRequests} fallback="We couldn’t load your requests." />
        ) : requests.loading && rows.length === 0 ? (
          <CardsSkeleton rows={3} height={92} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={icons.clipboard}
            title={filter === OUTSTANDING ? 'Nobody is waiting on you' : 'Nothing here'}
            message={filter === OUTSTANDING ? 'When HR or your manager asks for a document, it shows up here with its due date.' : 'Nothing in this state.'}
          />
        ) : (
          rows.map((req, i) => {
            const type = requestTypeOf(req, types);
            const status = requestDisplayStatus(req);
            const active = isRequestActive(req);
            const uploadable = active && canUpload(req.document_type_id);
            const days = Number(req.days_until_due);
            return (
              <RecordCard
                key={String(req.id || i)}
                icon={icons.clipboard}
                tone="purple"
                title={type?.name || 'A document'}
                subtitle={[`${requesterLabel(req.requested_by_role)} asked`, req.note || null].filter(Boolean).join(' · ')}
                badge={<StatusBadge kind="docRequest" status={status} />}
                highlight={status === 'overdue'}
                meta={[
                  req.due_on ? {
                    label: 'Due',
                    value: active && Number.isFinite(days)
                      ? days < 0 ? `${-days}d overdue` : days === 0 ? 'Today' : fmtDate(req.due_on)
                      : fmtDate(req.due_on),
                  } : null,
                  req.created_at ? { label: 'Asked on', value: fmtDate(req.created_at) } : null,
                  req.fulfilled_at ? { label: 'Done on', value: fmtDate(req.fulfilled_at) } : null,
                ].filter(Boolean)}
                action={uploadable ? (
                  <Button
                    title="Upload"
                    size="sm"
                    icon={icons.upload}
                    onPress={() => onUpload({ typeId: req.document_type_id, title: type?.name, askedFor: { note: req.note, dueOn: req.due_on } })}
                  />
                ) : null}
                onPress={uploadable
                  ? () => onUpload({ typeId: req.document_type_id, title: type?.name, askedFor: { note: req.note, dueOn: req.due_on } })
                  : undefined}
                accessibilityLabel={`${type?.name || 'A document'} request. ${uploadable ? 'Upload it.' : ''}`}
              />
            );
          })
        )}
        {filter === OUTSTANDING && rows.length > 0 ? (
          <Text style={text.caption}>Uploading the document closes its request — there’s nothing else to press.</Text>
        ) : null}
      </>
    );
  };

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      <FilterTabs
        options={VIEWS.map((v) => (v.value === 'required' && todo ? { ...v, label: `Required (${todo} to do)` } : v))}
        value={view}
        onChange={setView}
      />
      {view === 'required' ? renderChecklist() : renderRequests()}
    </ScrollView>
  );
}

export default RequestsTab;
