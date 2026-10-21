// ─────────────────────────────────────────────────────────────────────────────
// features/notifications/screens/NotificationDetailScreen.jsx — one notice,
// in full.
//
// ── WHY THIS IS A ROUTE AND NOT A RecordSheet ───────────────────────────────
//
// The house rule is that a record being READ is a sheet, not a route (see
// navigation/tabs.employee.js). A notification is the exception, and the
// reason is the back button: a notice arrives by push, and a push has to be
// able to open THIS, directly, with nothing behind it. A sheet is local state
// inside a list screen and cannot be a deep-link target. It is also a page of
// prose rather than a record of fields, which is the other half of what a
// sheet is for.
//
// ── THE HEADER CARD CARRIES THE CATEGORY ────────────────────────────────────
//
// The tinted block at the top is the reference composition's yellow panel,
// rendered in the brand ramp. It repeats the title on purpose: the native
// header truncates a long title to one line, and this is where the whole
// thing is readable.
//
// ── THE ATTACHMENT IS A PROMISE WE DON'T KEEP YET ───────────────────────────
//
// The placeholder data carries a file name and a size, and there is no file
// behind it. So the row says what it is and says plainly that it isn't
// downloadable yet, rather than offering a button that does nothing — a dead
// control is worse than an honest absence (CLAUDE.md §11).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fmtDate, fmtTime } from '../../../lib/dates';
import { color, gutter, radius, space, text } from '../../../theme/tokens';
import { iconFor, icons } from '../../../theme/icons';
import { Card, EmptyState, IconTile, Pill, Skeleton } from '../../../ui';
import { getNotification, metaFor } from '../notifications.data';

export default function NotificationDetailScreen({ route }) {
  const id = route?.params?.id;
  const [state, setState] = useState({ loading: true, item: null });

  useEffect(() => {
    let cancelled = false;
    getNotification(id)
      .then((item) => { if (!cancelled) setState({ loading: false, item }); })
      .catch(() => { if (!cancelled) setState({ loading: false, item: null }); });
    return () => { cancelled = true; };
  }, [id]);

  const { loading, item } = state;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, padding: gutter, gap: space[4] }}>
        <Skeleton type="card" />
        <Skeleton type="rows" rows={3} avatar={false} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, justifyContent: 'center' }}>
        <EmptyState
          icon={icons.inbox}
          title="This notification is no longer available"
          message="It may have been withdrawn. Go back to see the rest of your notifications."
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
          <Text style={[text.body, { color: color.textBody }]}>{item.preview}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <Pill variant="outline">{meta.label}</Pill>
          <Text style={text.caption}>
            {`${fmtTime(item.created_at, '')} · ${fmtDate(item.created_at, '')}`}
          </Text>
        </View>
      </View>

      {/* ── The body ──────────────────────────────────────────────────────────
          Paragraphs are split rather than rendered as one blob: a single Text
          with "\n\n" in it gets no paragraph spacing, and a wall of text is
          the reason nobody reads the policy. */}
      <Card>
        <View style={{ gap: space[3] }}>
          {String(item.body || '').split('\n\n').map((para, i) => (
            <Text key={i} style={[text.body, { color: color.textBody }]}>{para}</Text>
          ))}
        </View>
      </Card>

      {/* ── The attachment ────────────────────────────────────────────────── */}
      {item.attachment ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <IconTile icon={icons.document} tone="indigo" size="md" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={text.bodyStrong}>{item.attachment.name}</Text>
              <Text style={text.caption}>
                {`${item.attachment.size_label} · Download opens once notifications go live`}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

export { NotificationDetailScreen };
