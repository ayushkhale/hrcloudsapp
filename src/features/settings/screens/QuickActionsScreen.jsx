// ─────────────────────────────────────────────────────────────────────────────
// features/settings/screens/QuickActionsScreen.jsx — Settings › Quick actions.
//
// A pushed stack screen, reached from a Settings row and from the pencil on
// the ✚ sheet itself (2026-10-22).
//
// ── SIX SHORTCUTS, CHANGE ONE AT A TIME (user, 2026-10-18) ──────────────────
//
// The ✚ sheet always holds six. A person can CHANGE what a shortcut is — no
// adding, no removing, no reordering. Picking one that is already a shortcut
// swaps the two, so there are always six different ones. Every change saves at
// once; "Go back to the original 6" undoes everything. (quickActions.js holds
// the rule; this screen only draws it.)
//
// ── REDESIGNED FOR SOMEBODY WHO HAS NEVER HEARD THE WORD "SLOT" (2026-10-22) ─
//
// "The replaceable settings aren't right — completely redesign it for a
// layman, unable to understand." What made it hard, and what replaced it:
//
//   • Engineering words — "slot", "replace", a swap glyph, a bare number on a
//     card — became plain ones: shortcut, Change, Current.
//   • No picture of what it changes. The screen now opens on a card that
//     says, next to a ✚, exactly what these are and what tapping does.
//   • The six look EXACTLY as they do in the ✚ sheet (its own ActionCard), so
//     there is nothing to translate — each with a pencil on it.
//   • The picker — its own PAGE since 2026-10-22, QuickActionPickScreen, after
//     a sheet of ~40 cards proved too much to scroll — is titled with the
//     shortcut being changed, marks it "Current" and any other shortcut
//     "Shortcut", and says in one line that picking one of those swaps them.
//   • Every change answers with a toast that says what happened in words.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { color, gutter, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { Button, SkeletonBlock, showToast, useConfirm } from '../../../ui';
import { ActionCard, toneFor } from '../../../navigation/ActionSheet';
import {
  DEFAULT_QUICK_ACTIONS, quickActionFor, saveQuickActions, useQuickActions,
} from '../quickActions';

/** The pencil in a shortcut's corner: "tap to change this one". */
function PencilMark() {
  const Pencil = icons.edit;
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: radius.full,
        backgroundColor: color.brandChipBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {Pencil ? <Pencil size={14} color={color.brandChipFg} /> : null}
    </View>
  );
}

/** The opening card: what these are, in one sentence, beside a ✚. */
function Explainer() {
  const Plus = icons.add;
  return (
    <LinearGradient
      colors={[color.heroSoftFrom, color.heroSoftVia, color.heroSoftTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.heroSoftBorder,
        padding: space[4],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.full,
          backgroundColor: color.brand,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Plus ? <Plus size={24} color={color.textOnBrand} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[text.h3, { color: color.ink }]}>Your ✚ shortcuts</Text>
        <Text style={[text.small, { color: color.textSecondary }]}>
          These 6 open when you tap ✚. Tap one to change it.
        </Text>
      </View>
    </LinearGradient>
  );
}

export default function QuickActionsScreen({ navigation }) {
  const confirm = useConfirm();
  const { ready, keys, userId } = useQuickActions();
  const [busy, setBusy] = useState(false);

  const isDefault = keys.join('|') === DEFAULT_QUICK_ACTIONS.join('|');

  const save = useCallback(async (next, said) => {
    if (busy) return;
    setBusy(true);
    try {
      await saveQuickActions(userId, next);
      if (said) showToast(said, 'success');
    } catch (err) {
      showToast(err?.message || 'We couldn’t save your shortcuts.', 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, userId]);

  const reset = async () => {
    const ok = await confirm({
      title: 'Go back to the original 6?',
      message: 'Your shortcuts go back to the ones the app started with.',
      confirmText: 'Go back',
      cancelText: 'Keep mine',
      icon: icons.refresh,
    });
    if (ok) save([...DEFAULT_QUICK_ACTIONS], 'Your shortcuts are back to the original 6.');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: gutter, gap: space[4], paddingBottom: space[10] }}
    >
      <Explainer />

      {!ready ? (
        <SkeletonBlock height={300} radius={radius.lg} />
      ) : (
        // The six, drawn exactly as the ✚ sheet draws them.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {keys.map((k, i) => {
            const a = quickActionFor(k);
            if (!a) return null;
            return (
              <ActionCard
                key={`${i}-${k}`}
                item={a}
                tone={toneFor(k, i)}
                badge={<PencilMark />}
                accessibilityLabel={`${a.label}. Tap to change this shortcut.`}
                onPress={() => { if (!busy) navigation.navigate('QuickActionPick', { slot: i }); }}
              />
            );
          })}
        </View>
      )}

      {ready && !isDefault ? (
        <Button title="Go back to the original 6" icon={icons.refresh} variant="outline" onPress={reset} fullWidth />
      ) : null}
    </ScrollView>
  );
}

export { QuickActionsScreen };
