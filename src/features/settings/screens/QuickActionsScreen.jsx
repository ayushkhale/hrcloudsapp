// ─────────────────────────────────────────────────────────────────────────────
// features/settings/screens/QuickActionsScreen.jsx — Settings › Quick actions.
//
// Moved out of SettingsScreen (2026-10-20) when Settings became a hub of
// grouped rows: quick actions is one setting among several now, and a setting
// that is a whole screen is reached from a row, not pinned to the top of the
// hub. A pushed stack screen with a native back to Settings.
//
// ── SIX SLOTS, REPLACE ONLY (user, 2026-10-18) ──────────────────────────────
//
// The six slots are drawn as the ✚ sheet draws them; a tap opens the list of
// everything that could go there, and picking one puts it in that slot. No add,
// no remove, no reorder. An action already in another slot swaps places, so
// there are always six different ones. Every pick saves at once; "Back to the
// original six" undoes everything.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { color, font, gutter, iconSize, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { LinkButton, OptionSheet, SkeletonBlock, showToast } from '../../../ui';
import { toneFor } from '../../../navigation/ActionSheet';
import {
  DEFAULT_QUICK_ACTIONS, availableActions, quickActionFor, replaceSlot, saveQuickActions,
  useQuickActions,
} from '../quickActions';

const GRID_COLS = 4;
const GRID_ROW = 96; // a tile: chip, two lines of label, padding and the row gap

export default function QuickActionsScreen() {
  const { ready, keys, userId, workspace } = useQuickActions();
  const [slot, setSlot] = useState(null); // index being replaced, or null
  const [busy, setBusy] = useState(false);

  const catalog = useMemo(() => availableActions(workspace), [workspace]);
  // The catalog's own groups, in catalog order: "Start something", "Go to".
  const groups = useMemo(() => {
    const out = [];
    catalog.forEach((a) => {
      const last = out[out.length - 1];
      if (last && last.group === a.group) last.items.push(a);
      else out.push({ group: a.group, items: [a] });
    });
    return out;
  }, [catalog]);
  // OptionSheet sizes itself from a per-row height; a "row" here is a group.
  const groupHeight = useMemo(() => {
    const rows = groups.reduce((n, g) => n + Math.ceil(g.items.length / GRID_COLS), 0);
    return groups.length ? Math.ceil((groups.length * 40 + rows * GRID_ROW) / groups.length) : GRID_ROW;
  }, [groups]);
  const isDefault = keys.join('|') === DEFAULT_QUICK_ACTIONS.join('|');

  const save = useCallback(async (next) => {
    if (busy) return;
    setBusy(true);
    try {
      await saveQuickActions(userId, next);
    } catch (err) {
      showToast(err?.message || 'Couldn’t save your quick actions.', 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, userId]);

  const pick = (key) => {
    const index = slot;
    setSlot(null);
    if (index == null || keys[index] === key) return;
    save(replaceSlot(keys, index, key));
  };

  const Swap = icons.switch || icons.edit;
  const current = slot != null ? quickActionFor(keys[slot]) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: gutter, gap: space[3], paddingBottom: space[10] }}
    >
      <View style={{ gap: 2, paddingHorizontal: space[1] }}>
        <Text style={text.small}>
          The six actions behind the ✚ button. Tap one to replace it with something you use more.
        </Text>
      </View>

      {!ready ? (
        <SkeletonBlock height={240} radius={radius.lg} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {keys.map((k, i) => {
            const a = quickActionFor(k);
            if (!a) return null;
            const Icon = a.icon;
            const tone = toneFor(k, i);
            return (
              <Pressable
                key={`${i}-${k}`}
                accessibilityRole="button"
                accessibilityLabel={`Slot ${i + 1}: ${a.label}. Replace it.`}
                disabled={busy}
                onPress={() => setSlot(i)}
                style={({ pressed }) => ({
                  flexBasis: '48.5%',
                  flexGrow: 1,
                  padding: space[3],
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: pressed ? color.border : color.borderSubtle,
                  backgroundColor: pressed ? color.surfaceSubtle : color.surface,
                  gap: space[2],
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View
                    style={{
                      width: 40, height: 40, borderRadius: radius.md, borderWidth: 1,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: tone.bg, borderColor: tone.border,
                    }}
                  >
                    {Icon ? <Icon size={20} color={tone.fg} /> : null}
                  </View>
                  {Swap ? <Swap size={iconSize.sm} color={color.textMuted} /> : null}
                </View>
                <View style={{ gap: 2 }}>
                  <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 13, color: color.textPrimary }}>
                    {a.label}
                  </Text>
                  <Text numberOfLines={2} style={[text.caption, { color: color.textMuted, fontSize: 11, lineHeight: 14 }]}>
                    {a.caption}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {ready && !isDefault ? (
        <LinkButton title="Back to the original six" onPress={() => save([...DEFAULT_QUICK_ACTIONS])} />
      ) : null}

      {/* A GRID, NOT A LIST (2026-10-21). Sixteen 60pt rows in a 75% sheet
          put My Tasks and everything after it below the fold, and people
          reported them as missing. Four to a row, every action is on screen
          at once — the CategoryStrip rule (CLAUDE.md §1). */}
      <OptionSheet
        visible={slot != null}
        title={current ? `Replace ${current.label}` : 'Replace'}
        onClose={() => setSlot(null)}
        data={groups}
        keyOf={(g) => g.group}
        rowHeight={groupHeight}
        renderRow={(g) => (
          <View style={{ paddingHorizontal: gutter, paddingTop: space[3], gap: space[2] }}>
            <Text style={[text.label, { color: color.textMuted }]}>{g.group}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space[2] }}>
              {g.items.map((a) => {
                const Icon = a.icon;
                const where = keys.indexOf(a.key);
                const here = where === slot;
                const elsewhere = where >= 0 && !here;
                return (
                  <Pressable
                    key={a.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: here }}
                    accessibilityLabel={elsewhere
                      ? `${a.label}. In slot ${where + 1} — they’ll swap.`
                      : a.label}
                    onPress={() => pick(a.key)}
                    style={({ pressed }) => ({
                      width: '25%',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: space[2],
                      borderRadius: radius.lg,
                      backgroundColor: here ? color.brandChipBg : pressed ? color.pressTint : 'transparent',
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    })}
                  >
                    <View
                      style={{
                        width: 44, height: 44, borderRadius: radius.md, alignItems: 'center',
                        justifyContent: 'center', backgroundColor: here ? color.brand : color.brandChipBg,
                      }}
                    >
                      {Icon ? <Icon size={20} color={here ? color.textOnBrand : color.brandChipFg} /> : null}
                      {/* Already on the ✚ sheet: which slot, so the swap is no surprise. */}
                      {elsewhere ? (
                        <View
                          style={{
                            position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18,
                            borderRadius: 9, paddingHorizontal: 4, alignItems: 'center',
                            justifyContent: 'center', backgroundColor: color.brand,
                          }}
                        >
                          <Text style={[text.badge, { color: color.textOnBrand, fontSize: 10 }]}>{where + 1}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      numberOfLines={2}
                      style={[text.caption, {
                        fontSize: 11, lineHeight: 14, textAlign: 'center',
                        color: here ? color.brand : color.textPrimary,
                      }]}
                    >
                      {a.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      />
    </ScrollView>
  );
}

export { QuickActionsScreen };
