// ─────────────────────────────────────────────────────────────────────────────
// features/documents/components/PersonalTab.jsx — My Documents › Personal.
// The web's "My Personal Documents" (shared/screens/MyDocumentsPage.jsx).
//
// The file I keep about myself: ID, certificates, proofs. Same data, same
// rules as the web — read once (a person has dozens, not thousands), filtered
// here, "expiring soon" derived on the client (docMeta.displayStatus).
//
// ── ONE STRIP, NOT TWO ──────────────────────────────────────────────────────
//
// The web has a Documents | What I can add toggle AND a row of status filters
// under it. On a phone that is two rows of chrome before the first card, so
// "What I can add" is the LAST chip of the one filter strip. Same choices, one
// row.
//
// ── NEEDS ACTION FIRST ──────────────────────────────────────────────────────
//
// Rejected and expired are the two states that need the person, so "Needs
// action" is a filter of its own and the section opens on it when there is
// anything in it. Rose is kept for those two — they are refusals, not waits.
//
// ── THE SHEET IS THE ONLY PLACE ANYTHING HAPPENS ────────────────────────────
//
// Open, upload a new version, upload a corrected copy, delete — all in the
// document's sheet, never on the card (CLAUDE.md §4). A delete asks first
// through useConfirm() and says what is lost.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ScrollView, Text, View } from 'react-native';
import { documentsAPI } from '../../../api';
import { fmtDate } from '../../../lib/dates';
import { errorMessage } from '../../../lib/errors';
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from '../../../lib/events';
import { color, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, EmptyState, ErrorState, FilterTabs, LinkButton, RecordSheet, SheetGrid, SheetSection,
  SheetStats, SheetText, StatusBadge, showToast, useConfirm,
} from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import {
  LIVE_STATUSES, arrayPayload, canOpenFile, canReplace, contentTypeLabel, displayStatus, formatBytes,
  groupLabel, listPayload, maskedNumber, selfDeleteRule, sourceLabel, typePolicyLine,
} from '../docMeta';
import { openDocument } from '../openDoc';

const PAGE_SIZE = 200;
const MAX_PAGES = 5;

async function loadAllMine() {
  const first = listPayload(await documentsAPI.getMyDocuments({ limit: PAGE_SIZE, offset: 0 }));
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE_SIZE));
  if (pages <= 1) return first.rows;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => documentsAPI.getMyDocuments({ limit: PAGE_SIZE, offset: (i + 1) * PAGE_SIZE })),
  );
  return [...first.rows, ...rest.flatMap((res) => listPayload(res).rows)];
}

const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
const byOrder = (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.name).localeCompare(String(b.name));
const NEEDS_ACTION = ['rejected', 'expired'];

/* ─── One document ───────────────────────────────────────────────────────── */

