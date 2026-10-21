// ─────────────────────────────────────────────────────────────────────────────
// ui/CodeInput.jsx — a one-time code as six boxes.
//
// Was `CodeBoxes` + a hidden TextInput inside features/auth/screens/OtpScreen.
// It moved here on 2026-10-22 when Register this phone needed the same thing
// (user: "make add this device OTP screen like other OTP screens, the 6 box
// design"). One component, so a sign-in code and a device code are typed the
// same way and can't drift apart.
//
// THE BOXES ARE DECORATION; THE INPUT IS REAL. An invisible TextInput lies
// over the boxes and owns the value — it keeps paste, the keyboard and the
// OS's one-time-code autofill, none of which a row of Views can do. The boxes
// are hidden from screen readers; the input carries the label.
//
// The parent owns the value and the focus (a ref reaches the input), and says
// when it is wrong with `invalid` — the boxes go rose, the button stays live
// (CLAUDE.md §3: the press does the checking).
// ─────────────────────────────────────────────────────────────────────────────

import React, { forwardRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { color, radius, space, text } from '../theme/tokens';

function CodeBoxes({ value, length, invalid, focused }) {
  const digits = String(value || '').split('');

  return (
    <View style={{ flexDirection: 'row', gap: space[2], justifyContent: 'center' }}>
      {Array.from({ length }).map((_, i) => {
        const digit = digits[i];
        // The caret's box: the next empty one, or the last while full.
        const active = focused && (i === digits.length || (digits.length === length && i === length - 1));

        return (
          <View
            key={i}
            style={{
              width: 46,
              height: 58,
              borderRadius: radius.md,
              borderWidth: active ? 2 : 1,
              borderColor: invalid
                ? color.danger.dot
                : active
                  ? color.brand
                  : color.border,
              backgroundColor: color.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[text.h1, { color: color.textPrimary }]}>{digit || ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * @param {object} props
 * @param {string} props.value
 * @param {(digits: string) => void} props.onChangeText  digits only, already trimmed to `length`
 * @param {number} [props.length]  default 6
 * @param {boolean} [props.invalid]
 * @param {boolean} [props.autoFocus]
 * @param {string} [props.accessibilityHint]
 */
export const CodeInput = forwardRef(function CodeInput({
  value,
  onChangeText,
  length = 6,
  invalid = false,
  autoFocus = false,
  editable = true,
  accessibilityHint = 'Enter the code we emailed you',
}, ref) {
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => ref?.current?.focus()}
        accessibilityRole="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <CodeBoxes value={value} length={length} invalid={invalid} focused={focused} />
      </Pressable>

      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v) => onChangeText?.(String(v).replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={length}
        keyboardType="number-pad"
        // The props that make the OS offer the mailed code.
        autoComplete={Platform.OS === 'ios' ? 'one-time-code' : 'sms-otp'}
        textContentType="oneTimeCode"
        autoCorrect={false}
        autoFocus={autoFocus}
        editable={editable}
        caretHidden
        accessibilityLabel={`${length}-digit code`}
        accessibilityHint={accessibilityHint}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }}
      />
    </View>
  );
});

export default CodeInput;
