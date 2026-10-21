// ─────────────────────────────────────────────────────────────────────────────
// features/auth/screens/OtpScreen.jsx — step 2 of 3.
//
// Spec: NativeRef/40-screens/01-auth.md § Otp.
//
// ── ONE TextInput BEHIND SIX DRAWN BOXES ─────────────────────────────────────
//
// The boxes are Views. The input is a single transparent TextInput stretched
// over them. Six real inputs is the obvious build and it is wrong three ways:
// paste drops five characters, the OS autofill of a mailed code has nothing to
// fill, and backspace at the start of box 4 jumps somewhere unpredictable.
//
// `autoComplete` is the prop that makes the keyboard offer the code at all —
// `one-time-code` on iOS, `sms-otp` on Android. Without it people leave the
// app to read their mail, and some of them do not come back.
//
// ── THIS SCREEN DOES NOT CALL THE SERVER TO CHECK THE CODE ───────────────────
//
// There is no verify-only endpoint: `/auth/forgot-password/verify` checks the
// code AND sets the password in one call. So "Verify" here carries the six
// digits forward to NewPassword, which makes that single call with both halves.
//
// The cost is that a mistyped code is not caught until screen 3. NewPassword
// pays it back by sending the person STRAIGHT BACK HERE with the boxes cleared
// when the server says the code was wrong or expired — so the retry lands on
// the screen that takes codes, not on a password form that can only fail.
//
// Keeping the password field here instead (the previous build) was the other
// way to spend it, and it cost more: a 390pt phone with the keyboard up put
// the Verify button under the fold with no way to reach it.
//
// ── THE requestId IS REPLACED BY A RESEND, NOT KEPT ──────────────────────────
//
// `resendOtp` INVALIDATES the id it was given and returns a new one. Sending
// the old one back gets "invalid request", which on screen looks exactly like
// a wrong code — so the person retypes a perfectly good code and it fails
// again. The new id is stored the moment the resend resolves, and it is passed
// forward to NewPassword as a param.
//
// ── THE TWO ESCAPE HATCHES ARE NOT NEIGHBOURS ────────────────────────────────
//
// "Resend" and "Use a different email" used to sit one line apart, and they do
// opposite things: one keeps you here with a fresh code, the other throws the
// reset away and goes back a screen. A mis-tap meant re-reading your mail for
// nothing. The resend is now an inline sentence under the boxes, where it
// answers the question it belongs to ("nothing arrived"); the email change is
// below the Verify button and the step dots, a whole block away.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { authAPI } from '../../../api';
import { useCountdown } from '../../../hooks/useCountdown';
import { useFormFocus } from '../../../hooks/useFormFocus';
import { authErrorMessage, isRateLimited, rateLimitSeconds } from '../../../lib/errors';
import { revealer } from '../../../lib/formGuard';
import { icons } from '../../../theme/icons';
import { color, iconSize, radius, space, text } from '../../../theme/tokens';
import {
  Button,
  FieldError,
  IconTile,
  LinkButton,
  useToast,
} from '../../../ui';
import { AuthScreen, StepDots } from '../components/AuthScreen';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_MS = 45_000;

/** 45 → "00:45". The reference's own format, and it reads as a countdown in a
    way that "45s" does not. */
