// ─────────────────────────────────────────────────────────────────────────────
// features/documents/components/CompanyTab.jsx — My Documents › Company.
// The web's "My Company Documents" (shared/screens/IssuedDocumentsPage.jsx +
// OrgDocumentDetailDialog's self plane + ComplianceDialogs).
//
// Policies, notices and letters the organisation has issued to me, and what
// it asks of me: read it, and sometimes acknowledge it or sign it.
//
// ── THE SERVER JUDGES "OVERDUE", NOT THIS SCREEN ────────────────────────────
//
// Needs you / Overdue / Done come from `compliance_state`, worked out by the
// server against today's IST date. Never recomputed here (docMeta.ackBlockOf).
// The Docs tab badge counts `compliance_state: pending` — the same filter this
// list's "Needs you" uses, so the badge and the list cannot disagree.
//
// ── OPENING IS THE READ RECEIPT ─────────────────────────────────────────────
//
// Fetching the view link records that I opened it, so it is always a tap,
// never a background call. Acknowledging something UNOPENED is allowed by the
// server but says so first — the web's NotOpenedHint, in words.
//
// ── ACKNOWLEDGE / SIGN LIVE IN THE SHEET ────────────────────────────────────
//
// The web opens a second dialog over the first. On a phone that is a sheet on
// a sheet; here the step is a labelled group at the bottom of the same sheet:
// a consent switch (the web's checkbox, the web's sentence), and for a
// signature a name box. Permanent, and the copy says so. The button stays
// live; pressing it unticked points at the switch (§11).
//
// ── DEEP LINK ───────────────────────────────────────────────────────────────
//
// An email's "View document" lands with a DOCUMENT id (`openId`). It is read
// with #71, which answers the recipient row this sheet wants. Nothing found =
// withdrawn, replaced or not mine: a notice that STAYS, never a toast — the
// one document they came for is the whole reason they are here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { ScrollView, Text, View } from 'react-native';
import { documentsAPI } from '../../../api';
import { useAuth } from '../../../state/AuthContext';
import { fmtDate, fmtDateTime } from '../../../lib/dates';
import { errorMessage } from '../../../lib/errors';
import { isNotFound } from '../../../lib/errors/attendanceErrors';
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from '../../../lib/events';
import { color, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, EmptyState, ErrorState, Field, FieldError, FilterTabs, InlineAlert, RecordSheet, SheetGrid,
  SheetSection, SheetStats, StatusBadge, TextField, Toggle, showToast,
} from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import {
  SIGNER_MAX, SIGNER_MIN, ackBlockOf, actionWindow, asksForSomething, documentTypeName, dueLabel,
  hasEvidence, listPayload, myComplianceState, nextActionOf, obligationLabel,
} from '../docMeta';
import { openDocument } from '../openDoc';

const PAGE = 50;

