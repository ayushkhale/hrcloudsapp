// ─────────────────────────────────────────────────────────────────────────────
// features/home/components/QuickActions.jsx — the 2×3 grid under the punch card.
//
// Six destinations, three across. It is the one place on Home that is pure
// navigation, and it exists because the tab bar holds five tabs while the app
// has twenty-four screens: without this, Payslips and Directory are three taps
// away from the screen everybody opens.
//
// ── EVERY TILE GOES THROUGH useRouteTarget ──────────────────────────────────
//
// Not one of them names a tab or a screen. A key that has no destination in
// this workspace returns null and THE TILE IS NOT RENDERED — the grid closes
// up around it. That is the rule from navigation/routes.js: a capability a
// role lacks is absent, not broken. It is also what keeps this component
// working unchanged the day the manager app ships with a different route map.
//
// ── WHY A FIXED 33% BASIS AND NOT flex: 1 ───────────────────────────────────
//
// With `flex: 1` a final row holding one tile stretches it across the full
// width, and the grid stops reading as a grid. A fixed basis leaves the last
// row left-aligned under the others, which is what every launcher does.
//
// ── THE TILES ARE NOT TINTED, AND THAT IS THE POINT ─────────────────────────
//
// Each tile used to carry its own tone — purple, violet, fuchsia, indigo — on
// the reasoning that a colour per destination helps people aim. Six of them in
// a block does the opposite: the grid becomes a swatch card, nothing is
// emphasised because everything is, and the one genuinely coloured thing on
// the screen (the punch card) stops being the first thing the eye lands on.
//
// Accent colour on this screen is spent where the reference spends it: the
// hero, the announcement panel, the unread marks. Navigation is neutral — a
// dark glyph on a quiet tile — and the words do the work.
//
// ── THE LABELS ARE THE DESTINATIONS' OWN WORDS ──────────────────────────────
//
// "Attendance", "Leave", "Payslips" — the same strings as the tab labels and
// the screen titles (CLAUDE.md §2). Not "My hours", not "Time off". A tile
// that renames where it goes is how people stop trusting the navigation.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useGo, useRouteTarget } from '../../../navigation/routes';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { Card } from '../../../ui';

/* key → what the tile says and what it looks like. The ORDER here is the order
   on screen, and it is by how often an employee needs the thing: time first,
   then money, then people, then everything else. */
const TILES = [
  { key: 'attendance', label: 'Attendance', icon: icons.clock },
  { key: 'leaves', label: 'Leave', icon: icons.calendar },
  { key: 'payslips', label: 'Payslips', icon: icons.rupee },
  { key: 'directory', label: 'Directory', icon: icons.people },
  { key: 'claims', label: 'Claims', icon: icons.claims },
  { key: 'documents', label: 'Documents', icon: icons.document },
];

function Tile({ label, icon: Icon, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexBasis: '31%',
        flexGrow: 0,
        alignItems: 'center',
        gap: space[2],
        paddingVertical: space[3],
        paddingHorizontal: space[1],
        borderRadius: radius.lg,
        backgroundColor: pressed ? color.brandSoftBg : 'transparent',
      })}
    >
      {/* Not an IconTile: that component carries a semantic tone, and these
          six carry none — they are destinations, not states, so they share
          one colour rather than picking six.

          ── PURPLE, NOT SLATE (2026-10-18) ──────────────────────────────────
          These were slate-50 squares with slate-900 glyphs behind a hairline.
          They are the first thing on the first screen, six of them in a grid,
          and they set the tone for the whole app — which was "grey". The
          reference drew them flat because the reference is a web page with a
          sidebar full of colour elsewhere; a phone has only this. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.brandChipBg,
        }}
      >
        {Icon ? <Icon size={24} color={color.brandChipFg} /> : null}
      </View>
      <Text numberOfLines={1} style={[text.smallStrong, { color: color.textBody }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function QuickActions() {
  const go = useGo();

  // Hooks can't be called in a loop over data, so each key is resolved by
  // name. Six explicit lines beats a rules-of-hooks violation.
  const targets = {
    attendance: useRouteTarget('attendance'),
    leaves: useRouteTarget('leaves'),
    payslips: useRouteTarget('payslips'),
    directory: useRouteTarget('directory'),
    claims: useRouteTarget('claims'),
    documents: useRouteTarget('documents'),
  };

  const tiles = TILES.filter((t) => targets[t.key]);
  if (!tiles.length) return null;

  return (
    <Card style={{ paddingVertical: space[3], paddingHorizontal: space[2] }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-start',
          rowGap: space[2],
          columnGap: '3.5%',
        }}
      >
        {tiles.map((t) => (
          <Tile
            key={t.key}
            label={t.label}
            icon={t.icon}
            onPress={() => go(targets[t.key])}
          />
        ))}
      </View>
    </Card>
  );
}

export default QuickActions;
