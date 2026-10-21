// ─────────────────────────────────────────────────────────────────────────────
// features/maya/MayaFab.jsx — the floating "Ask Maya" button.
//
// One of three ways into Maya (the others are the drawer row and every ⓘ's Ask
// Maya link). It floats above the tab bar, bottom-right, clear of the centre ✚.
// A person can switch it off in Settings › Assistant, so it is a convenience,
// never the only door.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, elevate, radius, space, text } from '../../theme/tokens';
import { icons } from '../../theme/icons';
import { openMaya } from './mayaBridge';

export function MayaFab() {
  const insets = useSafeAreaInsets();
  const Maya = icons.maya;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', right: space[4], left: 0, bottom: 72 + Math.max(insets.bottom, 10), alignItems: 'flex-end' }}
    >
      <Pressable
        onPress={openMaya}
        accessibilityRole="button"
        accessibilityLabel="Ask Maya"
        style={({ pressed }) => [{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          height: 48,
          paddingHorizontal: space[4],
          borderRadius: radius.full,
          backgroundColor: pressed ? color.brandPressed : color.brand,
        }, elevate('lg')]}
      >
        {Maya ? <Maya size={20} color={color.textOnBrand} /> : null}
        <Text style={[text.smallStrong, { color: color.textOnBrand }]}>Ask Maya</Text>
      </Pressable>
    </View>
  );
}

export default MayaFab;
