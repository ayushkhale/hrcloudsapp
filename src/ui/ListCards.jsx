// ─────────────────────────────────────────────────────────────────────────────
// ui/ListCards.jsx — the card kit every section list in this app is built from.
//
// ── WHY IT LEFT features/attendance (2026-10-18) ─────────────────────────────
//
// These five shapes were written for My Time and lived in
// `features/attendance/components/TimeCards.jsx`. My Pay is the same screen
// with different data — one root, a grid of sections, a list of record cards
// under it — so it needs every one of them. A feature importing another
// feature's internals is how a shared component becomes two shared components
// that drift, which is the mistake 30-domain/01-wording.md §14 is about.
//
// So they moved here, unchanged, and both features import them. What stayed
// behind in TimeCards.jsx is what is genuinely about attendance: `MonthHero`,
// `DayCard` and the punch line they draw.
//
//   CategoryStrip  the sections of a tab, one scrolling row of icons
//   CardShell      the white card with the press tint — the base of all of them
//   RecordCard     one record: a tinted identity, the fact, the number
//   StatCards      two to four figures above a list
//   CardsSkeleton  the first load, card-shaped
//   cardListStyle  the contentContainerStyle every one of those lists uses
//
// ── CARDS HERE, FLAT ON HOME ─────────────────────────────────────────────────
//
// Home is white and flat by decision (see HomeScreen's header): it has no list,
// so card edges there were three frames around nothing. A section list is
// nothing BUT rows, so they need edges to be objects — and they sit on
// `color.bg` (slate-50), which is what white cards need underneath them. What
// must never happen is both treatments on the same screen.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { color, elevate, font, radius, space, text, toneOf } from '../theme/tokens';
import { FieldHelp } from './FieldHelp';
import { SkeletonBlock } from './Skeleton';
import { haptic } from './haptics';

/* ─── CategoryStrip ───────────────────────────────────────────────────────────
   The sections of a tab root (My Time, My Pay, My Documents, My Tasks), as
   one horizontal row of icons with a word under each.

   ── ONE ROW THAT SCROLLS (user, 2026-10-21) ───────────────────────────────

   "the action buttons clearly need a redesign completely — they look so
   awful one packed into another — align them in one line horizontal, one
   row, scrollable". This REVERSES the 2026-10-18 grid (four per row, two
   rows, nothing hidden) on the user's instruction; CLAUDE.md §1 records the
   change, so don't put the grid back.

   What "packed into another" was: a bordered white tile holding a tinted
   square holding the glyph — a box in a box in a box, eight times, in two
   rows that cost ~150pt above every list. Now each section is two things
   and no box: a ROUND tinted chip and the word under it; the selected one's
   chip is solid purple and its word purple and bold. One row is ~72pt. (It
   also had a short purple underline under the selected word; the user asked
   for it to go, 2026-10-22 — the filled chip already says "you are here".)

   The grid's old worry was that a scroller hides its overflow. That is
   answered by WIDTH, not by wrapping: items are sized so a 360pt phone cuts
   the fifth one in half at the edge, and a half-drawn icon is the thing that
   says "there's more this way". The selected section is scrolled into view,
   so a deep-linked section is never the one off-screen.

   It must not look like `FilterTabs`, which sits directly under it on Leave
   and Corrections: those are pills of words, this is a row of icons. Two
   rows of identical pills would be two "where am I" answers in one shape.

   A `badge` is the count of things WAITING ON SOMEBODY — a pending request,
   an open flag. It is the only number here, so it means one thing. */

const STRIP_ITEM_MIN = 68;
const STRIP_CHIP = 46;

