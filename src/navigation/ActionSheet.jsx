// ─────────────────────────────────────────────────────────────────────────────
// navigation/ActionSheet.jsx — Quick Actions Slider / Bottom Sheet.
//
// Opened by the center floating action button in the bottom tab bar.
// Displays the person's six quick actions (Settings › Quick actions — a slot
// can be replaced there, nothing else)
// with smooth drag-to-dismiss SheetShell ergonomics.
//
// ── THE LOOK IS DELIBERATE — KEEP IT (user, 2026-10-18) ─────────────────────
//
// Bordered cards, a tinted icon box with its own colour per action, label and
// caption. A purple-only redesign was tried and reverted at the user's
// request: "it was looking so good". The per-action tones live in TONES below,
// keyed by catalog key, so a new catalog entry picks one up by position.
//
// ── IT NAVIGATES THROUGH navigationRef, NOT useNavigation ───────────────────
//
// This sheet is rendered beside <Tab.Navigator> in AppTabs, so
// `useNavigation()` here would be the ROOT stack's — which has no 'TimeTab' —
// and every tile threw "The action 'NAVIGATE' … was not handled by any
// navigator". `runQuickAction` (features/settings/quickActions.js) goes
// through navigationRef instead.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetShell } from '../ui/SheetShell';
import { color, font, gutter, iconSize, radius, space, text } from '../theme/tokens';
import { icons } from '../theme/icons';
import { runQuickAction, useQuickActions } from '../features/settings/quickActions';

/* The original six tones, by the action that wore each one. Anything else in
   the catalog borrows one by its position, so every card still has a colour. */
const PALETTE = [
  { bg: '#f5f3ff', fg: '#7c3aed', border: '#ddd6fe' },
  { bg: '#eef2ff', fg: '#4f46e5', border: '#c7d2fe' },
  { bg: '#ecfdf5', fg: '#059669', border: '#a7f3d0' },
  { bg: '#f0f9ff', fg: '#0284c7', border: '#bae6fd' },
  { bg: '#faf5ff', fg: '#9333ea', border: '#e9d5ff' },
  { bg: '#fffbeb', fg: '#d97706', border: '#fde68a' },
];
const TONES = {
  applyLeave: PALETTE[0],
  correction: PALETTE[1],
  claim: PALETTE[2],
  uploadDocument: PALETTE[3],
  declaration: PALETTE[4],
  bank: PALETTE[5],
};
export const toneFor = (key, i) => TONES[key] || PALETTE[i % PALETTE.length];

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingTop: space[2],
    paddingBottom: space[3],
    borderBottomWidth: 1,
    borderBottomColor: color.borderSubtle,
  },
  titleGroup: {
    flex: 1,
    gap: 2,
  },
  closeBtn: {
    padding: space[2],
    borderRadius: radius.full,
    backgroundColor: color.surfaceSubtle,
  },
  grid: {
    paddingHorizontal: gutter,
    paddingTop: space[3],
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  actionCard: {
    flexBasis: '48.5%',
    flexGrow: 1,
    padding: space[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    backgroundColor: color.surface,
    gap: space[2],
  },
  cardPressed: {
    backgroundColor: color.surfaceSubtle,
    borderColor: color.border,
    transform: [{ scale: 0.98 }],
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontFamily: font.bold,
    fontSize: 13,
    color: color.textPrimary,
  },
  cardCaption: {
    ...text.caption,
    color: color.textMuted,
    fontSize: 11,
    lineHeight: 14,
  },
});

/* ─── One action card ─────────────────────────────────────────────────────────
   The ✚ sheet's card, exported so Settings › Quick actions picks from the SAME
   cards it is filling (user, 2026-10-22: "the replacement UI needs to be like
   action buttons"). Its look is this sheet's and stays this sheet's (CLAUDE.md
   §5 exception). `selected` and `badge` are for the picker only: the action
   already in the slot being replaced, and the slot number of one that sits
   elsewhere (picking it swaps the two). */
export function ActionCard({ item, tone, onPress, accessibilityLabel, selected = false, badge = null, style }) {
  const Icon = item.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || item.label}
      accessibilityState={selected ? { selected: true } : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        selected ? { borderColor: color.brand, backgroundColor: color.brandSoftBg } : null,
        pressed ? styles.cardPressed : null,
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={[styles.iconBox, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          {Icon ? <Icon size={20} color={tone.fg} /> : null}
        </View>
        {badge != null ? (
          <View
            style={{
              minWidth: 20, height: 20, borderRadius: radius.full, paddingHorizontal: 5,
              alignItems: 'center', justifyContent: 'center', backgroundColor: color.brand,
            }}
          >
            <Text style={[text.badge, { color: color.textOnBrand, fontSize: 10 }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <Text numberOfLines={1} style={styles.cardLabel}>{item.label}</Text>
        <Text numberOfLines={2} style={styles.cardCaption}>{item.caption}</Text>
      </View>
    </Pressable>
  );
}

export function ActionSheet({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { actions, workspace } = useQuickActions();
  const CloseIcon = icons.close;

  // Close first, then move: navigating under a sheet still on screen leaves
  // it floating over the new page for a frame.
  const after = (close, fn) => {
    close();
    setTimeout(fn, 150);
  };

  return (
    <SheetShell visible={visible} onClose={onClose} snap="62%" background={color.surface}>
      {({ close }) => (
        <View style={{ flex: 1, paddingBottom: insets.bottom + space[3] }}>
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <Text accessibilityRole="header" style={text.h3}>Quick Actions</Text>
              <Text style={[text.caption, { color: color.textMuted }]}>Choose an action to get started</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={close}
              hitSlop={8}
              style={styles.closeBtn}
            >
              {CloseIcon ? <CloseIcon size={iconSize.sm} color={color.textSecondary} /> : null}
            </Pressable>
          </View>

          <View style={styles.grid}>
            {actions.map((item, i) => (
              <ActionCard
                key={item.key}
                item={item}
                tone={toneFor(item.key, i)}
                onPress={() => after(close, () => runQuickAction(item, workspace))}
              />
            ))}
          </View>
        </View>
      )}
    </SheetShell>
  );
}

export default ActionSheet;
