// ─────────────────────────────────────────────────────────────────────────────
// features/home/components/AnnouncementsCard.jsx — the two newest announcements.
//
// Reads from features/notifications/notifications.data.js, which is PLACEHOLDER
// DATA — there is no announcements endpoint yet. The component is written
// against an async source returning an envelope, so the day one exists this
// file does not change at all.
//
// ── ANNOUNCEMENTS ONLY, NOT "LATEST NOTIFICATIONS" ──────────────────────────
//
// A leave approval or a payslip release is transactional: it is read once and
// acted on, and pinning it to the dashboard means it sits there for a week
// after it stopped mattering. An announcement is the opposite — it is meant to
// be seen by everyone, repeatedly, which is what a dashboard slot is for. The
// rest live behind the bell.
//
// ── TWO, AND THE SECOND ONE IS QUIET ────────────────────────────────────────
//
// The newest gets the tinted panel; anything after it is a plain row. Three
// tinted panels in a column is a wall of purple and nothing reads as newest.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fmtDateShort } from '../../../lib/dates';
import { color, iconSize, radius, space, text } from '../../../theme/tokens';
import { iconFor, icons } from '../../../theme/icons';
import { Card, CardHeader, IconTile, LinkButton, Skeleton } from '../../../ui';
import { listAnnouncements, metaFor } from '../../notifications/notifications.data';

export function AnnouncementsCard({ onOpen, onSeeAll, reloadKey }) {
  const [state, setState] = useState({ loading: true, rows: [] });

  useEffect(() => {
    let cancelled = false;
    listAnnouncements(2)
      .then(({ announcements }) => { if (!cancelled) setState({ loading: false, rows: announcements }); })
      .catch(() => { if (!cancelled) setState({ loading: false, rows: [] }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const { loading, rows } = state;

  // No announcements is a normal state and not worth a card saying so.
  if (!loading && rows.length === 0) return null;

  const [lead, ...rest] = rows;
  const Chevron = icons.chevronRight;

  return (
    <Card padded={false} style={{ paddingTop: space[4], paddingBottom: space[3] }}>
      <View style={{ paddingHorizontal: space[4] }}>
        <CardHeader
          variant="title"
          right={onSeeAll ? <LinkButton title="View all" onPress={onSeeAll} /> : undefined}
        >
          Announcements
        </CardHeader>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: space[4] }}>
          <Skeleton type="card" />
        </View>
      ) : (
        <View style={{ paddingHorizontal: space[4], gap: space[2] }}>
          {/* ── The lead ─────────────────────────────────────────────────── */}
          <Pressable
            onPress={() => onOpen?.(lead)}
            accessibilityRole="button"
            accessibilityLabel={lead.title}
            accessibilityHint="Opens the full announcement"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              padding: space[3],
              borderRadius: radius.lg,
              backgroundColor: pressed ? color.brandSoftBorder : color.brandSoftBg,
              borderWidth: 1,
              borderColor: color.brandSoftBorder,
            })}
          >
            <IconTile icon={iconFor(metaFor(lead.category).icon)} tone="purple" size="md" solid />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={text.bodyStrong}>{lead.title}</Text>
              <Text numberOfLines={2} style={text.small}>{lead.preview}</Text>
            </View>
            {Chevron ? <Chevron size={iconSize.sm} color={color.brand} /> : null}
          </Pressable>

          {/* ── The quieter ones ─────────────────────────────────────────── */}
          {rest.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onOpen?.(a)}
              accessibilityRole="button"
              accessibilityLabel={a.title}
              accessibilityHint="Opens the full announcement"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                paddingVertical: space[2],
                paddingHorizontal: space[1],
                borderRadius: radius.md,
                backgroundColor: pressed ? color.pressTint : 'transparent',
              })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={text.smallStrong}>{a.title}</Text>
                <Text style={text.caption}>{fmtDateShort(a.created_at, '')}</Text>
              </View>
              {Chevron ? <Chevron size={16} color={color.textMuted} /> : null}
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

export default AnnouncementsCard;