export function DocumentSheet({ doc: initial, type, onClose, onUpload, onChanged }) {
  const confirm = useConfirm();
  const [doc, setDoc] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState(null); // null = not asked for
  const [busy, setBusy] = useState('');

  // The row opens instantly; the detail read then replaces it, so an action is
  // never taken on a stale status (the web does the same).
  useEffect(() => {
    let cancelled = false;
    documentsAPI.getMyDocument(initial.id)
      .then((res) => { if (!cancelled) setDoc({ ...initial, ...(res?.data ?? res) }); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initial]);

  const status = displayStatus(doc);
  const del = selfDeleteRule(doc);

  const loadVersions = async () => {
    setVersions({ loading: true, rows: [] });
    try {
      const rows = arrayPayload(await documentsAPI.getMyVersions(doc.id)).sort((a, b) => (b.version || 0) - (a.version || 0));
      setVersions({ loading: false, rows });
    } catch (err) {
      setVersions({ loading: false, rows: [], error: errorMessage(err, 'documents', 'Couldn’t load the older versions.') });
    }
  };

  const open = async (target = doc) => {
    setBusy(`open-${target.id}`);
    await openDocument(() => documentsAPI.myGetViewUrl(target.id, { disposition: 'inline' }), {
      title: target.title, contentType: target.content_type,
    });
    setBusy('');
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this document?',
      message: `“${doc.title}” is removed from your file. HR keeps a record that it existed. This can’t be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await documentsAPI.myDeleteDocument(doc.id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.DOCUMENT, { action: 'delete' });
      showToast('Document deleted.', 'success');
      onChanged();
      onClose();
    } catch (err) {
      showToast(errorMessage(err, 'documents', 'Couldn’t delete this document.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const primary = status === 'rejected'
    ? { title: 'Upload a corrected copy', run: () => { onClose(); onUpload({ typeId: doc.document_type_id, title: doc.title }); } }
    : canReplace(doc) && (status === 'expired' || status === 'expiring_soon')
      ? { title: 'Upload the renewed copy', run: () => { onClose(); onUpload({ replaceId: doc.id }); } }
      : null;

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow={type ? groupLabel(type.group) : 'Document'}
      icon={doc.is_confidential ? icons.locked : icons.document}
      title={doc.title || type?.name || 'Document'}
      subtitle={type?.name || null}
      badge={<StatusBadge kind="document" status={status} />}
      loading={loading && !doc.status}
      footer={(
        <>
          {canOpenFile(doc) ? (
            <View style={{ flex: 1 }}>
              <Button title="Open" icon={icons.view} variant={primary ? 'outline' : 'primary'} onPress={() => open()} loading={busy === `open-${doc.id}`} fullWidth />
            </View>
          ) : null}
          {primary ? (
            <View style={{ flex: 1.4 }}>
              <Button title={primary.title} icon={icons.upload} onPress={primary.run} fullWidth />
            </View>
          ) : null}
        </>
      )}
    >
      {status === 'rejected' && doc.rejection_reason ? (
        <SheetSection icon={icons.reject} title="Why it was rejected" collapsible={false}>
          <SheetText>{doc.rejection_reason}</SheetText>
        </SheetSection>
      ) : null}

      <SheetStats
        items={[
          { icon: icons.collection, label: 'Version', value: `v${doc.version || 1}` },
          { icon: icons.calendar, label: 'Expires', value: doc.expires_on ? fmtDate(doc.expires_on) : 'Never' },
          { icon: icons.document, label: 'File', value: doc.storage_backend === 'reference' ? 'A link' : `${contentTypeLabel(doc.content_type)} · ${formatBytes(doc.size_bytes)}` },
          { icon: icons.secure, label: 'Who can see it', value: doc.is_confidential ? 'You and HR' : 'You, HR, manager' },
        ]}
      />

      <SheetSection icon={icons.idCard} title="Details" collapsible={false}>
        <SheetGrid
          items={[
            ['Number', maskedNumber(doc.document_number)],
            ['Issued on', doc.issued_on ? fmtDate(doc.issued_on) : null],
            ['Added by', doc.source ? sourceLabel(doc.source) : null],
            ['Added on', doc.created_at ? fmtDate(doc.created_at) : null],
            ['Reviewed on', doc.verified_at || doc.decided_at ? fmtDate(doc.verified_at || doc.decided_at) : null],
          ]}
        />
      </SheetSection>

      <SheetSection icon={icons.collection} title="Older versions" collapsible={false}>
        {versions == null ? (
          <LinkButton title="Show version history" align="left" onPress={loadVersions} />
        ) : versions.loading ? (
          <Text style={text.small}>Loading…</Text>
        ) : versions.error ? (
          <Text style={[text.small, { color: color.danger.fg }]}>{versions.error}</Text>
        ) : versions.rows.length <= 1 ? (
          <Text style={text.small}>This is the only version.</Text>
        ) : (
          <View style={{ gap: space[2] }}>
            {versions.rows.map((v) => (
              <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Text style={[text.bodyStrong, { width: 34 }]}>{`v${v.version || 1}`}</Text>
                <Text style={[text.small, { flex: 1 }]} numberOfLines={1}>
                  {[v.created_at ? fmtDate(v.created_at) : null, v.id === doc.id ? 'This one' : null].filter(Boolean).join(' · ')}
                </Text>
                {canOpenFile(v) && v.id !== doc.id ? (
                  <LinkButton title={busy === `open-${v.id}` ? 'Opening…' : 'Open'} onPress={() => open(v)} />
                ) : null}
              </View>
            ))}
          </View>
        )}
      </SheetSection>

      {canReplace(doc) && !primary ? (
        <LinkButton title="Upload a new version" align="left" onPress={() => { onClose(); onUpload({ replaceId: doc.id }); }} />
      ) : null}
      {del.allowed && doc.status !== 'deleted' ? (
        <View style={{ gap: 4 }}>
          <LinkButton title={busy === 'delete' ? 'Deleting…' : 'Delete this document'} align="left" onPress={remove} textStyle={{ color: color.danger.fg }} />
          {del.note ? <Text style={text.caption}>{del.note}</Text> : null}
        </View>
      ) : null}
    </RecordSheet>
  );
}

/* ─── The section ────────────────────────────────────────────────────────── */

export function PersonalTab({ onUpload }) {
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  const [types, setTypes] = useState({ rows: [], loading: true, error: null });
  const [filter, setFilter] = useState(null); // null until the first load decides
  const navigation = useNavigation();

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const rows = (await loadAllMine()).sort(byNewest);
      setState({ rows, loading: false, error: null });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, []);
  const loadTypes = useCallback(async () => {
    try {
      const rows = arrayPayload(await documentsAPI.getMyUploadTypes()).sort(byOrder);
      setTypes({ rows, loading: false, error: null });
    } catch (error) {
      setTypes({ rows: [], loading: false, error });
    }
  }, []);

  useEffect(() => { load(); loadTypes(); }, [load, loadTypes]);
  useAttendanceChanged([ATTENDANCE_EVENTS.DOCUMENT, ATTENDANCE_EVENTS.DOCUMENT_REQUEST], useCallback(() => load(), [load]));

  const { refreshControl } = useListRefresh(
    useCallback(() => { load(); loadTypes(); }, [load, loadTypes]),
    state.loading,
  );

  const index = useMemo(() => new Map(types.rows.map((t) => [t.id, t])), [types.rows]);
  // A document is a PAGE now, not a sheet (2026-10-22) — screens/DocumentRecordScreens.jsx.
  const setOpen = (d) => navigation.navigate('MyDocument', { doc: d, type: index.get(d?.document_type_id) });
  const rows = useMemo(() => state.rows.map((d) => ({ ...d, _display: displayStatus(d) })), [state.rows]);
  const count = (pred) => rows.filter(pred).length;
  const needs = count((d) => NEEDS_ACTION.includes(d._display));

  // Open on what needs doing, once, when there is something.
  useEffect(() => {
    if (filter === null && !state.loading) setFilter(needs > 0 ? 'action' : '');
  }, [filter, state.loading, needs]);

  const options = [
    { value: '', label: 'All' },
    { value: 'action', label: needs ? `Needs action (${needs})` : 'Needs action' },
    { value: 'pending_verification', label: 'In review' },
    { value: 'available', label: 'Verified' },
    { value: 'superseded', label: 'Older' },
    { value: 'types', label: types.rows.length ? `What I can add (${types.rows.length})` : 'What I can add' },
  ];

  const current = filter ?? '';
  const visible = useMemo(() => {
    if (current === '') return rows.filter((d) => !['superseded', 'deleted'].includes(d._display));
    if (current === 'action') return rows.filter((d) => NEEDS_ACTION.includes(d._display));
    if (current === 'available') return rows.filter((d) => d._display === 'available' || d._display === 'expiring_soon');
    return rows.filter((d) => d._display === current);
  }, [rows, current]);

  const liveByType = useMemo(() => {
    const map = new Map();
    rows.forEach((d) => {
      if (!LIVE_STATUSES.includes(d._display)) return;
      if (!map.has(d.document_type_id)) map.set(d.document_type_id, d);
    });
    return map;
  }, [rows]);

  const renderDocs = () => {
    if (state.error && rows.length === 0) {
      return <ErrorState error={state.error} domain="documents" onRetry={load} fallback="We couldn’t load your documents." />;
    }
    if (state.loading && rows.length === 0) return <CardsSkeleton rows={4} height={92} />;
    if (visible.length === 0) {
      return (
        <EmptyState
          icon={icons.folder}
          title={current ? 'Nothing here' : 'No documents yet'}
          message={current
            ? 'Nothing is in this state right now.'
            : types.rows.length ? 'Start with what your organisation asks for.' : 'HR hasn’t opened anything for you to upload yet.'}
          action={!current && types.rows.length ? <Button title="What I can add" variant="outline" onPress={() => setFilter('types')} /> : null}
        />
      );
    }
    return visible.map((d) => {
      const type = index.get(d.document_type_id);
      const meta = [
        d.expires_on ? { label: d._display === 'expired' ? 'Expired' : 'Expires', value: fmtDate(d.expires_on) } : null,
        maskedNumber(d.document_number) ? { label: 'Number', value: maskedNumber(d.document_number) } : null,
        (d.version || 1) > 1 ? { label: 'Version', value: `v${d.version}` } : null,
      ].filter(Boolean);
      return (
        <RecordCard
          key={d.id}
          icon={d.is_confidential ? icons.locked : icons.document}
          tone={NEEDS_ACTION.includes(d._display) ? 'rose' : 'purple'}
          title={d.title || type?.name || 'Document'}
          subtitle={[type?.name, type ? groupLabel(type.group) : null].filter(Boolean).join(' · ') || null}
          badge={<StatusBadge kind="document" status={d._display} />}
          meta={meta}
          highlight={d._display === 'expiring_soon'}
          onPress={() => setOpen(d)}
          accessibilityLabel={`${d.title}. Open it.`}
        />
      );
    });
  };

  const renderTypes = () => {
    if (types.error) return <ErrorState error={types.error} domain="documents" onRetry={loadTypes} fallback="We couldn’t load the list." />;
    if (types.loading) return <CardsSkeleton rows={3} height={96} />;
    if (types.rows.length === 0) {
      return (
        <EmptyState
          icon={icons.document}
          title="Nothing you can add yourself yet"
          message="HR hasn’t opened anything for employees to upload. They can still add documents to your file."
        />
      );
    }
    return types.rows.map((t) => {
      const have = liveByType.get(t.id);
      const single = !t.allows_multiple;
      return (
        <RecordCard
          key={t.id}
          icon={t.is_confidential ? icons.locked : icons.add}
          tone="purple"
          title={t.name}
          subtitle={[groupLabel(t.group), typePolicyLine(t)].filter(Boolean).join(' · ')}
          badge={<StatusBadge kind="document" status={have ? have._display : 'not_uploaded'} />}
          meta={[
            { label: 'Expiry date', value: t.has_expiry ? 'Needed' : 'No' },
            { label: 'Checked by HR', value: t.requires_verification ? 'Yes' : 'No' },
            { label: 'How many', value: single ? 'One' : 'Several' },
          ]}
          onPress={() => (single && have ? setOpen(have) : onUpload({ typeId: t.id }))}
          accessibilityLabel={single && have ? `${t.name}. Open the one you have.` : `Upload ${t.name}.`}
        />
      );
    });
  };

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      <FilterTabs options={options} value={current} onChange={setFilter} />
      {current !== 'types' ? (
        <Button title="Upload a document" icon={icons.upload} onPress={() => onUpload({})} fullWidth />
      ) : null}
      {current === 'types' ? renderTypes() : renderDocs()}

    </ScrollView>
  );
}

export default PersonalTab;
