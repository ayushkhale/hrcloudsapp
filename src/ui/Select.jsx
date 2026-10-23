// ─────────────────────────────────────────────────────────────────────────────
// ui/Select.jsx — a choice from a list, and the toggle.
//
// A BOTTOM-SHEET PICKER, NOT A NATIVE DROPDOWN. The web app rejected a styled
// native <select> because it ignored the corner radius and the font; the native
// equivalents are worse — the iOS wheel is a modal of its own with a different
// visual language, and Android's dialog ignores every token we have.
//
// So: a PickerBox that looks exactly like a TextField, opening a sheet of rows.
// The same control, whatever is being chosen.
//
// NEVER A PLAIN LIST OF PEOPLE HERE (CLAUDE.md §4). People are chosen with
// PersonSelect, which shows a face, a name and an employee code. A select of
// names loses the only thing that distinguishes two colleagues called Priya.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Pressable, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { icons } from '../theme/icons';
import {
  color, gutter, iconSize, space, text,
} from '../theme/tokens';
import { PickerBox } from './TextField';
import { EmptyState } from './EmptyState';
import { haptic } from './haptics';
import { SheetShell } from './SheetShell';
import { useKeyboardInset } from './KeyboardAware';

/**
 * @param {object} props
 * @param {Array<{value: any, label: string, caption?: string, disabled?: boolean}>} props.options
 * @param {any} props.value
 * @param {Function} props.onChange
 * @param {string} [props.title]  the sheet's heading — "Choose a reason"
 */
export function Select({
  options = [],
  value,
  onChange,
  placeholder = 'Choose…',
  title = 'Choose',
  invalid = false,
  disabled = false,
  registerFocus,
  emptyMessage = 'Nothing to choose from.',
  style,
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) || null;
  const Check = icons.check;

  return (
    <>
      <PickerBox
        value={selected?.label}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        invalid={invalid}
        disabled={disabled}
        registerFocus={registerFocus}
        accessibilityLabel={selected ? `${title}: ${selected.label}` : placeholder}
        // No leading chevron: PickerBox draws the trailing one (2026-10-20).
        style={style}
      />

      <OptionSheet
        visible={open}
        title={title}
        onClose={() => setOpen(false)}
        emptyMessage={emptyMessage}
        data={options}
        renderRow={(opt) => {
          const isSelected = opt.value === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: !!opt.disabled }}
              disabled={opt.disabled}
              onPress={() => {
                haptic('selection');
                onChange(opt.value);
                setOpen(false);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                paddingHorizontal: gutter,
                paddingVertical: space[3],
                minHeight: 52,
                opacity: opt.disabled ? 0.45 : 1,
                backgroundColor: pressed ? color.pressTint : 'transparent',
              })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={text.body}>{opt.label}</Text>
                {/* A disabled option says WHY in its caption. An option that
                    is simply greyed out invites a second and third tap. */}
                {opt.caption ? <Text style={text.caption}>{opt.caption}</Text> : null}
              </View>
              {isSelected && Check ? <Check size={iconSize.md} color={color.brand} /> : null}
            </Pressable>
          );
        }}
      />
    </>
  );
}

/**
 * The sheet the pickers share. Exported because PersonSelect and the work-mode
 * picker use the same frame — one sheet shape for every choice in the app.
 *
 * It drags and springs like every other sheet (ui/SheetShell.jsx). The list is
 * a BottomSheetFlatList, not a FlatList: that is what makes a downward pull at
 * the top of a long list of options close the picker instead of fighting it.
 */
export function OptionSheet({
  visible,
  title,
  onClose,
  data = [],
  renderRow,
  header,
  emptyMessage = 'Nothing to choose from.',
  keyOf = (item, i) => String(item?.value ?? item?.id ?? i),
  rowHeight = 58,
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const Close = icons.close;

  // FIT THE OPTIONS (2026-10-20): three choices opened a 75% panel of blank.
  // The list is virtualised and cannot measure itself, so the detent is worked
  // out from the row count — grab + title row + rows + a search header if
  // there is one + the safe area and some air — and capped at the 75% ceiling.
  const count = Math.max(1, data.length);
  const wanted = 22 + 60 + (header ? 64 : 0) + count * rowHeight + insets.bottom + space[5];
  const detent = Math.round(Math.min(windowHeight * 0.75, Math.max(wanted, 220)));
  const keyboardInset = useKeyboardInset();

  return (
    <SheetShell visible={visible} onClose={onClose} snap={detent} background={color.surface}>
      {/* `close` springs it down and then reports back, so the ✕ matches a drag
          rather than snapping the panel off the screen. */}
      {({ close }) => (
        <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: gutter,
              paddingVertical: space[3],
              borderBottomWidth: 1,
              borderBottomColor: color.borderSubtle,
            }}
          >
            <Text accessibilityRole="header" style={[text.h3, { flex: 1 }]}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={close}
              hitSlop={12}
              style={({ pressed }) => ({
                width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                backgroundColor: pressed ? color.brandChipBg : color.surfaceSubtle,
              })}
            >
              {Close ? <Close size={iconSize.sm} color={color.textSecondary} /> : null}
            </Pressable>
          </View>

          {header}

          <BottomSheetFlatList
            style={{ flex: 1 }}
            data={data}
            keyExtractor={keyOf}
            renderItem={({ item }) => renderRow(item)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyState title="Nothing here" message={emptyMessage} />}
            /* ── THE SEARCH FIELD IS AT THE TOP, AND THAT IS THE FIX ─────────
               A picker's search box sits in `header`, right under the title, so
               an open keyboard never covers the thing being typed in — which is
               why ui/SheetShell.jsx is deliberately left alone here. Changing
               gorhom's keyboardBehavior would reach every sheet in the app,
               including the fitted ones whose height reporting that file's
               header spends forty lines on.

               What the keyboard DOES cover is the list. So the list gets its
               height back as scrollable room (ui/KeyboardAware.jsx). */
            contentContainerStyle={{ paddingBottom: insets.bottom + space[4] + keyboardInset }}
            overScrollMode="never"
          />
        </>
      )}
    </SheetShell>
  );
}

/**
 * A switch with its label, for a boolean.
 *
 * The LABEL IS TAPPABLE as well as the switch. A 51×31 switch is a small
 * target next to a full-width row of text, and people aim at the words.
 */
export function Toggle({ label, caption, value, onValueChange, disabled = false, style }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: !!value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => { haptic('selection'); onValueChange(!value); }}
      style={({ pressed }) => [{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: 48,
        paddingVertical: space[2],
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? color.pressTint : 'transparent',
      }, style]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={text.body}>{label}</Text>
        {caption ? <Text style={text.caption}>{caption}</Text> : null}
      </View>
      <Switch
        value={!!value}
        onValueChange={(v) => { haptic('selection'); onValueChange(v); }}
        disabled={disabled}
        // Android needs both; iOS uses trackColor.true only when on.
        trackColor={{ false: color.border, true: color.brandSoftBorder }}
        thumbColor={value ? color.brand : color.surface}
        ios_backgroundColor={color.border}
        // The row already announces itself as the switch — this would make
        // TalkBack read the label twice.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

export default Select;
