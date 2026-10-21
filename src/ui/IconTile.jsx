// ─────────────────────────────────────────────────────────────────────────────
// ui/IconTile.jsx — the rounded icon square that leads a row or a tile.
//
// It appeared four times in two days (quick actions, the upcoming list, a
// notification row, an announcement card), each copy picking its own size,
// radius and background. That is exactly how the web app ended up with eight
// status badges, so it is one component here before it becomes four.
//
// ── IT IS DECORATION, AND IT SAYS SO ─────────────────────────────────────────
//
// The glyph always repeats something the row already states in words — the
// calendar beside "Public holiday", the rupee beside "Payslip available". So
// it is hidden from screen readers: announcing "image, calendar" before every
// row is noise, and the row's own text is the label.
//
// ── TONE, NOT COLOUR ─────────────────────────────────────────────────────────
//
// Pass a tone KEY from theme/tokens.js (`purple`, `indigo`, `emerald`, …),
// never a hex. The keys render purple — see the tone table's header — so a
// screen cannot quietly introduce a green by asking for `emerald`.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View } from 'react-native';
import { radius, toneOf } from '../theme/tokens';

const SIZES = {
  sm: { box: 36, glyph: 18, r: radius.md },
  md: { box: 44, glyph: 20, r: radius.md },
  lg: { box: 56, glyph: 26, r: radius.lg },
};

/**
 * @param {object} props
 * @param {Function} props.icon  a component from theme/icons.js
 * @param {string} [props.tone]  a tone KEY — purple, indigo, emerald, amber, rose, slate
 * @param {'sm'|'md'|'lg'} [props.size]
 * @param {boolean} [props.solid]  filled with the tone's dot colour, glyph white
 */
export function IconTile({ icon: Icon, tone = 'purple', size = 'md', solid = false, style }) {
  const t = toneOf(tone);
  const s = SIZES[size] || SIZES.md;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{
        width: s.box,
        height: s.box,
        borderRadius: s.r,
        alignItems: 'center',
        justifyContent: 'center',
        /* `chip`, not `bg` (2026-10-18). `bg` is the 50 shade — right behind
           10px badge text, invisible behind a 20px glyph on a white card, and
           the reason a screen full of these read as grey squares. No border
           either: a hairline around a tint reads as a box, and what this is
           meant to be is a splash of colour. */
        backgroundColor: solid ? t.dot : t.chip,
      }, style]}
    >
      {Icon ? <Icon size={s.glyph} color={solid ? '#ffffff' : t.fg} /> : null}
    </View>
  );
}

export default IconTile;
