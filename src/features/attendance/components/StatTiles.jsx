// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/StatTiles.jsx — the shape every attendance
// fact takes.
//
// A soft slate tile: a tiny uppercase label with an optional icon, and one
// number under it. That's it.
//
// ── WHY IT IS ITS OWN FILE ───────────────────────────────────────────────────
//
// It was born inside PunchCard when Home was flattened (2026-10-17): the punch
// card stopped being a purple hero and the four facts on it stopped being
// sentences ("Clocked in at 01:31 am.") and became tiles, because a label over
// a number is SEEN while a sentence has to be READ.
//
// The Time screen needs exactly the same thing above each of its five lists —
// Present · Unpaid days · Late · Worked, and the equivalents on the other tabs.
// Two copies of a tile diverge within a month (the web had eight status badges
// for the same reason), so there is one, here, and PunchCard imports it.
//
// ── IT IS NOT ui/SheetParts.jsx's SheetStats ─────────────────────────────────
//
// SheetStats is the white, bordered, 20px-metric block for the inside of a
// record SHEET, where it sits on `color.bg` and needs an edge to be a thing.
// These tiles sit on a WHITE SCREEN with no cards, where a border would be the
// fourth frame on a page that just lost three (HomeScreen's header). Same idea,
// two surfaces, deliberately two components.
//
// ── NEVER A DASH, NEVER A UNIT CAPTION ───────────────────────────────────────
//
// The caller formats the value — fmtMinutes carries "h"/"m", formatDayCount
// carries "days". A tile adds nothing to it, which is what stops
// "2d and 1/2 d days" (CLAUDE.md §6).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { color, palette, radius, space, text } from '../../../theme/tokens';
import { FieldHelp } from '../../../ui';

/**
 * One tile. Always inside a `StatRow` — on its own it stretches to the width
 * of the screen and stops reading as a tile.
 *
 * @param {object} props
 * @param {Function} [props.icon]   a component from theme/icons.js
 * @param {string} props.label      two words at most; it is 10px and one line
 * @param {any} props.value         ALREADY FORMATTED — see the header
 * @param {boolean} [props.accent]  purple, for the one figure worth noticing
 * @param {{surface: string, field: string}} [props.help]  an ⓘ beside the
 *   label, for a figure that is OURS and DERIVED. Not for a routine count —
 *   §10's never list rules those out, and four ⓘ in one row is wallpaper.
 */
export function Stat({ icon: Icon, label, value, accent = false, help }) {
  return (
    <View
      style={{
        flex: 1,
        // Without this a long value stretches the tile past its share of the
        // row instead of ellipsing inside it.
        minWidth: 0,
        backgroundColor: color.surfaceSubtle,
        borderRadius: radius.md,
        paddingHorizontal: space[3],
        paddingVertical: space[2] + 2,
        gap: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {Icon ? <Icon size={12} color={palette.purple[400]} /> : null}
        <Text numberOfLines={1} style={[text.label, { fontSize: 10, color: color.textMuted, flexShrink: 1 }]}>
          {label}
        </Text>
        {React.isValidElement(help) ? help : (help?.surface && help?.field ? <FieldHelp {...help} /> : null)}
      </View>
      <Text
        numberOfLines={1}
        style={[text.smallStrong, {
          fontSize: 15,
          fontVariant: ['tabular-nums'],
          color: accent ? palette.purple[700] : color.textPrimary,
        }]}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * A row of tiles. TWO ACROSS, which is why `items` is chunked rather than
 * wrapped: four tiles in one wrapping row leave the last one on a line of its
 * own at full width, which reads as a different, more important fact.
 *
 * @param {object} props
 * @param {Array<{icon?: Function, label: string, value: any, accent?: boolean}>} props.items
 * @param {number} [props.cols]
 */
export function StatRow({ items = [], cols = 2, style }) {
  const rows = [];
  const shown = items.filter(Boolean);
  for (let i = 0; i < shown.length; i += cols) rows.push(shown.slice(i, i + cols));

  return (
    <View style={[{ gap: space[2] }, style]}>
      {rows.map((group, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space[2] }}>
          {group.map((item) => <Stat key={item.label} {...item} />)}
          {/* A half-empty last row keeps its tiles at HALF width — a lone
              full-width tile looks like a headline rather than a fourth fact. */}
          {group.length < cols
            ? Array.from({ length: cols - group.length }, (_, k) => <View key={`pad${k}`} style={{ flex: 1 }} />)
            : null}
        </View>
      ))}
    </View>
  );
}

export default StatRow;
