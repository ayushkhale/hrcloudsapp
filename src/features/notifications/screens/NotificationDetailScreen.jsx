// ─────────────────────────────────────────────────────────────────────────────
// features/notifications/screens/NotificationDetailScreen.jsx — one notice,
// in full.
//
// ── WHY THIS IS A ROUTE AND NOT A RecordSheet ───────────────────────────────
//
// The house rule is that a record being READ is a sheet, not a route. A
// notification is the exception, and the reason is the back button: a push
// has to be able to open THIS, directly, with nothing behind it. A sheet is
// local state inside a list screen and cannot be a deep-link target.
//
// ── THE HEADER CARD CARRIES THE CATEGORY ────────────────────────────────────
//
// The tinted block at the top repeats the title on purpose: the native
// header truncates a long title to one line, and this is where the whole
// thing is readable.
//
// ── THE PAYLOAD IS PLAIN TEXT ───────────────────────────────────────────────
//
// The engine's `message` field is display-ready (names and dates are already
// interpolated server-side) and NEVER HTML — render it as text. The deep
// link is driven by `metadata.screen` + `metadata.id`; where the catalog's
// screen exists in the native app, a "View details" button opens it. Unknown
// screens get no button — a dead control is worse than an honest absence
// (CLAUDE.md §4).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fmtDate, fmtTime } from '../../../lib/dates';
import { color, gutter, radius, space, text } from '../../../theme/tokens';
import { iconFor, icons } from '../../../theme/icons';
import { Button, EmptyState, IconTile, Pill, showToast } from '../../../ui';
import { metaFor } from '../notifications.data';
import { canNavigateNotification, navigateNotification } from '../deepLink';

export default function NotificationDetailScreen({ navigation, route }) {
  const item = route?.params?.notification || null;

  const canDeepLink = item ? canNavigateNotification(item) : false;

  const openDeepLink = useCallback(() => {
    if (!item) return;
    const ok = navigateNotification(navigation, item);
    if (!ok) {
      showToast('Could not open details for this notification.', 'info');
    }
  }, [navigation, item]);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, justifyContent: 'center' }}>
        <EmptyState
          icon={icons.inbox}
          title="This notification is no longer available"
          message="It may have been dismissed. Go back to see the rest of your notifications."
        />
      </View>
    );
  }

  const meta = metaFor(item.category);
  const Glyph = iconFor(meta.icon);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: gutter, paddingBottom: space[10], gap: space[4] }}
    >
      {/* ── The tinted head ───────────────────────────────────────────────── */}
      <View
        style={{
          borderRadius: radius.xl,
          padding: space[5],
          gap: space[3],
          backgroundColor: color.brandSoftBg,
          borderWidth: 1,
          borderColor: color.brandSoftBorder,
        }}
      >
        <IconTile icon={Glyph} tone={meta.tone} size="lg" />

        <View style={{ gap: space[2] }}>
          <Text accessibilityRole="header" style={text.h1}>{item.title}</Text>
          <Text style={[text.body, { color: color.textBody }]}>{item.message}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <Pill variant="outline">{meta.label}</Pill>
          {item.actor_name ? (
            <Text style={text.caption}>{`by ${item.actor_name}`}</Text>
          ) : null}
          <Text style={text.caption}>
            {`${fmtTime(item.created_at, '')} · ${fmtDate(item.created_at, '')}`}
          </Text>
        </View>
      </View>

      {canDeepLink ? (
        <Button
          title="View details"
          icon={icons.arrowRight}
          onPress={openDeepLink}
          fullWidth
        />
      ) : null}
    </ScrollView>
  );
}

export { NotificationDetailScreen };
