// ─────────────────────────────────────────────────────────────────────────────
// ui/FilterTabs.jsx — the segmented filter above a list.
//
// Web ancestor: `FilterTabs` in shared/attendance/ui.jsx — "tabs left, search
// right, counts in labels". A plain picker of options WAS CONSIDERED AND
// REJECTED: a dropdown hides how many states there are and costs two taps to
// see what's in it.
//
// ── THREE RULES ──────────────────────────────────────────────────────────────
//
// 1. COUNTS GO IN THE LABEL — "Pending (3)" — never in a separate badge. A
//    badge beside a tab makes the strip taller and reads as a notification.
//
// 2. IT SCROLLS, it never wraps. Five filters at 390pt don't fit, and a
//    wrapping strip becomes two rows high and shoves the list down. Same
//    lesson as ProfileTabStrip (§5): a wrapped bar grew to three rows on a
//    laptop. Edge fades show there is more.
//
// 3. NEVER PUT A FieldHelp INSIDE THIS. A tablist may not contain another
//    interactive element: the ⓘ would be unreachable for a screen reader and a
//    tap would fire both. The ⓘ goes BESIDE the strip, as `help` below, which
//    renders it outside the tablist.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { color, radius, space, text } from '../theme/tokens';
import { haptic } from './haptics';

/**
 * @param {object} props
 * @param {Array<{value: string, label: string, count?: number}>} props.options
 * @param {string} props.value
 * @param {Function} props.onChange
 * @param {React.ReactNode} [props.help]  an ⓘ — rendered OUTSIDE the tablist
 * @param {React.ReactNode} [props.children] extra controls rendered inside the tablist
 */
export function FilterTabs({ options = [], value, onChange, help, children, style }) {
  const scroller = useRef(null);
  const offsets = useRef({});

  // Keep the selected tab visible: a filter restored from state, or one
  // changed by a decision elsewhere, can sit off the right edge.
  useEffect(() => {
    const x = offsets.current[value];
    if (x != null && scroller.current) {
      scroller.current.scrollTo({ x: Math.max(0, x - 48), animated: true });
    }
  }, [value]);

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[2] }, style]}>
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space[2], paddingRight: space[4] }}
          accessibilityRole="tablist"
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            const count = opt.count;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onLayout={(e) => { offsets.current[opt.value] = e.nativeEvent.layout.x; }}
                onPress={() => {
                  if (!selected) haptic('selection');
                  onChange(opt.value);
                }}
                // The selected segment is INK (2026-10-20): a dark pill among
                // white ones, the reference shots' segmented control. Purple
                // stays for the section tile above it, so the two "where am
                // I" answers on a screen never compete in the same colour.
                style={({ pressed }) => ({
                  paddingHorizontal: space[4],
                  paddingVertical: 8,
                  borderRadius: radius.full,
                  borderWidth: 1,
                  minHeight: 38,
                  justifyContent: 'center',
                  // Purple when selected (2026-10-21; was ink).
                  backgroundColor: selected
                    ? color.brand
                    : pressed ? color.brandSoftBg : color.surface,
                  borderColor: selected ? color.brand : color.borderSubtle,
                })}
              >
                <Text
                  style={[text.smallStrong, {
                    color: selected ? color.textOnBrand : color.textSecondary,
                  }]}
                >
                  {/* The count is part of the label, not a badge. Rule 1. */}
                  {Number.isFinite(count) ? `${opt.label} (${count})` : opt.label}
                </Text>
              </Pressable>
            );
          })}
          {children}
        </ScrollView>
      </View>
      {/* Outside the tablist, on purpose. Rule 3. */}
      {help}
    </View>
  );
}

export default FilterTabs;