const FILTERS = [
  { value: 'pending', label: 'Needs you' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Done' },
  { value: '', label: 'All' },
];

const docOf = (row) => row?.document || {};
const docIdOf = (row) => docOf(row).id || row?.document_id || row?.id;

function StateBadge({ row }) {
  const doc = docOf(row);
  const block = ackBlockOf(row);
  return asksForSomething(doc) && block.state
    ? <StatusBadge kind="compliance" status={myComplianceState(row)} />
    : <StatusBadge kind="recipient" status={row?.state || 'pending'} />;
}

/* ─── One document ───────────────────────────────────────────────────────── */

export function CompanySheet({ row: initial, onClose, onChanged }) {
  const { user } = useAuth();
  const [row, setRow] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState(null);

  const id = docIdOf(initial);

  const reload = useCallback(async () => {
    try {
      const res = await documentsAPI.getMyIssuedDocument(id);
      const data = res?.data ?? res;
      setRow((r) => ({ ...r, ...data, document: { ...(r.document || {}), ...(data?.document || {}) } }));
    } catch {
      // the row we opened with is still shown
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  const doc = docOf(row);
  const block = ackBlockOf(row);
  const next = nextActionOf(row);
  const win = actionWindow(doc);
  const canAct = !!next && win.open;
  const done = hasEvidence(row);
  const opened = !!row?.first_viewed_at || (row?.state && row.state !== 'pending');

  // The receipt, once there is one — when, and as whom.
  useEffect(() => {
    if (!done) return undefined;
    let cancelled = false;
    documentsAPI.getMyIssuedEvidence(id)
      .then((res) => { if (!cancelled) setEvidence(res?.data ?? res); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [done, id]);

  const open = async () => {
    setOpening(true);
    const ok = await openDocument(() => documentsAPI.myIssuedGetViewUrl(id, { disposition: 'inline' }), {
      title: doc.title, contentType: doc.content_type, reference: doc.storage_backend === 'reference',
    });
    setOpening(false);
    if (ok) {
      // The open was the read; the row now says so.
      reload();
      onChanged();
    }
  };

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const nameProblem = next === 'sign' && trimmed.length < SIGNER_MIN ? `Type your name — at least ${SIGNER_MIN} characters.` : '';
  const consentProblem = !agreed ? 'Tick this to confirm.' : '';

  const act = async () => {
    setTried(true);
    if (consentProblem || nameProblem || busy) return;
    setBusy(true);
    try {
      const res = next === 'sign'
        ? await documentsAPI.signIssuedDocument(id, trimmed)
        : await documentsAPI.acknowledgeIssuedDocument(id);
      const data = res?.data ?? {};
      emitAttendanceChanged(ATTENDANCE_EVENTS.ACKNOWLEDGEMENT, { action: next });
      showToast(
        data.already_signed || data.already_acknowledged
          ? 'You had already done this — nothing changed.'
          : next === 'sign' ? 'Signed. Your receipt is saved.' : 'Acknowledged. Your receipt is saved.',
        'success',
      );
      setAgreed(false);
      setTried(false);
      await reload();
      onChanged();
    } catch (err) {
      showToast(errorMessage(err, 'documents', next === 'sign' ? 'Couldn’t sign this document.' : 'Couldn’t acknowledge this document.'), 'error');
      // A stale row is the usual cause; re-read so the sheet tells the truth.
      reload();
    } finally {
      setBusy(false);
    }
  };

  const ack = evidence?.acknowledgement;
  const sig = evidence?.signature;

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow={documentTypeName(doc) || 'Company document'}
      icon={doc.requires_signature ? icons.edit : icons.office}
      title={doc.title || 'Document'}
      subtitle={[doc.reference_number, doc.version > 1 ? `Version ${doc.version}` : null].filter(Boolean).join(' · ') || null}
      badge={<StateBadge row={row} />}
      loading={loading && !doc.title}
      footer={(
        <>
          <View style={{ flex: 1 }}>
            <Button
              title="Open"
              icon={icons.view}
              variant={canAct && opened ? 'outline' : 'primary'}
              onPress={open}
              loading={opening}
              fullWidth
            />
          </View>
          {canAct && opened ? (
            <View style={{ flex: 1.3 }}>
              <Button
                title={next === 'sign' ? 'Sign' : 'Acknowledge'}
                icon={next === 'sign' ? icons.edit : icons.check}
                onPress={act}
                loading={busy}
                fullWidth
              />
            </View>
          ) : null}
        </>
      )}
    >
      {block.isOverdue && next ? (
        <InlineAlert tone="amber">
          {block.isBlocking
            ? 'Your organisation treats this as a priority. Please read it and confirm today.'
            : 'The date you were asked to do this by has passed. It only takes a minute.'}
        </InlineAlert>
      ) : null}

      <SheetStats
        items={[
          { icon: icons.clipboardCheck, label: 'Asks you for', value: obligationLabel(doc).replace(' needed', '') },
          next && block.dueOn ? { icon: icons.calendar, label: 'Due', value: dueLabel(block.daysRemaining) || fmtDate(block.dueOn) } : null,
          done ? { icon: icons.verified, label: row.state === 'signed' ? 'Signed' : 'Acknowledged', value: fmtDate(block.signedAt || block.acknowledgedAt || sig?.signed_at || ack?.acknowledged_at, 'Yes') } : null,
          doc.effective_from ? { icon: icons.calendar, label: 'In force from', value: fmtDate(doc.effective_from) } : null,
        ].filter(Boolean)}
      />

      {doc.description ? (
        <SheetSection icon={icons.document} title="About this document" collapsible={false}>
          <Text style={text.body}>{doc.description}</Text>
        </SheetSection>
      ) : null}

      {/* ── The step it asks of me ─────────────────────────────────────── */}
      {next && !win.open ? (
        <Text style={text.small}>
          {win.reason === 'scheduled' && doc.effective_from
            ? `You can do this from ${fmtDate(doc.effective_from)}, when it comes into force.`
            : 'This version can’t be acknowledged any more — a newer one replaced it, or it has ended.'}
        </Text>
      ) : null}

      {canAct ? (
        <SheetSection
          icon={next === 'sign' ? icons.edit : icons.check}
          title={next === 'sign' ? 'Sign it' : 'Acknowledge it'}
          collapsible={false}
        >
          <View style={{ gap: space[3] }}>
            {!opened ? (
              <InlineAlert tone="blue">
                You haven’t opened this document yet. Open it and read it first — your confirmation is only worth something once you have.
              </InlineAlert>
            ) : null}
            {next === 'sign' ? (
              <Field
                label="Your full name"
                error={tried ? nameProblem : ''}
                hint={user?.name ? `As your profile shows it — for example ${user.name}.` : 'Your first and last name, as your profile shows it.'}
              >
                <TextField kind="name" value={name} onChangeText={setName} placeholder="Type your name" maxLength={SIGNER_MAX} />
              </Field>
            ) : null}
            <View>
              <Toggle
                label={next === 'sign'
                  ? 'I have read this document and agree that typing my name is my signature on it.'
                  : 'I have read this document, I understand it, and I agree to follow it.'}
                value={agreed}
                onValueChange={setAgreed}
              />
              {tried && consentProblem ? <FieldError>{consentProblem}</FieldError> : null}
            </View>
            <Text style={text.caption}>
              {next === 'sign'
                ? 'Saved with the name you typed, today’s date and time, and this exact version. It’s permanent. Signing also counts as acknowledging.'
                : 'Saved with today’s date and time and this exact version. It’s permanent — it can’t be taken back.'}
            </Text>
            {!opened ? <Button title={next === 'sign' ? 'Sign anyway' : 'Acknowledge anyway'} variant="outline" onPress={act} loading={busy} fullWidth /> : null}
          </View>
        </SheetSection>
      ) : null}

      {done && (ack || sig) ? (
        <SheetSection icon={icons.verified} title="Your receipt" collapsible={false}>
          <SheetGrid
            items={[
              sig?.signer_name ? ['Signed as', sig.signer_name] : null,
              sig?.signed_at ? ['Signed', fmtDateTime(sig.signed_at)] : null,
              ack?.acknowledged_at ? ['Acknowledged', fmtDateTime(ack.acknowledged_at)] : null,
              (sig?.document_version ?? ack?.document_version) != null ? ['Version', `v${sig?.document_version ?? ack?.document_version}`] : null,
            ].filter(Boolean)}
          />
        </SheetSection>
      ) : null}
    </RecordSheet>
  );
}

/* ─── The section ────────────────────────────────────────────────────────── */

export function CompanyTab({ openId, onOpenHandled }) {
  const [filter, setFilter] = useState(null);
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  const [needsYou, setNeedsYou] = useState(null);
  // An issued document is a PAGE now, not a sheet (2026-10-22) — the deep link
  // lands on it too. screens/DocumentRecordScreens.jsx.
  const navigation = useNavigation();
  const setOpen = useCallback((row) => navigation.navigate('CompanyDocument', { row }), [navigation]);
  const [gone, setGone] = useState(false);

  // How many need me decides where the section opens.
  const loadTally = useCallback(async () => {
    try {
      const res = await documentsAPI.getMyIssuedDocuments({ compliance_state: 'pending', limit: 1 });
      setNeedsYou(listPayload(res).total);
    } catch {
      setNeedsYou(0);
    }
  }, []);

  useEffect(() => { loadTally(); }, [loadTally]);
  useEffect(() => {
    if (filter === null && needsYou !== null) setFilter(needsYou > 0 ? 'pending' : '');
  }, [filter, needsYou]);

  const load = useCallback(async () => {
    if (filter === null) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getMyIssuedDocuments({ compliance_state: filter || undefined, limit: PAGE, offset: 0 });
      setState({ rows: listPayload(res).rows, loading: false, error: null });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(() => { load(); loadTally(); }, [load, loadTally]);
  useAttendanceChanged([ATTENDANCE_EVENTS.ACKNOWLEDGEMENT], refresh);

  const { refreshControl } = useListRefresh(refresh, state.loading);

  // The deep link: read the one document and open it.
  useEffect(() => {
    if (!openId) return undefined;
    let cancelled = false;
    setGone(false);
    documentsAPI.getMyIssuedDocument(openId)
      .then((res) => {
        if (cancelled) return;
        const data = res?.data ?? res;
        if (data) setOpen(data);
        else setGone(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isNotFound(err)) setGone(true);
        else showToast(errorMessage(err, 'documents', 'Couldn’t open that document. Check your connection.'), 'error');
      })
      .finally(() => onOpenHandled?.());
    return () => { cancelled = true; };
  }, [openId, onOpenHandled, setOpen]);

  const options = useMemo(() => FILTERS.map((f) => (
    f.value === 'pending' && needsYou ? { ...f, label: `Needs you (${needsYou})` } : f
  )), [needsYou]);

  const rows = state.rows;
  const current = filter ?? 'pending';

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      {gone ? (
        <InlineAlert tone="blue">
          That document isn’t available to you any more — it was withdrawn, replaced by a newer version, or addressed to someone else. Everything issued to you is below.
        </InlineAlert>
      ) : null}

      <FilterTabs options={options} value={current} onChange={setFilter} />

      {state.error && rows.length === 0 ? (
        <ErrorState error={state.error} domain="documents" onRetry={load} fallback="We couldn’t load your company documents." />
      ) : (state.loading || filter === null) && rows.length === 0 ? (
        <CardsSkeleton rows={4} height={96} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={icons.office}
          title={current === 'pending' ? 'Nothing needs you' : current === 'overdue' ? 'Nothing overdue' : 'Nothing here'}
          message={current === 'pending' || current === 'overdue'
            ? 'Everything your company asked you to read or sign is done.'
            : 'Policies and letters your organisation issues to you appear here.'}
          action={current ? <Button title="See all" variant="outline" onPress={() => setFilter('')} /> : null}
        />
      ) : (
        rows.map((row, i) => {
          const doc = docOf(row);
          const block = ackBlockOf(row);
          const next = nextActionOf(row);
          const win = actionWindow(doc);
          return (
            <RecordCard
              key={String(row.id || docIdOf(row) || i)}
              icon={doc.requires_signature ? icons.edit : doc.reference_number ? icons.mail : icons.office}
              tone="purple"
              title={doc.title || 'Document'}
              subtitle={[doc.reference_number, documentTypeName(doc), obligationLabel(doc)].filter(Boolean).join(' · ')}
              badge={<StateBadge row={row} />}
              highlight={!!(block.isOverdue && next)}
              meta={[
                next && win.open && block.dueOn ? { label: 'Due', value: dueLabel(block.daysRemaining) || fmtDate(block.dueOn) } : null,
                hasEvidence(row) && (block.signedAt || block.acknowledgedAt)
                  ? { label: row.state === 'signed' ? 'Signed' : 'Acknowledged', value: fmtDate(block.signedAt || block.acknowledgedAt) }
                  : null,
                next && win.reason === 'scheduled' && doc.effective_from ? { label: 'Opens', value: fmtDate(doc.effective_from) } : null,
                doc.version > 1 ? { label: 'Version', value: `v${doc.version}` } : null,
              ].filter(Boolean)}
              onPress={() => setOpen(row)}
              accessibilityLabel={`${doc.title}. ${next ? `Needs you to ${next}.` : ''} Open it.`}
            />
          );
        })
      )}

    </ScrollView>
  );
}

export default CompanyTab;
