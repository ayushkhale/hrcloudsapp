// ─────────────────────────────────────────────────────────────────────────────
// ui/EmptyState.jsx — nothing here, and what to do about it.
//
// TWO RULES, both from the web app (CLAUDE.md §6: "empty states say what to do
// next"):
//
//   1. IT SAYS WHAT TO DO NEXT. "No earned leave yet" alone leaves the person
//      wondering whether it's broken. The message explains how days get here.
//
//   2. "NONE YET" AND "NONE MATCH THIS FILTER" ARE DIFFERENT STATES, worded
//      differently, and the second one offers a way to clear the filter.
//      Showing "You haven't applied for any leave" to somebody who has simply
//      filtered to Rejected is the bug this prop pair exists to prevent.
//
// ── THE LOOK (2026-10-20) ────────────────────────────────────────────────────
//
// A pale purple-50 dot with a glyph read as a missing image. The glyph now
// sits in a soft gradient medallion inside a faint halo — the same surface as
// ui/HeroCard — with a real heading under it, so an empty list reads as a
// designed, calm state rather than as something that failed to load.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { color, iconSize, radius, space, text } from '../theme/tokens';
import { icons } from '../theme/icons';
import { Button } from './Button';

/**
 * @param {object} props
 * @param {React.ReactNode} [props.action]  a rendered control
 * @param {boolean} [props.filtered]  true when a filter is narrowing the list
 * @param {Function} [props.onClearFilter]  A CALLBACK, not a node. This file
 *   used to render it straight into a <View>, which React answers with
 *   "Functions are not valid as a React child" on every filtered empty list —
 *   it was firing on the Time tab for Corrections, Leave, Flags and Earned
 *   Leave, all four of which pass a callback because the prop name says to.
 *   It draws its own button now.
 */
export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  filtered = false,
  onClearFilter,
  style,
}) {
  const Glyph = Icon || (filtered ? icons.search : icons.info);

  return (
    <View
      style={[{
        alignItems: 'center',
        paddingVertical: space[10],
        paddingHorizontal: space[6],
        gap: space[2],
      }, style]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 92,
          height: 92,
          borderRadius: radius.full,
          backgroundColor: color.brandSoftBg,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space[2],
        }}
      >
        <LinearGradient
          colors={[color.heroSoftFrom, color.heroSoftTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 68,
            height: 68,
            borderRadius: 34,
            borderWidth: 1,
            borderColor: color.heroSoftBorder,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {Glyph ? <Glyph size={iconSize.lg + 4} color={color.brand} /> : null}
        </LinearGradient>
      </View>

      <Text style={[text.h2, { fontSize: 17, lineHeight: 23, textAlign: 'center', color: color.ink }]}>{title}</Text>
      {message ? (
        <Text style={[text.small, { textAlign: 'center', maxWidth: 300, lineHeight: 19 }]}>{message}</Text>
      ) : null}
      {action ? <View style={{ marginTop: space[3] }}>{action}</View> : null}
      {filtered && typeof onClearFilter === 'function' && !action ? (
        <View style={{ marginTop: space[3] }}>
          <Button title="Show all" variant="outline" size="sm" onPress={onClearFilter} />
        </View>
      ) : null}
    </View>
  );
}

export default EmptyState;