function mmss(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * `ayush@company.com` → `a•••@company.com`; an employee code keeps its ends.
 *
 * A half-masked address confirms they typed the right thing without reprinting
 * an address in full on a screen somebody might be holding up in an office.
 */
function maskIdentifier(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'your email';

  const at = raw.indexOf('@');
  if (at > 0) return `${raw[0]}•••${raw.slice(at)}`;

  // An employee code: keep enough to recognise, hide the middle.
  if (raw.length <= 3) return raw;
  return `${raw[0]}•••${raw.slice(-2)}`;
}

/* ── The six boxes ────────────────────────────────────────────────────────── */

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

/* ── The screen ───────────────────────────────────────────────────────────── */

export default function OtpScreen({ navigation, route }) {
  const { showToast } = useToast();
  const identifier = route?.params?.identifier || '';
  const context = route?.params?.context || 'forgot-password';

  // The request handle. `requestId` is state, not a param read, because a
  // resend replaces it — see the header.
  const [requestId, setRequestId] = useState(route?.params?.requestId || null);

  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [resending, setResending] = useState(false);
  const [codeFailure, setCodeFailure] = useState(false);

  // A code was sent immediately before this screen opened, so the resend
  // starts on cooldown rather than inviting a second mail at once.
  const [resendUntil, setResendUntil] = useState(() => Date.now() + RESEND_COOLDOWN_MS);

  const codeInput = useRef(null);
  const focus = useFormFocus();
  const resendSeconds = useCountdown(resendUntil);
  const show = revealer(attempted);

  // Coming BACK from NewPassword because the server rejected the code: clear
  // the boxes, say why, and put the caret where the retry goes. The param is
  // consumed on arrival so a second back-swipe doesn't replay the message.
  const rejected = route?.params?.rejected;
  useEffect(() => {
    if (!rejected) return;
    setCode('');
    setCodeFailure(true);
    navigation.setParams({ rejected: undefined });
    const t = setTimeout(() => codeInput.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [rejected, navigation]);

  // Open the keyboard on the code: this screen exists to take six digits.
  useEffect(() => {
    const t = setTimeout(() => codeInput.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const problems = useCallback(() => {
    const found = {};
    if (code.length !== CODE_LENGTH) found._code = `Enter the ${CODE_LENGTH}-digit code we emailed you.`;
    return found;
  }, [code]);

  const onCode = useCallback((next) => {
    // Digits only, so a pasted "123 456" or "code: 123456" still works.
    const digits = String(next || '').replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCodeFailure(false);
    setCode(digits);
  }, []);

  const toPassword = useCallback(() => {
    if (focus.focusFirstProblem(problems())) {
      setAttempted(true);
      const prob = problems();
      if (prob._code) showToast(prob._code, 'error');
      return;
    }

    navigation.navigate('NewPassword', { identifier, context, requestId, otp: code });
  }, [focus, problems, showToast, navigation, identifier, context, requestId, code]);

  const resend = useCallback(async () => {
    if (resending || resendSeconds > 0) return;

    setResending(true);

    try {
      const res = await authAPI.resendOtp({ identifier, context, requestId });
      const data = res?.data || res || {};

      // THE WHOLE POINT OF THIS HANDLER. The old id is dead.
      const nextId = data.requestId || data.request_id;
      if (nextId) setRequestId(nextId);

      setCode('');
      setCodeFailure(false);
      setResendUntil(Date.now() + RESEND_COOLDOWN_MS);
      showToast('We’ve sent another code.', 'success');
      codeInput.current?.focus();
    } catch (err) {
      if (isRateLimited(err)) {
        setResendUntil(Date.now() + rateLimitSeconds(err) * 1000);
      }
      const msg = authErrorMessage(err, 'Couldn’t send another code. Please try again.');
      showToast(msg, 'error');
    } finally {
      setResending(false);
    }
  }, [resending, resendSeconds, identifier, context, requestId, showToast]);

  const codeProblem = show(problems()._code);
  const waiting = resendSeconds > 0;

  return (
    <AuthScreen
      title="OTP verification"
      subtitle={`We’ve sent a ${CODE_LENGTH}-digit verification code to your email.`}
      onBack={() => navigation.goBack()}
      logo={false}
      footer={
        <View style={{ gap: space[4] }}>
          <Button
            title="Verify code"
            onPress={toPassword}
            icon={icons.arrowRight}
            iconRight
            fullWidth
            size="lg"
          />
          <StepDots step={2} />
          {/* A whole block below the button and the dots — see the header. */}
          <View style={{ alignItems: 'center' }}>
            <LinkButton
              title="Use a different email"
              onPress={() => navigation.goBack()}
              textStyle={{ color: color.textSecondary }}
            />
          </View>
        </View>
      }
    >
      {/* ── Who it went to ────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          padding: space[3],
          borderRadius: radius.lg,
          backgroundColor: color.brandSoftBg,
          borderWidth: 1,
          borderColor: color.brandSoftBorder,
        }}
      >
        <IconTile icon={icons.mail} tone="purple" size="md" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={text.caption}>Code sent to</Text>
          {/* Half-masked: this screen gets held up in offices. */}
          <Text numberOfLines={1} style={text.bodyStrong}>{maskIdentifier(identifier)}</Text>
        </View>
      </View>

      {/* ── The code ──────────────────────────────────────────────────────── */}
      <View
        style={{ marginTop: space[6] }}
        onLayout={focus.register('_code').onLayout}
      >
        <Pressable
          onPress={() => codeInput.current?.focus()}
          accessibilityRole="none"
          // The boxes are decoration; the input below carries the semantics.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <CodeBoxes
            value={code}
            length={CODE_LENGTH}
            invalid={codeFailure || !!codeProblem}
            focused={focused}
          />
        </Pressable>

        <TextInput
          ref={codeInput}
          value={code}
          onChangeText={onCode}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={CODE_LENGTH}
          keyboardType="number-pad"
          // The props that make the OS offer the mailed code.
          autoComplete={Platform.OS === 'ios' ? 'one-time-code' : 'sms-otp'}
          textContentType="oneTimeCode"
          autoCorrect={false}
          caretHidden
          accessibilityLabel={`${CODE_LENGTH}-digit code`}
          accessibilityHint="Enter the code we emailed you"
          // Invisible but real: it keeps paste, autofill and the keyboard, all
          // of which a View cannot do.
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0,
          }}
        />

        {codeProblem ? (
          <View style={{ marginTop: space[2], alignItems: 'center' }}>
            <FieldError>{codeProblem}</FieldError>
          </View>
        ) : null}
      </View>

      {/* ── The resend, where the question it answers is asked ─────────────── */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: space[4],
        }}
      >
        <Text style={[text.small, { color: color.textSecondary }]}>
          Didn’t receive the code?{' '}
        </Text>
        {waiting ? (
          // Not a dimmed link: a countdown is a fact, not a disabled control,
          // and a greyed-out "Resend" invites presses that do nothing.
          <Text style={[text.smallStrong, { color: color.textMuted, fontVariant: ['tabular-nums'] }]}>
            Resend in {mmss(resendSeconds)}
          </Text>
        ) : (
          <LinkButton
            title={resending ? 'Sending…' : 'Resend'}
            onPress={resend}
            disabled={resending}
            // Keeps LinkButton's full 44pt box: the row simply grows to it.
            // Shrinking it back to the text is how this became a link you had
            // to hit exactly.
            style={{ paddingHorizontal: space[1] }}
          />
        )}
      </View>
    </AuthScreen>
  );
}

export { OtpScreen, maskIdentifier };
