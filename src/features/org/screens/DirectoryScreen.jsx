// ─────────────────────────────────────────────────────────────────────────────
// features/org/screens/DirectoryScreen.jsx — "Directory": your colleagues
// across the organisation.
//
// A PUSHED STACK SCREEN (user, 2026-10-20), native back. Ported from the web's
// DirectoryPage. People come from GET /organizations/directory — the ONE
// public-safe roster an employee may read (organization.api.js); there is no
// second roster fetch and no employee-directory store here, by design.
//
// The web lays colleagues out as a grid of profile cards; a phone is one column,
// so this is a searchable list of cards that open a contact sheet (CLAUDE.md §1,
// §3 — list → row → record inspector). Search is client-side over the roster
// already loaded: name, job title, department or email.
//
// ── FILTERED BY ROLE, HR FIRST (user, 2026-10-21) ───────────────────────────
//
// Three chips — HR · Manager · Employee — with HR selected on arrival: the
// question people open a directory with is usually "who in HR do I ask?". The
// role is read through roleLabel(), so anything that isn't hr or manager
// (a missing role, an admin) counts as Employee, exactly as its badge reads.
// A search looks across EVERY role: typing a name and getting "Nobody
// matches" because that person is a manager, not HR, is a trap.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { FlatList, Linking, Text, View } from 'react-native';
import { organizationAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { departmentName } from '../../../lib/normalize';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Avatar, Button, EmptyState, ErrorState, FilterTabs, RecordSheet, SheetGrid, SheetSection, TextField,
} from '../../../ui';
import { CardShell, CardsSkeleton, cardListStyle } from '../../../ui/ListCards';
import { roleLabel, roleToneOf } from '../orgMeta';

const personId = (p) => p?.user_id || p?.id || p?._id || p?.email;

const ROLE_FILTERS = ['hr', 'manager', 'employee'];
/** hr · manager · employee — the same buckets roleLabel() names. */
const roleKeyOf = (p) => {
  const r = String(p?.role || '').toLowerCase();
  return r === 'hr' || r === 'manager' ? r : 'employee';
};

/* ─── One colleague's contact card, opened from a row ────────────────────── */

function PersonSheet({ person, onClose }) {
  const t = toneOf(roleToneOf(person.role));
  const dept = departmentName(person);

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow={person.role ? roleLabel(person.role) : 'Colleague'}
      icon={icons.profile}
      title={person.name || 'A colleague'}
      subtitle={person.designation || 'No job title yet'}
      height="short"
      footer={person.email ? (
        <Button
          title="Send an email"
          variant="outline"
          icon={icons.mail}
          onPress={() => Linking.openURL(`mailto:${person.email}`).catch(() => {})}
          fullWidth
        />
      ) : null}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.brandSoftBg, borderRadius: radius.lg, padding: space[3] }}>
        <Avatar person={person} size={56} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          {person.role ? (
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.full, backgroundColor: t.bg, borderWidth: 1, borderColor: t.border }}>
              <Text style={[text.badge, { color: t.fg, fontSize: 10 }]}>{roleLabel(person.role)}</Text>
            </View>
          ) : null}
          {dept ? <Text numberOfLines={1} style={text.caption}>{dept}</Text> : null}
        </View>
      </View>

      <SheetSection icon={icons.profile} title="Details" collapsible={false}>
        <SheetGrid
          items={[
            ['Job title', person.designation],
            ['Department', dept],
            ['Work location', person.work_location],
            ['Work email', person.email],
          ]}
        />
      </SheetSection>
    </RecordSheet>
  );
}

/* ─── A row ───────────────────────────────────────────────────────────────── */

function DirectoryCard({ person, onOpen }) {
  const dept = departmentName(person);
  return (
    <CardShell onPress={() => onOpen(person)} accessibilityLabel={`${person.name || 'A colleague'}. Open their contact details.`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Avatar person={person} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={text.bodyStrong}>{person.name || 'A colleague'}</Text>
          <Text numberOfLines={1} style={text.small}>
            {[person.designation, dept].filter(Boolean).join(' · ') || roleLabel(person.role)}
          </Text>
        </View>
        {icons.chevronRight ? <icons.chevronRight size={18} color={color.textMuted} /> : null}
      </View>
    </CardShell>
  );
}

export default function DirectoryScreen() {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('hr');
  const [open, setOpen] = useState(null);

  const directory = useResource(() => organizationAPI.getDirectory(), {
    select: (data) => (Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : []),
    initial: [],
  });

  const people = useMemo(() => directory.data || [], [directory.data]);
  const searching = !!query.trim();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people.filter((p) => roleKeyOf(p) === role);
    return people.filter((p) => [p.name, p.email, p.designation, departmentName(p)]
      .some((field) => String(field || '').toLowerCase().includes(q)));
  }, [people, query, role]);

  const roleOptions = useMemo(() => ROLE_FILTERS.map((value) => ({
    value,
    label: roleLabel(value),
    count: people.length ? people.filter((p) => roleKeyOf(p) === value).length : undefined,
  })), [people]);

  if (directory.error && people.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <ErrorState error={directory.error} domain="organization" onRetry={directory.reload} fallback="Couldn’t load the directory." />
      </View>
    );
  }

  const header = (
    <View style={{ paddingBottom: space[3], gap: space[3] }}>
      <TextField
        kind="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name, role or department"
        left={icons.search ? <icons.search size={18} color={color.textMuted} /> : null}
      />
      {/* Hidden while searching — the search spans every role (header). */}
      {!searching ? <FilterTabs options={roleOptions} value={role} onChange={setRole} /> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <FlatList
        data={filtered}
        keyExtractor={(item, i) => String(personId(item) || i)}
        ListHeaderComponent={header}
        contentContainerStyle={cardListStyle}
        renderItem={({ item }) => <DirectoryCard person={item} onOpen={setOpen} />}
        ListEmptyComponent={
          directory.loading && people.length === 0 ? (
            <CardsSkeleton rows={6} height={68} />
          ) : (
            <EmptyState
              icon={icons.people}
              title={searching ? 'Nobody matches' : people.length ? 'Nobody here yet' :'The directory is empty'}
              message={searching
                ? `No one matches “${query.trim()}”.`
                : people.length
                  ? `Nobody in the directory is listed as ${roleLabel(role)}.`
                  : 'Colleagues appear here once HR has added them.'}
            />
          )
        }
      />

      {open ? <PersonSheet person={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

export { DirectoryScreen };
