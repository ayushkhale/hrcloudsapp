// ─────────────────────────────────────────────────────────────────────────────
// ui/Card.jsx — the app's one surface.
//
// Web ancestor: `bg-white rounded-3xl p-6 shadow-xs border border-slate-100`.
//
// Note what the web class list does NOT contain: a heavy shadow. The web app's
// elevation is `shadow-xs`, almost nothing, and the border does the separating.
// Resist making it heavier here — a native card with a real drop shadow looks
// like a different product next to the web app on the same desk.
//
// ANDROID: `elevation` renders nothing without a `backgroundColor` on the SAME
// view. theme/tokens.js `elevate()` handles the platform split; the background
// is set below, so always keep both on this view.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { color, elevate, radius, space, text } from '../theme/tokens';

/**
 * @param {object} props
 * @param {'default'|'hero'|'flat'} [props.tone] `hero` is radius xl + more lift
 * @param {boolean} [props.padded]  `false` for a card that HOLDS a list — rows
 *   supply their own 16px gutter, and padding here double-insets them
 */
export function Card({ children, tone = 'default', padded = true, style, ...rest }) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: color.surface,
          borderRadius: tone === 'hero' ? radius.xl : radius.lg,
          borderWidth: 1,
          borderColor: color.borderSubtle,
          overflow: 'hidden',
        },
        tone !== 'flat' && elevate(tone === 'hero' ? 'md' : 'sm'),
        padded && { padding: space[4] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A card's own heading row — the 11px uppercase label plus optional right-hand
 * content (a MonthStepper, a "See all" link, an ⓘ).
 *
 * EVERY CALLER PASSES A BARE STRING — `<CardHeader>Recent days</CardHeader>` —
 * because that is the obvious thing to write. A string child dropped straight
 * into a <View> is the "Text strings must be rendered within a <Text>
 * component" red screen, so the wrap happens HERE rather than being a rule
 * every call site has to remember. A ready-made element still passes through
 * untouched, which is what lets a header carry a Pill or an icon row.
 *
 * `variant="title"` is the bigger 18px heading the Home sections use
 * ("Upcoming", "Announcements"); the default stays the 11px uppercase label.
 */
export function CardHeader({ children, right, variant = 'label', style }) {
  const bare = typeof children === 'string' || typeof children === 'number';
  const titleStyle = variant === 'title' ? text.h2 : text.label;

  return (
    <View
      style={[{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[2],
        marginBottom: space[3],
      }, style]}
    >
      {bare ? <Text style={titleStyle}>{children}</Text> : children}
      {right}
    </View>
  );
}

export default Card;
