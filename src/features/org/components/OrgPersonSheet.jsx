// ─────────────────────────────────────────────────────────────────────────────
// features/org/components/OrgPersonSheet.jsx — one person on the org chart.
//
// Ported from the web's OrgPersonDialog into a RecordSheet (CLAUDE.md §3 — the
// house record inspector, never a hand-rolled popup). It answers the three
// questions people open an org chart for: who is this, who do they report to,
// and who reports to them. The reporting line and the direct reports are
// tappable and move the sheet to that person, so you can walk the organisation
// without closing it.
//
// Everything comes from the hierarchy already loaded — no request per person.
// It is public-safe by contract (no address, PAN, DOB). An employee can't open
// anyone's HR profile, so there is no "Open profile" link here — a link that
// would 403 is left out, not shown broken (CLAUDE.md §2). Emailing a colleague
// is the one real action, and it always works.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Avatar, Button, Pill, RecordSheet, SheetGrid, SheetSection, SheetStats,
} from '../../../ui';
import { ancestorsOf, levelLabel, roleLabel, roleToneOf } from '../orgMeta';

function PersonLine({ node, onPress, trailing }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[2],
        paddingHorizontal: space[2],
        borderRadius: radius.md,
        backgroundColor: pressed && onPress ? color.brandSoftBg : 'transparent',
      })}
    >
      <Avatar person={node} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={text.smallStrong}>{node.name}</Text>
        <Text numberOfLines={1} style={text.caption}>{node.designation || roleLabel(node.role)}</Text>
      </View>
      {trailing}
      {onPress && icons.chevronRight ? <icons.chevronRight size={16} color={color.textMuted} /> : null}
    </Pressable>
  );
}

export function OrgPersonSheet({ index, personId, companyName, myId, onNavigate, onClose }) {
  const node = index?.byId.get(personId);
  if (!node) return null;

  const t = toneOf(roleToneOf(node.role));
  const chain = ancestorsOf(index, node.id);
  const manager = chain[chain.length - 1] || null;
  const isMe = node.id === myId;
  const reports = node.children;
  const reportsTo = manager ? manager.name
    : node.formerManager ? 'Someone no longer active'
      : 'Nobody — top of the chart';

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow={roleLabel(node.role)}
      icon={icons.profile}
      title={node.name}
      subtitle={[node.designation, node.department].filter(Boolean).join(' · ') || 'No job title yet'}
      badge={isMe ? <Pill>You</Pill> : null}
      footer={node.email && !isMe ? (
        <Button
          title="Send an email"
          variant="outline"
          icon={icons.mail}
          onPress={() => Linking.openURL(`mailto:${node.email}`).catch(() => {})}
          fullWidth
        />
      ) : null}
    >
      {/* Who this is, at a glance. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.brandSoftBg, borderRadius: radius.lg, padding: space[3] }}>
        <Avatar person={node} size={56} />
        <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
            <View style={{ paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.full, backgroundColor: t.bg, borderWidth: 1, borderColor: t.border }}>
              <Text style={[text.badge, { color: t.fg, fontSize: 10 }]}>{roleLabel(node.role)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.full, backgroundColor: color.surfaceSubtle, borderWidth: 1, borderColor: color.borderSubtle }}>
              {icons.office ? <icons.office size={10} color={color.textSecondary} /> : null}
              <Text style={[text.badge, { color: color.textSecondary, fontSize: 10 }]}>{node.department || 'No department'}</Text>
            </View>
          </View>
          {node.work_location ? (
            <Text numberOfLines={1} style={text.caption}>{node.work_location}</Text>
          ) : null}
        </View>
      </View>

      <SheetStats
        items={[
          { label: 'Direct reports', value: String(reports.length), icon: icons.people },
          { label: 'Whole team', value: String(node.teamSize), icon: icons.people },
          { label: 'Place in chart', value: levelLabel(node), icon: icons.chart },
        ]}
      />

      <SheetSection icon={icons.chart} title="Reports to" collapsible={false}>
        {manager ? (
          <PersonLine node={manager} onPress={() => onNavigate(manager.id)} />
        ) : (
          <Text style={text.body}>{reportsTo}</Text>
        )}
      </SheetSection>

      <SheetSection icon={icons.profile} title="Details">
        <SheetGrid
          items={[
            ['Job title', node.designation],
            ['Department', node.department],
            ['Work location', node.work_location],
            ['Employee code', node.employee_code],
            ['Reports to', reportsTo],
            ['Work email', node.email],
          ]}
        />
      </SheetSection>

      {reports.length > 0 ? (
        <SheetSection icon={icons.people} title={`Direct reports (${reports.length})`} defaultOpen={reports.length <= 10}>
          <View style={{ gap: 2 }}>
            {reports.map((c) => (
              <PersonLine
                key={c.id}
                node={c}
                onPress={() => onNavigate(c.id)}
                trailing={c.children.length > 0 ? (
                  <View style={{ paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.full, backgroundColor: color.brandChipBg }}>
                    <Text style={[text.badge, { color: color.brandChipFg, fontSize: 10 }]}>{`${c.teamSize} in team`}</Text>
                  </View>
                ) : null}
              />
            ))}
          </View>
        </SheetSection>
      ) : null}
    </RecordSheet>
  );
}

export default OrgPersonSheet;
