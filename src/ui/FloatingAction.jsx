// ─────────────────────────────────────────────────────────────────────────────
// ui/FloatingAction.jsx — the one floating button a screen may have.
//
// User, 2026-10-21: "put the apply for leave in bottom most as floating btn
// (same goes for corrections, request a correction should be a floating btn)"
// and, on the day page, "at the bottom give a floating btn to apply for
// correction". A full-width button at the TOP of a list was the web's header
// button carried over, and the top of a phone is the one place a thumb can't
// reach (CLAUDE.md §1).
//
// ── WHERE IT SITS ─────────────────────────────────────────────────────────────
//
// Bottom right, a purple pill with a glyph and a short label — the screen's
// ONE primary action. (It used to stand above a floating "Ask Maya" pill in
// the same corner; that pill is gone — Maya is the sparkle in the top bar
// since 2026-10-21 — so this owns the corner.)
//
// `overTabBar` (default true) is for a tab root, where the screen's own
// bottom IS the tab bar's top. A pushed page with no tab bar (DayLog) passes
// false: it then clears the home indicator instead.
//
// A list under it must leave room: `contentContainerStyle` gets
// `paddingBottom: FLOATING_CLEARANCE`, or the last card hides behind it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, elevate, radius, space, text } from '../theme/tokens';
import { haptic } from './haptics';

const HEIGHT = 52;

/** Bottom padding a list needs so its last row clears the button. */
export const FLOATING_CLEARANCE = space[4] + HEIGHT + space[6];

export function FloatingAction({ title, icon: Icon, onPress, overTabBar = true, accessibilityLabel }) {
  const insets = useSafeAreaInsets();
  const bottom = overTabBar ? space[4] : Math.max(insets.bottom, space[2]) + space[4];

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: space[4], right: space[4], bottom, alignItems: 'flex-end' }}
    >
      <Pressable
        onPress={() => { haptic('light'); onPress?.(); }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        style={({ pressed }) => [{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          height: HEIGHT,
          paddingLeft: space[4],
          paddingRight: space[5],
          borderRadius: radius.full,
          backgroundColor: pressed ? color.brandPressed : color.brand,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        }, elevate('lg')]}
      >
        {Icon ? <Icon size={20} color={color.textOnBrand} /> : null}
        <Text style={[text.bodyStrong, { color: color.textOnBrand }]}>{title}</Text>
      </Pressable>
    </View>
  );
}

export default FloatingAction;
