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
//   CategoryStrip  the sections of a tab, as icon tiles rather than text tabs
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
import { Pressable, Text, View } from 'react-native';
import { color, elevate, font, radius, space, text, toneOf } from '../theme/tokens';
import { FieldHelp } from './FieldHelp';
import { SkeletonBlock } from './Skeleton';
import { haptic } from './haptics';

/* ─── CategoryStrip ───────────────────────────────────────────────────────────
   The sections of My Time, as icon tiles — the web's MY TIME menu, which has
   eight entries, laid out for a thumb.

   ── EVERY SECTION, ALWAYS, NO "MORE" (2026-10-18) ──────────────────────────

   It was a `ui/TabStrip` of words first: "Attendance · Corrections · Overtime
   · Flags · Earned Leave" is about 420pt of label, so on a 360pt phone the
   last two sections sat off-screen with nothing to say they existed.

   Then it was a horizontal scroller of icon cards, which was worse in the one
   way that matters: the overflow was still invisible.

   Then it was three tiles and a `More` tile, which is the same failure wearing
   a button. Pressing `More` REPLACED the first three with the last five, so no
   arrangement of the screen ever showed a person all eight sections — and the
   tile they had just been looking at vanished to make room. A disclosure that
   hides what it reveals from is not a disclosure.

   So all eight are drawn at once, four to a row, two rows. Every section is on
   screen the moment My Time opens, nothing hides past an edge or behind a
   press, and each tile is a quarter of the width — about 80pt on a normal
   phone, comfortably over the 44pt minimum. The rows are deliberately tight:
   two rows of tiles sit above the list, and every point they take is a point
   of records somebody does not see.

   A `badge` is the count of things WAITING ON SOMEBODY — a pending request,
   an open flag. It is the only number here, so it means one thing. */

/* ── PACKED TILES (2026-10-20) ────────────────────────────────────────────
   User, on My Tasks: "why so much space between action buttons". Each
   section was a bare 44pt chip centred in a 25%-wide slot, so a 360pt phone
   showed four chips with ~45pt of nothing between each pair. They are now
   compact WHITE TILES — chip and label inside — packed four across with an
   8pt gap, the reference quick-action cards. Same four-per-row rule, same
   nothing-hidden rule; just no empty canyons. The width is measured, because
   percentages plus a fixed gap overflow the row by a few points. */
const STRIP_GAP = 8;
const STRIP_COLS = 4;

export function CategoryStrip({ items, value, onChange }) {
  const [rowWidth, setRowWidth] = React.useState(0);
  const tileWidth = rowWidth
    ? Math.floor((rowWidth - STRIP_GAP * (STRIP_COLS - 1)) / STRIP_COLS)
    : undefined;
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width - space[4] * 2)}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: space[4],
        paddingTop: space[1],
        paddingBottom: space[3],
        gap: STRIP_GAP,
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;

        return (
          <Pressable
            key={item.value}
            onPress={() => {
              if (!active) haptic('selection');
              onChange(item.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.badge ? `${item.label}, ${item.badge} waiting` : item.label}
            style={({ pressed }) => ({
              width: tileWidth || '23%',
              alignItems: 'center',
              gap: 6,
              paddingTop: space[3],
              paddingBottom: space[2] + 2,
              paddingHorizontal: 2,
              borderRadius: radius.lg,
              backgroundColor: active ? color.brandChipBg : color.surface,
              borderWidth: 1,
              borderColor: active ? color.brandSoftBorder : color.borderSubtle,
              // A scale, not opacity: the selected chip is elevated, and opacity
              // over an elevated view is the Android grey-block flash (CardShell).
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            {/* ── THE CHIP IS PURPLE AT REST (2026-10-18) ─────────────────
                This was a white square with a slate hairline and a grey
                glyph, and the selected one was purple-50 — a tint you cannot
                see across a room. Eight grey squares in a row is the single
                biggest reason the app read as bland.

                Now: purple-100 behind a purple-600 glyph at rest, SOLID
                purple with a white glyph when selected. The selected state is
                a fill rather than a tint because only ever one is selected,
                so the filled square is an answer to "where am I", not noise.
                No border at all — the fill does that job, and a hairline
                around a tinted chip only muddies it. */}
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? color.brand : color.brandChipBg,
                // The selected chip lifts a little (uniform radius, so the
                // Android outline shadow is safe — tokens.js `elevateSheet`).
                ...(active ? elevate('md') : null),
              }}
            >
              {Icon ? <Icon size={20} color={active ? color.textOnBrand : color.brandChipFg} /> : null}

              {item.badge ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: 17,
                    height: 17,
                    paddingHorizontal: 4,
                    borderRadius: radius.full,
                    backgroundColor: color.pending.dot,
                    borderWidth: 2,
                    borderColor: color.surface,
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
                  fontSize: 10.5,
                  textAlign: 'center',
                  color: active ? color.brandSoftFg : color.textSecondary,
                  fontFamily: active ? font.bold : font.medium,
                },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
