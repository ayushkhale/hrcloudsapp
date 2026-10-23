// ─────────────────────────────────────────────────────────────────────────────
// features/org/screens/OrgChartScreen.jsx — "Org Chart": who reports to whom,
// drawn as a graph (user, 2026-10-20 — not the indented list this started as).
//
// A PUSHED STACK SCREEN, native back. The drawing itself — cards joined by
// reporting lines, pan and pinch — is OrgChartCanvas, the web's chart reshaped
// for RN. This screen is the chrome around it: one hierarchy read
// (buildOrgIndex), a search that reveals and highlights a person, "Find me", and
// expand/fold — plus the person inspector a card opens (OrgPersonSheet). The
// company name on the top node comes from the details read, in parallel; the
// chart still draws if it fails ("Organisation" in its place).
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { Pressable, Text, View } from 'react-native';
import { organizationAPI } from '../../../api';
import { useAuth } from '../../../state/AuthContext';
import { useResource } from '../../../hooks/useResource';
import { color, elevate, gutter, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Avatar, Button, EmptyState, ErrorState, Skeleton, TextField,
} from '../../../ui';
import { OrgChartCanvas } from '../components/OrgChartCanvas';
import { OrgPersonSheet } from '../components/OrgPersonSheet';
import {
  allExpandable, ancestorsOf, buildOrgIndex, defaultExpanded, roleLabel, searchPeople,
} from '../orgMeta';

/** What "Fold back" leaves open: the top people's teams, unless that is all of them. */
function foldedView(index) {
  const top = new Set(index.roots.filter((n) => n.children.length).map((n) => n.id));
  return top.size < allExpandable(index).size ? top : new Set();
}

export default function OrgChartScreen() {
  const { user } = useAuth();
  const myId = user?.id || null;

  const hierarchy = useResource(() => organizationAPI.getOrganizationHierarchy(), {
    select: (data) => buildOrgIndex(data),
  });
  const details = useResource(() => organizationAPI.getOrganizationDetails(), { onError: () => {} });
  const index = hierarchy.data;
  const companyName = details.data?.organization?.name || details.data?.profile?.org_name || null;

  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null); // highlighted on the chart
  const [openId, setOpenId] = useState(null); // the inspector
  const [didInit, setDidInit] = useState(false);

  useEffect(() => {
    if (index && !didInit) { setExpanded(defaultExpanded(index)); setDidInit(true); }
  }, [index, didInit]);

  const onToggle = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const revealAll = useCallback((ids) => {
    if (!index) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of ids) for (const a of ancestorsOf(index, id)) next.add(a.id);
      return next;
    });
  }, [index]);

  const focusPerson = useCallback((id) => { revealAll([id]); setSelectedId(id); setQuery(''); }, [revealAll]);

  const results = useMemo(() => (query.trim() ? searchPeople(index, query, 8) : []), [index, query]);
  const pathIds = useMemo(() => {
    if (!index || !selectedId || !index.byId.has(selectedId)) return new Set();
    return new Set([selectedId, ...ancestorsOf(index, selectedId).map((a) => a.id)]);
  }, [index, selectedId]);

  const expandedAll = index
    ? allExpandable(index).size > 0 && [...allExpandable(index)].every((id) => expanded.has(id))
    : false;
  const meOnChart = !!(index && myId && index.byId.has(myId));

  const onOpenPerson = useCallback((id) => {
    setSelectedId(id);
    setOpenId(id);
  }, []);

  const ctx = useMemo(() => ({
    expanded, onToggle, onOpen: onOpenPerson, selectedId, pathIds, deptFilter: null, myId,
  }), [expanded, onToggle, onOpenPerson, selectedId, pathIds, myId]);

  if (hierarchy.loading && !index) {
    return <View style={{ flex: 1, backgroundColor: color.bg }}><Skeleton type="dashboard" /></View>;
  }
  if (hierarchy.error && !index) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <ErrorState error={hierarchy.error} domain="organization" onRetry={hierarchy.reload} fallback="Couldn’t load the org chart." />
      </View>
    );
  }
  if (!index || index.total === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <EmptyState
          icon={icons.people}
          title="Nobody is on the chart yet"
          message="People appear here once HR has added them and set who they report to."
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {/* ── Toolbar ── */}
      <View style={{ paddingHorizontal: gutter, paddingTop: space[3], paddingBottom: space[2], backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.borderSubtle, zIndex: 10 }}>
        <TextField
          kind="search"
          value={query}
          onChangeText={setQuery}
          placeholder="Find a person, job title or team"
          left={icons.search ? <icons.search size={18} color={color.textMuted} /> : null}
        />
        <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[2] }}>
          {meOnChart ? <Button title="Find me" size="sm" icon={icons.location} onPress={() => focusPerson(myId)} /> : null}
          {allExpandable(index).size > 0 ? (
            <Button
              title={expandedAll ? 'Fold back' : 'Expand all'}
              size="sm"
              variant="outline"
              icon={expandedAll ? icons.chevronUp : icons.chevronDown}
              // Fold back goes to the TOP, not to the default view. In an org
              // of up to ~24 people the default view already opens every team,
              // so "back to default" was identical to "all open" and the
              // button did nothing (2026-10-21). Top level open, or — when
              // that is still everything — fully folded.
              onPress={() => setExpanded(expandedAll ? foldedView(index) : allExpandable(index))}
            />
          ) : null}
        </View>

        {/* Search results drop below the field. */}
        {query.trim() ? (
          <View style={{ position: 'absolute', left: gutter, right: gutter, top: 58, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, overflow: 'hidden', ...elevate('lg') }}>
            {results.length === 0 ? (
              <Text style={[text.small, { color: color.textMuted, padding: space[3] }]}>{`Nobody matches “${query.trim()}”.`}</Text>
            ) : results.map((n) => (
              <Pressable
                key={n.id}
                onPress={() => focusPerson(n.id)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], paddingVertical: space[2], backgroundColor: pressed ? color.brandSoftBg : 'transparent' })}
              >
                <Avatar person={n} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={text.smallStrong}>{n.name}</Text>
                  <Text numberOfLines={1} style={text.caption}>{[n.designation || roleLabel(n.role), n.department].filter(Boolean).join(' · ')}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* ── The drawn chart ── */}
      <OrgChartCanvas index={index} ctx={ctx} companyName={companyName} />

      {openId ? (
        <OrgPersonSheet
          index={index}
          personId={openId}
          myId={myId}
          onNavigate={(id) => onOpenPerson(id)}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </View>
  );
}

export { OrgChartScreen };
