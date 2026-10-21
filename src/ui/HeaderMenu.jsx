// ─────────────────────────────────────────────────────────────────────────────
// ui/HeaderMenu.jsx — the ⋮ in a native header, and the sheet of actions it
// opens.
//
// ── WHY ACTIONS LEFT THE SCREEN (2026-10-17) ────────────────────────────────
//
// Notifications had a "Mark all read" button floating above the filter tabs,
// which only appeared when something was unread. Two problems, and they are
// the general case rather than one screen's bug:
//
//   1. A control that comes and goes moves everything under it. The filter
//      tabs sat 36pt lower whenever an unread notification existed, so the
//      thing people actually tap jumped between visits.
//   2. It is a screen-level action sitting in the content. Everything else in
//      that list is one notification; a button about ALL of them, in the same
//      column, reads as if it belongs to the first row.
//
// Screen-level actions belong in the header, and a phone header has room for
// one icon, so they go behind the ⋮ that every Android and iOS user already
// knows. The screen's body is then nothing but its content.
//
// ── IT IS A SHEET, NOT A POPOVER ────────────────────────────────────────────
//
// An anchored dropdown in the top-right corner is the web answer. It is the
// hardest place on a phone for a thumb to reach, it needs measuring against
// the window to avoid being clipped, and it has no obvious dismiss target.
// `OptionSheet` is already the house picker, already caps at 75% so the
// backdrop is tappable, and comes up under the thumb. One pattern, not two.
//
// ── USE ─────────────────────────────────────────────────────────────────────
//
//   useHeaderMenu(navigation, [
//     { key: 'read', label: 'Mark all as read', icon: icons.check, onPress: onMarkAll },
//     { key: 'refresh', label: 'Refresh', icon: icons.refresh, onPress: onRefresh },
//   ]);
//
// A falsy entry is dropped, so an action that doesn't apply right now is
// `cond && { … }` rather than a branch. An item with `disabled: true` stays
// VISIBLE and greyed — the menu is also how somebody discovers what a screen
// can do, and an action that vanishes teaches them nothing (§2 is about
// capabilities the product lacks, not ones that are momentarily unavailable).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, gutter, iconSize, radius, space, text } from '../theme/tokens';
import { icons } from '../theme/icons';
import { OptionSheet } from './Select';

/** One row of the menu. */
function MenuRow({ item, onPick }) {
  const Icon = item.icon;
  // `color.danger` is a TONE ({bg, fg, border, dot}), not a colour — using it
  // as one paints nothing and swallows the warning.
  const danger = !!item.destructive;
  const label = danger ? color.danger.fg : color.textPrimary;
  const tileBg = danger ? color.danger.bg : color.bg;
  const glyph = danger ? color.danger.fg : color.textSecondary;

  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ disabled: !!item.disabled }}
      disabled={!!item.disabled}
      onPress={() => onPick(item)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: 52,
        paddingHorizontal: gutter,
        opacity: item.disabled ? 0.45 : 1,
        backgroundColor: pressed ? color.pressTint : 'transparent',
      })}
    >
      {Icon ? (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tileBg,
          }}
        >
          <Icon size={iconSize.md} color={glyph} />
        </View>
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[text.body, { color: label }]}>{item.label}</Text>
        {item.caption ? <Text style={text.caption}>{item.caption}</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * The ⋮ button plus its sheet. Render it yourself only if you are not using a
 * native header; otherwise call `useHeaderMenu`.
 */
export function HeaderMenu({ items = [], title = 'Options' }) {
  const [open, setOpen] = useState(false);
  const Dots = icons.menu;

  const rows = useMemo(() => items.filter(Boolean), [items]);

  const pick = useCallback((item) => {
    // Close FIRST, then act. An action that navigates or opens another sheet
    // would otherwise race this one's dismiss animation, and on Android the
    // second window can land under the one still going down.
    setOpen(false);
    requestAnimationFrame(() => item.onPress?.());
  }, []);

  if (rows.length === 0) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="More options"
        hitSlop={12}
        style={({ pressed }) => ({
          padding: space[2],
          marginRight: space[1],
          borderRadius: radius.full,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        {Dots ? <Dots size={iconSize.lg} color={color.textPrimary} /> : null}
      </Pressable>

      <OptionSheet
        visible={open}
        title={title}
        onClose={() => setOpen(false)}
        data={rows}
        keyOf={(item, i) => String(item.key ?? i)}
        renderRow={(item) => <MenuRow item={item} onPick={pick} />}
        emptyMessage="Nothing to do here yet."
      />
    </>
  );
}

/**
 * Put a ⋮ in the native header.
 *
 * `useLayoutEffect` rather than `useEffect`, as React Navigation's own docs
 * say: an effect sets the button after the first paint, so the header
 * visibly gains an icon a frame late every time the screen opens.
 *
 * @param {object} navigation
 * @param {Array} items   falsy entries are dropped
 * @param {string} [title]
 */
export function useHeaderMenu(navigation, items, title) {
  // The array is rebuilt every render by every caller, so depend on the
  // CONTENT — otherwise setOptions runs on each render and the header
  // re-mounts the button mid-press.
  const signature = (items || [])
    .filter(Boolean)
    .map((i) => `${i.key}:${i.disabled ? 0 : 1}`)
    .join('|');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <HeaderMenu items={items} title={title} />,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, signature, title]);
}

export default HeaderMenu;
