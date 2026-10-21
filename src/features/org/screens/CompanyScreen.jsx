// ─────────────────────────────────────────────────────────────────────────────
// features/org/screens/CompanyScreen.jsx — "Company Profile": the organisation's
// own details — who we are, where we are, how many people, who to ask in HR.
//
// A PUSHED STACK SCREEN (user, 2026-10-20), native back. Ported from the web's
// CompanyProfilePage, READ-ONLY: editing the details and the logo are HR-only
// endpoints, so in the employee app those controls are absent, not present-and-
// 403 (CLAUDE.md §2). One read: GET /organizations/details.
//
// Contract traps carried over (web header):
// • `profile` can be null (an org with no profile row). The page still shows the
//   name and says the details aren't on file, rather than a grid of N/A.
// • `gst_number` / `company_pan_number` come back to HR ONLY — absent for an
//   employee — so there is no Tax & legal card here at all.
// • `stats` counts ACTIVE members only.
// • Logo / HR-contact avatars are presigned (~5 min); a stale one falls back to
//   initials (Avatar), which is fine on a read-only page.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { organizationAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { fmtDate, ymdOnly } from '../../../lib/dates';
import { displayValue } from '../../../lib/format';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Avatar, Button, ErrorState, Skeleton,
} from '../../../ui';
import { roleLabel, sizeLabel, websiteHref, websiteLabel } from '../orgMeta';

const clean = (v) => (typeof v === 'string' ? v.trim() : v);
const has = (v) => v !== null && v !== undefined && !(typeof v === 'string' && !v.trim());

/* ─── A titled card ──────────────────────────────────────────────────────── */

function Card({ title, icon: Icon, action, children }) {
  return (
    <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.borderSubtle }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: color.borderSubtle }}>
        {Icon ? <Icon size={16} color={color.brand} /> : null}
        <Text style={[text.bodyStrong, { flex: 1 }]} numberOfLines={1}>{title}</Text>
        {action}
      </View>
      <View style={{ padding: space[3] }}>{children}</View>
    </View>
  );
}

/** Label-above-value, wrapping two to a row. */
function Facts({ items }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
      {items.filter(Boolean).map((item) => (
        <View key={item.label} style={{ flexGrow: 1, flexBasis: item.wide ? '100%' : '44%', minWidth: 0, gap: 3 }}>
          <Text style={[text.label, { color: color.textMuted }]}>{item.label}</Text>
          {item.render || <Text style={[text.body, !has(item.value) && { color: color.textMuted }]}>{displayValue(item.value)}</Text>}
        </View>
      ))}
    </View>
  );
}

/* ─── People: the role split ─────────────────────────────────────────────── */

function PeopleCard({ stats, onOpenChart }) {
  const total = Number(stats?.total_active_members) || 0;
  const parts = [
    { key: 'hr', value: Number(stats?.hr_count) || 0 },
    { key: 'manager', value: Number(stats?.manager_count) || 0 },
    { key: 'employee', value: Number(stats?.employee_count) || 0 },
  ];
  return (
    <Card
      title="People"
      icon={icons.people}
      action={<Button title="Org Chart" size="sm" variant="outline" icon={icons.orgChart} onPress={onOpenChart} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
        <Text style={[text.metricLg, { fontSize: 34, lineHeight: 38 }]}>{total}</Text>
        <Text style={[text.small, { paddingBottom: 4 }]}>active members</Text>
      </View>

      {/* The split by role, one bar. */}
      <View style={{ flexDirection: 'row', height: 10, borderRadius: radius.full, overflow: 'hidden', backgroundColor: color.surfaceSubtle, marginTop: space[3] }}>
        {total > 0 ? parts.map((p) => (p.value > 0 ? (
          <View key={p.key} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: toneOf(p.key === 'hr' ? 'purple' : p.key === 'manager' ? 'indigo' : 'blue').dot }} />
        ) : null)) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[3] }}>
        {parts.map((p) => (
          <View key={p.key} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: toneOf(p.key === 'hr' ? 'purple' : p.key === 'manager' ? 'indigo' : 'blue').dot }} />
              <Text style={text.caption}>{p.key === 'hr' ? 'HR' : `${roleLabel(p.key)}s`}</Text>
            </View>
            <Text style={[text.bodyStrong, { fontVariant: ['tabular-nums'] }]}>{p.value}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[3] }}>
        <View style={{ flex: 1, backgroundColor: color.brandSoftBg, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2] }}>
          <Text style={[text.label, { color: color.brandSoftFg }]}>Departments</Text>
          <Text style={[text.bodyStrong, { fontSize: 18 }]}>{Number(stats?.department_count) || 0}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: color.surfaceSubtle, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2] }}>
          <Text style={[text.label, { color: color.textSecondary }]}>Locations</Text>
          <Text style={[text.bodyStrong, { fontSize: 18 }]}>{Number(stats?.location_count) || 0}</Text>
        </View>
      </View>
    </Card>
  );
}

