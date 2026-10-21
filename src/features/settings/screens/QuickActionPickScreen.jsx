// ─────────────────────────────────────────────────────────────────────────────
// features/settings/screens/QuickActionPickScreen.jsx — "Change shortcut".
//
// Pushed from Settings › Quick actions with `{ slot }` — which of the six is
// being changed. It was a bottom sheet holding ~40 cards in six groups; a 75%
// sheet with that much in it was a window to scroll inside a window, and the
// user called it out with the other overfull sheets (2026-10-22: "change the
// quick actions edit selection screen to a stack screen, it has the same
// scrolling issue"). A page scrolls like a page.
//
// The rule is quickActions.js's: always six, change one at a time, and
// picking one that is already a shortcut swaps the two. A pick saves at once,
// says what happened in a toast, and goes back.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { color, gutter, space, text } from '../../../theme/tokens';
import { SkeletonBlock, showToast } from '../../../ui';
import { ActionCard, toneFor } from '../../../navigation/ActionSheet';
import {
  availableActions, quickActionFor, replaceSlot, saveQuickActions, useQuickActions,
} from '../quickActions';

export default function QuickActionPickScreen({ route, navigation }) {
  const slot = Number(route?.params?.slot);
  const { ready, keys, userId, workspace } = useQuickActions();
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const out = [];
    availableActions(workspace).forEach((a) => {
      const last = out[out.length - 1];
      if (last && last.group === a.group) last.items.push(a);
      else out.push({ group: a.group, items: [a] });
    });
    return out;
  }, [workspace]);

  const current = Number.isInteger(slot) ? quickActionFor(keys[slot]) : null;

  const pick = async (key) => {
    if (busy || !Number.isInteger(slot)) return;
    if (keys[slot] === key) { navigation.goBack(); return; }
    const now = quickActionFor(key);
    const swapped = keys.includes(key);
    setBusy(true);
    try {
      await saveQuickActions(userId, replaceSlot(keys, slot, key));
      showToast(
        swapped
          ? `${now?.label} and ${current?.label} swapped places.`
          : `${now?.label} is now a shortcut, instead of ${current?.label}.`,
        'success',
      );
      navigation.goBack();
    } catch (err) {
      showToast(err?.message || 'We couldn’t save your shortcuts.', 'error');
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: gutter, gap: space[5], paddingBottom: space[10] }}
    >
      <View style={{ gap: space[1] }}>
        <Text style={[text.h2, { color: color.ink }]}>
          {current ? `Change “${current.label}”` : 'Change shortcut'}
        </Text>
        <Text style={[text.small, { color: color.textSecondary }]}>
          Pick what goes in its place. Picking one that’s already a shortcut swaps the two.
        </Text>
      </View>

      {!ready ? (
        <SkeletonBlock height={320} />
      ) : groups.map((g) => (
        <View key={g.group} style={{ gap: space[2] }}>
          <Text style={[text.label, { color: color.textMuted }]}>{g.group}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {g.items.map((a, i) => {
              const where = keys.indexOf(a.key);
              const here = where === slot;
              const elsewhere = where >= 0 && !here;
              return (
                <ActionCard
                  key={a.key}
                  item={a}
                  tone={toneFor(a.key, i)}
                  selected={here}
                  badge={here ? 'Current' : elsewhere ? 'Shortcut' : null}
                  accessibilityLabel={here
                    ? `${a.label}. This is the shortcut you’re changing.`
                    : elsewhere
                      ? `${a.label}. Already a shortcut — picking it swaps the two.`
                      : a.label}
                  onPress={() => pick(a.key)}
                  // Fixed half width: a lone last card must not stretch across
                  // the row the way the ✚ sheet's grid lets it.
                  style={{ flexGrow: 0, flexBasis: '48.5%' }}
                />
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

export { QuickActionPickScreen };
