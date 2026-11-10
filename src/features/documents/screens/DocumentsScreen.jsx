// ─────────────────────────────────────────────────────────────────────────────
// features/documents/screens/DocumentsScreen.jsx — "My Documents".
//
// A PUSHED SCREEN IN HomeTab's STACK since 2026-10-22 (it was the DocsTab
// root; the user moved My Docs into the sidebar and gave its tab to
// Schedules). So it wears the native back header, not the greeting bar —
// the same rule as My Tasks (AppTabs: only a tab root shows the tab bar).
//
// ── ONE SCREEN, FOUR SECTIONS — THE SAME SHAPE AS MY TIME AND MY PAY ────────
//
// The web's MY DOCUMENTS sidebar group maps onto the strip entry for entry:
//
//   My Personal Documents  → 'personal'  (shared/screens/MyDocumentsPage)
//   My Company Documents   → 'company'   (shared/screens/IssuedDocumentsPage)
//   My Document Requests   → 'requests'  (shared/screens/MyRequestsPage)
//   Blank Forms            → 'forms'     (shared/screens/FormsLibraryPage)
//
// My Document Home (AllMyDocumentsPage) is not a fifth section: it gathers the
// other three plus payslips, and on a phone that gathering IS this screen —
// the hero answers its one real question ("does anything need me?") and the
// strip is its four doors. Payslips already have their own tab.
//
// ── THE HERO IS ONE READ, AND IT POINTS SOMEWHERE ───────────────────────────
//
// `getMyComposedDocuments` (#126) carries `requires_action` on every item in
// every section, so it alone says how many things need the person and WHERE
// most of them are. A tap goes to that section. Never a fake zero: while it
// loads it is a skeleton, and a failed read just drops the count.
//
// ── A MODULE THE ORG DOESN'T HAVE IS ABSENT ─────────────────────────────────
//
// Documents switched off for the tenant answers a feature-disabled error; the
// screen says so once instead of four sections each failing (CLAUDE.md §6).
//
// ── HOW YOU ARRIVE ──────────────────────────────────────────────────────────
//
//   drawer / quick action   route.params.section   (navigation/routes.js)
//   email deep link         route.params.documentId → Company, that document
//                           route.path 'document-requests' / 'my-documents'
//
// Every param is applied once and CLEARED, or it is sticky (CLAUDE.md §6).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { documentsAPI } from '../../../api';
import { useBadgeCounts } from '../../../hooks/useBadgeCounts';
import { isDocumentsDisabled } from '../../../lib/errors/documentErrors';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { listFrom, normalizePaginated } from '../../../lib/normalize';
import { color, space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState, HeroCard } from '../../../ui';
import { CategoryStrip } from '../../../ui/ListCards';
import { CompanyTab } from '../components/CompanyTab';
import { FormsTab } from '../components/FormsTab';
import { PersonalTab } from '../components/PersonalTab';
import { RequestsTab } from '../components/RequestsTab';

const SECTIONS = [
  { value: 'personal', label: 'Personal', icon: icons.folder },
  { value: 'company', label: 'Company', icon: icons.office },
  { value: 'requests', label: 'Requests', icon: icons.clipboard },
  { value: 'forms', label: 'Forms', icon: icons.attachment },
];

// #126 section → the strip section that handles it.
const FROM_PORTFOLIO = { my_documents: 'personal', org_documents: 'company', templates: 'forms' };