export default function CompanyScreen({ navigation }) {
  const details = useResource(() => organizationAPI.getOrganizationDetails());
  const data = details.data;

  if (details.loading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <Skeleton type="dashboard" />
      </View>
    );
  }
  if (details.error && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <ErrorState error={details.error} domain="organization" onRetry={details.reload} fallback="Couldn’t load the company details." />
      </View>
    );
  }

  const org = data?.organization || {};
  const profile = data?.profile || null;
  const p = profile || {};
  const name = clean(org.name) || clean(p.org_name) || 'Your organisation';
  const alias = clean(p.org_alias);
  const site = websiteHref(p.website);
  const size = sizeLabel(p.size);
  const joined = org.created_at ? fmtDate(ymdOnly(org.created_at), '') : null;
  const logo = clean(p.logo_url);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const addressLines = [
    [p.address_line_1, p.address_line_2].map(clean).filter(Boolean).join(', '),
    [p.city, p.state, p.zip_code].map(clean).filter(Boolean).join(', '),
    clean(p.country),
  ].filter(Boolean);
  const mapsHref = addressLines.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLines.join(', '))}` : null;
  const contacts = Array.isArray(data?.hr_contacts) ? data.hr_contacts : [];

  const tags = [
    has(p.industry) && { icon: icons.work, text: p.industry },
    size && { icon: icons.people, text: size },
    has(p.founded_year) && { icon: icons.calendar, text: `Founded ${p.founded_year}` },
    (has(p.city) || has(p.country)) && { icon: icons.location, text: [p.city, p.country].map(clean).filter(Boolean).join(', ') },
  ].filter(Boolean);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ padding: space[4], paddingBottom: space[10], gap: space[4] }}>
      {/* ── Hero ── */}
      <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.borderSubtle, overflow: 'hidden' }}>
        <LinearGradient
          colors={[color.heroFrom, color.heroTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ height: 84 }}
        />
        <View style={{ paddingHorizontal: space[4], paddingBottom: space[4] }}>
          <View style={{ marginTop: -36, width: 72, height: 72, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 3, borderColor: color.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {logo ? (
              <Avatar src={logo} size={66} />
            ) : (
              <View style={{ width: 66, height: 66, borderRadius: radius.md, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[text.h2, { color: color.brandChipFg }]}>{initials || 'HR'}</Text>
              </View>
            )}
          </View>
          <Text style={[text.h1, { marginTop: space[2] }]}>{name}</Text>
          {alias && alias !== name ? <Text style={text.small}>{`Also known as ${alias}`}</Text> : null}

          {tags.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1], marginTop: space[3] }}>
              {tags.map((tag) => (
                <View key={tag.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: space[2], paddingVertical: 5, borderRadius: radius.full, backgroundColor: color.surfaceSubtle, borderWidth: 1, borderColor: color.borderSubtle }}>
                  {tag.icon ? <tag.icon size={12} color={color.brand} /> : null}
                  <Text style={[text.caption, { color: color.textBody }]}>{tag.text}</Text>
                </View>
              ))}
              {joined ? (
                <View style={{ paddingHorizontal: space[2], paddingVertical: 5, borderRadius: radius.full, backgroundColor: color.brandSoftBg }}>
                  <Text style={[text.caption, { color: color.brandSoftFg }]}>{`On HR Clouds since ${joined}`}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {(site || has(p.phone_number)) ? (
            <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[3] }}>
              {site ? (
                <Button title="Website" size="sm" variant="outline" icon={icons.globe} onPress={() => Linking.openURL(site).catch(() => {})} />
              ) : null}
              {has(p.phone_number) ? (
                <Button title={String(p.phone_number)} size="sm" variant="ghost" icon={icons.phone} onPress={() => Linking.openURL(`tel:${String(p.phone_number).replace(/[^\d+]/g, '')}`).catch(() => {})} />
              ) : null}
            </View>
          ) : null}

          {has(p.description) ? (
            <Text style={[text.small, { marginTop: space[3], lineHeight: 20 }]}>{p.description}</Text>
          ) : null}
        </View>
      </View>

      {!profile ? (
        <View style={{ flexDirection: 'row', gap: space[2], backgroundColor: color.info.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.info.border, padding: space[3] }}>
          {icons.info ? <icons.info size={18} color={color.info.fg} /> : null}
          <Text style={[text.small, { flex: 1, color: color.info.fg }]}>
            The company’s details aren’t on file yet. The people counts and HR contacts below are still up to date.
          </Text>
        </View>
      ) : null}

      {profile ? (
        <Card title="About the company" icon={icons.office}>
          <Facts
            items={[
              { label: 'Industry', value: p.industry },
              { label: 'Company size', value: size },
              { label: 'Founded', value: p.founded_year },
              { label: 'Short name', value: alias },
              {
                label: 'Website',
                wide: true,
                render: site
                  ? <Text onPress={() => Linking.openURL(site).catch(() => {})} style={[text.body, { color: color.brand }]}>{websiteLabel(p.website)}</Text>
                  : null,
                value: site ? websiteLabel(p.website) : null,
              },
            ]}
          />
        </Card>
      ) : null}

      {profile && addressLines.length ? (
        <Card
          title="Address"
          icon={icons.location}
          action={mapsHref ? <Button title="Maps" size="sm" variant="ghost" icon={icons.external} onPress={() => Linking.openURL(mapsHref).catch(() => {})} /> : null}
        >
          {addressLines.map((line) => <Text key={line} style={text.body}>{line}</Text>)}
        </Card>
      ) : null}

      <PeopleCard stats={data?.stats} onOpenChart={() => navigation.navigate('OrgChart')} />

      <Card title="HR contacts" icon={icons.mail}>
        {contacts.length === 0 ? (
          <Text style={text.small}>
            Nobody has the HR role yet. Once someone does, they’ll be listed here for questions about pay, leave and documents.
          </Text>
        ) : (
          <View style={{ gap: space[2] }}>
            {contacts.map((c) => {
              const cname = clean(c.name) || clean(c.email) || 'A colleague';
              return (
                <View key={c.user_id || c.email || cname} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                  <Avatar person={c} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={text.smallStrong}>{cname}</Text>
                    <Text numberOfLines={1} style={text.caption}>{[c.designation, c.work_location].filter(Boolean).join(' · ') || 'HR'}</Text>
                  </View>
                  {c.email ? (
                    <Button title="Email" size="sm" variant="outline" icon={icons.mail} onPress={() => Linking.openURL(`mailto:${c.email}`).catch(() => {})} />
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

export { CompanyScreen };
