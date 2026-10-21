// ─────────────────────────────────────────────────────────────────────────────
// features/settings/components/SettingsParts.jsx — the grouped-list kit Settings
// is built from, so new settings are a row, not a redesign.
//
// Settings today holds quick actions and the Maya preferences; more will come
// (notifications, theme, language). Rather than one bespoke screen that grows
// unevenly, Settings is grouped rows — the iOS/Android settings pattern — and a
// new one drops in as a <SettingsRow> under the right <SettingsGroup>. Each row
// is a label, an optional caption, and ONE accessory on the right: a chevron (it
// opens something), a switch (a yes/no preference), or a value (a fact or a
// choice). That's the whole vocabulary.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { haptic } from '../../../ui/haptics';

export function SettingsGroup({ title, caption, children }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: space[2] }}>
      {title ? (
        <View style={{ paddingHorizontal: space[1], gap: 1 }}>
          <Text style={[text.label, { color: color.textSecondary }]}>{title}</Text>
          {caption ? <Text style={text.caption}>{caption}</Text> : null}
        </View>
      ) : null}
      <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.borderSubtle, overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <View key={row.key || i}>
            {i > 0 ? <View style={{ height: 1, backgroundColor: color.borderSubtle, marginLeft: 56 }} /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * @param {object} props
 * @param {Function} props.icon
 * @param {string} props.label
 * @param {string} [props.caption]
 * @param {Function} [props.onPress]
 * @param {string} [props.value]       a fact or a current choice, shown on the right
 * @param {{value:boolean,onChange:Function}} [props.toggle]
 * @param {boolean} [props.destructive]
 * @param {string} [props.tone]        icon-chip tone key (default brand purple)
 */
export function SettingsRow({
  icon: Icon, label, caption, onPress, value, toggle, destructive = false, tone,
}) {
  const t = destructive ? color.danger : (tone ? toneOf(tone) : null);
  const chipBg = destructive ? color.danger.bg : (t ? t.chip : color.brandChipBg);
  const chipFg = destructive ? color.danger.fg : (t ? t.fg : color.brandChipFg);
  const labelColor = destructive ? color.danger.fg : color.textPrimary;
  const Chevron = icons.chevronRight;
  const interactive = !!onPress && !toggle;

  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], paddingVertical: space[3], minHeight: 56 }}>
      <View style={{ width: 32, height: 32, borderRadius: radius.md, backgroundColor: chipBg, alignItems: 'center', justifyContent: 'center' }}>
        {Icon ? <Icon size={18} color={chipFg} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[text.body, { fontFamily: text.bodyStrong.fontFamily, color: labelColor }]}>{label}</Text>
        {caption ? <Text numberOfLines={2} style={text.caption}>{caption}</Text> : null}
      </View>
      {value ? <Text style={[text.small, { color: color.textSecondary, maxWidth: 140 }]} numberOfLines={1}>{value}</Text> : null}
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={(v) => { haptic('selection'); toggle.onChange(v); }}
          trackColor={{ true: color.brand, false: color.border }}
          thumbColor={color.surface}
        />
      ) : null}
      {interactive && Chevron ? <Chevron size={18} color={color.textMuted} /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: pressed ? color.surfaceSubtle : 'transparent' })}
    >
      {body}
    </Pressable>
  );
}

export default { SettingsGroup, SettingsRow };
