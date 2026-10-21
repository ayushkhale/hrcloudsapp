// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/WorkModePicker.jsx — "Worked from", on the
// punch card.
//
// It was a <Select>: a grey box that said "Office", a tap, a sheet, a second
// tap. For a choice of two to four places made every single morning, that is
// three steps to answer a question whose answer is usually already right.
// Now every permitted place is on the card at once, as icon tiles, and one
// tap picks.
//
// The words stay "Worked from", the same label as the Attendance Correction
// form, so the one field has one name in both places.
//
// ── EDITABLE ONLY BEFORE THE CLOCK-IN ───────────────────────────────────────
//
// `work_mode` goes on the clock-in request and nowhere else. Once the day has
// started, changing it here would change nothing — so after the clock-in it
// becomes one quiet line saying where the day was recorded, not a control
// that pretends. (A wrong one is fixed by an Attendance Correction, which has
// its own "Worked from" field.)
//
// ── NOT A FILL ──────────────────────────────────────────────────────────────
//
// The chosen tile is tinted with a purple edge, not filled solid: the Clock
// in button below is the screen's one filled purple thing (CLAUDE.md §1).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { FieldHelp } from '../../../ui';

const MODE_ICON = {
  office: icons.office,
  remote: icons.home,
  hybrid: icons.switch,
  field: icons.location,
};

/**
 * @param {{ options: {value, label}[], value: string, onChange: Function,
 *           locked?: boolean, disabled?: boolean }} props
 */
export function WorkModePicker({ options, value, onChange, locked = false, disabled = false }) {
  if (!options?.length) return null;
  const current = options.find((o) => o.value === value) || null;

  if (locked) {
    const Icon = MODE_ICON[value] || icons.location;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View
          style={{
            width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center',
            justifyContent: 'center', backgroundColor: color.brandChipBg,
          }}
        >
          {Icon ? <Icon size={15} color={color.brandChipFg} /> : null}
        </View>
        <Text style={[text.small, { color: color.textSecondary }]}>
          {'Worked from '}
          <Text style={[text.smallStrong, { color: color.textPrimary }]}>{current?.label || 'N/A'}</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={text.label}>Worked from</Text>
        <FieldHelp surface="attendance.punch" field="work_mode" />
      </View>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: space[2] }}>
        {options.map((o) => {
          const on = o.value === value;
          const Icon = MODE_ICON[o.value] || icons.location;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled }}
              accessibilityLabel={`Worked from ${o.label}`}
              disabled={disabled}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 64,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                paddingVertical: space[2],
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderColor: on ? color.brand : 'transparent',
                backgroundColor: on ? color.brandChipBg : pressed ? color.brandSoftBg : color.surfaceSubtle,
                opacity: disabled ? 0.5 : 1,
              })}
            >
              {Icon ? <Icon size={20} color={on ? color.brandChipFg : color.textMuted} /> : null}
              <Text
                numberOfLines={1}
                style={[text.smallStrong, { color: on ? color.brandChipFg : color.textSecondary }]}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default WorkModePicker;