/** How many things need me, and the section holding most of them. */
function useNeedsYou() {
  const badgeCounts = useBadgeCounts();
  const [state, setState] = useState({
    loading: true,
    count: null,
    where: null,
    requestsCount: 0,
    companyCount: 0,
    disabled: false,
  });

  const load = useCallback(async () => {
    try {
      const [composedRes, reqRes, issuedRes] = await Promise.allSettled([
        documentsAPI.getMyComposedDocuments({ limit: 100 }),
        documentsAPI.getMyDocumentRequests({ status: ['open', 'overdue'], limit: 1 }),
        documentsAPI.getMyIssuedDocuments({ compliance_state: 'pending', limit: 50 }),
      ]);

      let disabled = false;
      let composedActions = 0;
      let composedWhere = null;
      let mostComposed = 0;
      let reqCount = 0;
      let compCount = 0;

      if (composedRes.status === 'fulfilled') {
        const sections = (composedRes.value?.data ?? composedRes.value ?? {}).sections || {};
        Object.entries(sections).forEach(([key, s]) => {
          const n = Array.isArray(s?.items) ? s.items.filter((i) => i?.requires_action).length : 0;
          composedActions += n;
          if (n > mostComposed && FROM_PORTFOLIO[key]) {
            mostComposed = n;
            composedWhere = FROM_PORTFOLIO[key];
          }
        });
      } else if (isDocumentsDisabled(composedRes.reason)) {
        disabled = true;
      }

      if (reqRes.status === 'fulfilled') {
        reqCount = normalizePaginated(reqRes.value, ['requests', 'rows']).total;
      }

      if (issuedRes.status === 'fulfilled') {
        const items = listFrom(issuedRes.value, ['documents', 'issued_documents']);
        compCount = items.filter((d) => !d.acknowledged_at && d.compliance_state !== 'completed').length;
      }

      // Sync with unified badge count store (GET /inbox/badges)
      const badgeReq = badgeCounts?.documents?.outstanding || 0;
      const finalReq = Math.max(reqCount, badgeReq);
      const badgeTotal = badgeCounts?.documentBadgeCount || 0;
      const totalPending = composedActions + finalReq + compCount;
      const finalCount = Math.max(totalPending, badgeTotal);

      let where = null;
      if (finalReq > 0 && finalReq >= compCount && finalReq >= mostComposed) {
        where = 'requests';
      } else if (compCount > 0 && compCount >= mostComposed) {
        where = 'company';
      } else if (composedWhere) {
        where = composedWhere;
      } else if (finalCount > 0) {
        where = finalReq > 0 ? 'requests' : (compCount > 0 ? 'company' : 'personal');
      }

      setState({
        loading: false,
        count: finalCount,
        where,
        requestsCount: finalReq,
        companyCount: compCount,
        disabled,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        disabled: isDocumentsDisabled(err),
      }));
    }
  }, [badgeCounts]);

  useEffect(() => { load(); }, [load]);

  const refreshBadges = badgeCounts.refresh;
  useAttendanceChanged(
    [ATTENDANCE_EVENTS.DOCUMENT, ATTENDANCE_EVENTS.DOCUMENT_REQUEST, ATTENDANCE_EVENTS.ACKNOWLEDGEMENT],
    useCallback(() => {
      load();
      refreshBadges();
    }, [load, refreshBadges]),
  );

  return state;
}

/* The state card (ui/HeroCard, 2026-10-20) — calm when nothing needs you. */
function Hero({ needs, onGo }) {
  const n = needs.count;
  const actionable = n > 0 && needs.where;
  const title = n == null
    ? 'Everything in one place'
    : n === 0
      ? 'You’re all caught up'
      : `${n} ${n === 1 ? 'thing needs' : 'things need'} you`;
  const caption = n == null
    ? 'Your files, the company’s and forms to fill in.'
    : n === 0
      ? 'Nothing to read, sign or upload right now.'
      : needs.where === 'requests'
        ? 'A document request awaiting your upload.'
        : needs.where === 'company'
          ? 'A company document or policy awaiting your review.'
          : 'A policy to confirm, or a document to upload.';
  return (
    <HeroCard
      icon={icons.folder}
      eyebrow="Your documents"
      title={title}
      caption={caption}
      calm={n === 0}
      loading={needs.loading}
      onPress={actionable ? () => onGo(needs.where) : undefined}
    />
  );
}

export default function DocumentsScreen({ navigation, route }) {
  const [section, setSection] = useState('personal');
  const [openId, setOpenId] = useState(null);
  const needs = useNeedsYou();

  // Arrivals: a menu row's section, an email's document, an email's path.
  const params = route?.params || {};
  const path = String(route?.path || '');
  useEffect(() => {
    let next = null;
    if (params.documentId) {
      next = 'company';
      setOpenId(params.documentId);
    } else if (params.section) {
      next = params.section;
    } else if (path.includes('document-requests')) {
      next = 'requests';
    } else if (path.includes('my-documents')) {
      next = 'personal';
    }
    if (next) setSection(next);
    if (params.section || params.documentId) navigation.setParams({ section: undefined, documentId: undefined });
  }, [params.section, params.documentId, path, navigation]);

  const upload = useCallback((p = {}) => navigation.navigate('UploadDocument', p), [navigation]);
  const clearOpen = useCallback(() => setOpenId(null), []);

  const sections = useMemo(() => SECTIONS.map((s) => {
    if (s.value === 'requests' && needs.requestsCount > 0) return { ...s, badge: needs.requestsCount };
    if (s.value === 'company' && needs.companyCount > 0) return { ...s, badge: needs.companyCount };
    return s;
  }), [needs.requestsCount, needs.companyCount]);

  const body = useMemo(() => {
    if (needs.disabled) {
      return (
        <EmptyState
          icon={icons.folder}
          title="Documents aren’t switched on"
          message="Your organisation isn’t using documents in HR Clouds yet."
        />
      );
    }
    if (section === 'company') return <CompanyTab openId={openId} onOpenHandled={clearOpen} />;
    if (section === 'requests') return <RequestsTab onUpload={upload} />;
    if (section === 'forms') return <FormsTab />;
    return <PersonalTab onUpload={upload} />;
  }, [needs.disabled, section, openId, clearOpen, upload]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {/* On the canvas, not a white band with a hairline (2026-10-20). */}
      <View style={{ paddingTop: space[1] }}>
        <View style={{ paddingHorizontal: space[4], paddingBottom: space[2] }}>
          <Hero needs={needs} onGo={setSection} />
        </View>
        {!needs.disabled ? <CategoryStrip items={sections} value={section} onChange={setSection} /> : null}
      </View>
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );
}

export { DocumentsScreen };