export function CategoryStrip({ items, value, onChange }) {
  const scroller = React.useRef(null);
  const offsets = React.useRef({});

  // Keep the selected section on screen — a drawer row can deep-link straight
  // to the last one, which would otherwise sit past the right edge.
  React.useEffect(() => {
    const x = offsets.current[value];
    if (x != null && scroller.current) {
      scroller.current.scrollTo({ x: Math.max(0, x - space[4] - STRIP_ITEM_MIN), animated: true });
    }
  }, [value]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{
        paddingHorizontal: space[3],
        paddingTop: space[2],
        paddingBottom: space[2],
        gap: space[1],
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;

        return (
          <Pressable
            key={item.value}
            onLayout={(e) => { offsets.current[item.value] = e.nativeEvent.layout.x; }}
            onPress={() => {
              if (!active) haptic('selection');
              onChange(item.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.badge ? `${item.label}, ${item.badge} waiting` : item.label}
            style={({ pressed }) => ({
              minWidth: STRIP_ITEM_MIN,
              alignItems: 'center',
              paddingHorizontal: space[1],
              paddingTop: 2,
              // A scale, not opacity: the selected chip is elevated, and opacity
              // over an elevated view is the Android grey-block flash (CardShell).
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            {/* Tinted at rest, SOLID purple when selected — only ever one is
                selected, so the filled circle answers "where am I" and is not
                noise. Round, uniform radius: safe for the Android shadow. */}
            <View
              style={{
                width: STRIP_CHIP,
                height: STRIP_CHIP,
                borderRadius: radius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? color.brand : color.brandChipBg,
                ...(active ? elevate('md') : null),
              }}
            >
              {Icon ? <Icon size={21} color={active ? color.textOnBrand : color.brandChipFg} /> : null}

              {item.badge ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -5,
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 4,
                    borderRadius: radius.full,
                    backgroundColor: color.pending.dot,
                    borderWidth: 2,
                    borderColor: color.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={[text.badge, { color: color.textOnBrand, fontSize: 9 }]}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              numberOfLines={1}
              style={[
                text.caption,
                {
                  marginTop: 6,
                  fontSize: 11.5,
                  textAlign: 'center',
                  color: active ? color.brand : color.textSecondary,
                  fontFamily: active ? font.bold : font.medium,
                },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ─── The card shell ─────────────────────────────────────────────────────────
   Every card in My Time is this: white, hairline border, the app's softest
   shadow, and a press tint. Nothing else in this file draws its own box. */

/* ── NEVER PUT `opacity` ON A PRESSABLE AROUND AN ELEVATED VIEW (2026-10-17) ──

   This used to be `style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}`
   wrapped around the elevated card below, and pressing any row — overtime,
   flags, corrections — flashed a grey rectangle behind it. That is the
   "shadowed part of breaking ui", and it is an Android compositing rule
   rather than a styling mistake:

     An opacity < 1 forces the whole subtree onto an offscreen layer so it can
     be blended once instead of per-view. An elevation shadow is drawn OUTSIDE
     the view's bounds, by the parent, from the view's outline — so once the
     card is in its own layer, its shadow is rendered into that layer's
     rectangle and blended as part of it. The soft shadow becomes a hard grey
     block the size of the layer, for exactly as long as the finger is down.

   The fix is to leave the parent alone and tint the CARD, which is also how
   `ui/Row` and every other pressable surface in the app does it. Press
   feedback is a background change here, never an opacity change.

   The card's own `borderRadius` is uniform, so `elevate('xs')` is safe on it —
   mixed radii are the other Android shadow trap (theme/tokens.js
   `elevateSheet`). */

export function CardShell({ onPress, accessibilityLabel, children, style }) {
  const body = (pressed) => (
    <View
      style={[{
        // OPAQUE, not `color.pressTint`: that one is a translucent wash meant
        // to go over the page background, and a semi-transparent fill on an
        // elevated Android view lets its own shadow show through the card.
        backgroundColor: pressed ? color.brandSoftBg : color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: pressed ? color.brandSoftBorder : color.borderSubtle,
        padding: space[3],
        ...elevate('xs'),
      }, style]}
    >
      {children}
    </View>
  );

  if (!onPress) return body(false);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/* ─── RecordCard ──────────────────────────────────────────────────────────────
   Everything that isn't a day: a correction, an overtime record, a flag, an
   earned day. A tinted icon identifies the KIND, the badge carries the state,
   the meta row carries the two or three numbers that matter, and an action —
   when there is one — sits under a divider where it can't be mis-tapped
   instead of the card itself. */

export function RecordCard({
  icon: Icon,
  tone = 'purple',
  title,
  subtitle,
  badge,
  value,
  meta = [],
  action,
  onPress,
  accessibilityLabel,
  highlight = false,
}) {
  const t = toneOf(tone);

  return (
    <CardShell
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={highlight ? { borderColor: color.pending.border, backgroundColor: color.pending.bg } : null}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.md,
            // `chip` + no hairline — see ui/IconTile.jsx. This square repeats
            // on every row of every section; at the 50 shade it was the single
            // largest patch of grey in the app.
            backgroundColor: t.chip,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {Icon ? <Icon size={19} color={t.fg} /> : null}
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Text numberOfLines={1} style={[text.bodyStrong, { flex: 1, minWidth: 0 }]}>{title}</Text>
            {value ? (
              <Text style={[text.smallStrong, { fontSize: 14, fontVariant: ['tabular-nums'] }]}>{value}</Text>
            ) : null}
          </View>
          {subtitle ? <Text numberOfLines={2} style={text.small}>{subtitle}</Text> : null}
        </View>

        {badge ? <View style={{ marginTop: 1 }}>{badge}</View> : null}
      </View>

      {meta.length || action ? (
        <View
          style={{
            marginTop: space[3],
            paddingTop: space[3],
            borderTopWidth: 1,
            borderTopColor: color.borderSubtle,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space[3],
          }}
        >
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
            {meta.map((m) => (
              <View key={m.label} style={{ minWidth: 0 }}>
                <Text style={[text.label, { fontSize: 9, color: color.textMuted }]}>{m.label}</Text>
                <Text numberOfLines={1} style={[text.smallStrong, { fontVariant: ['tabular-nums'] }]}>
                  {m.value}
                </Text>
              </View>
            ))}
          </View>
          {action}
        </View>
      ) : null}
    </CardShell>
  );
}

/* ─── StatCards ───────────────────────────────────────────────────────────────
   The header figures for the sections that have no month to step through —
   overtime, flags, earned leave. Two to four small white cards, each a tinted
   icon over a caption and a number.

   They are CARDS and not the flat `StatTiles` the punch card uses, because
   they sit on slate-50 at the top of a list of cards: a flat tile there reads
   as a hole in the list rather than as a figure above it. */

export function StatCards({ items = [] }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[2] }}>
      {items.map((item) => {
        const t = toneOf(item.tone || 'purple');
        const helpNode = React.isValidElement(item.help)
          ? item.help
          : item.help?.surface && item.help?.field
            ? <FieldHelp {...item.help} />
            : null;
        return (
          <View
            key={item.label}
            style={{
              flex: 1,
              minWidth: 0,
              backgroundColor: color.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: color.borderSubtle,
              paddingHorizontal: space[3],
              paddingVertical: items.length === 1 ? space[3] + 1 : space[3],
              gap: 2,
              ...elevate('xs'),
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text
                numberOfLines={1}
                style={[
                  text.label,
                  {
                    fontSize: items.length === 1 ? 10 : 9,
                    color: color.textMuted,
                  },
                ]}
              >
                {item.label}
              </Text>
              {helpNode}
            </View>
            <Text
              numberOfLines={1}
              style={[
                text.smallStrong,
                {
                  fontSize: items.length === 1 ? 22 : 16,
                  lineHeight: items.length === 1 ? 26 : 20,
                  color: t.fg,
                  fontVariant: ['tabular-nums'],
                },
              ]}
            >
              {item.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ─── The first load ─────────────────────────────────────────────────────────
   `ui/Skeleton` can't be used inside these lists: every one of its variants
   adds its own `gutter`, and the card list already supplies one — the two
   together inset the placeholders 32pt on a 360pt phone, which is visibly
   narrower than the cards that replace them. Card-shaped blocks, no padding,
   so the loading state is the same width as the loaded one. */

export function CardsSkeleton({ rows = 5, height = 76 }) {
  return (
    <View style={{ gap: space[3] }}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} height={height} radius={radius.lg} />
      ))}
    </View>
  );
}

/** The gap between cards, and the gutter either side. One place, five lists. */
export const cardListStyle = {
  paddingHorizontal: space[4],
  paddingTop: space[3],
  paddingBottom: space[10],
  gap: space[3],
};

export default { CategoryStrip, RecordCard, StatCards };
