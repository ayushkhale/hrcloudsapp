// ─────────────────────────────────────────────────────────────────────────────
// features/auth/screens/OtpScreen.jsx
//
// Spec: NativeRef/40-screens/01-auth.md § Otp.
//
// Step 2 of a password reset. The code and the new password go to the server
// in ONE call — `/auth/forgot-password/verify` verifies and sets the password
// together, and there is no separate reset endpoint.
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
// ── THE requestId IS REPLACED BY A RESEND, NOT KEPT ──────────────────────────
//
// `resendOtp` INVALIDATES the id it was given and returns a new one. Sending
// the old one back gets "invalid request", which on screen looks exactly like
// a wrong code — so the person retypes a perfectly good code and it fails
// again. The new id is stored the moment the resend resolves.
//
// ── TWO DEVIATIONS FROM THE SPEC'S LAYOUT BLOCK, BOTH FORCED ─────────────────
//
// 1. The spec's layout lists only the code boxes, but its own §3 and §6 require
//    `newPassword` in the same call and say Verify is "blocked unless the code
//    is exactly 6 digits AND the new password passes its own rules". The field
//    has to be here; the layout block predates the merged endpoint.
//
// 2. Because of (1) this is a scrolling Screen, not the spec's "no scroll,
//    centred". A centred column with a password field under a keyboard on a
//    390pt phone puts the Verify button off screen with no way to reach it.
//
// ── THE PASSWORD RULE IS A FLOOR, NOT THE POLICY ─────────────────────────────
//
// 8 characters is checked here so the commonest mistake is caught before a
// round trip. The real policy is the server's and is NOT documented in
// NativeRef/10-api/ — so anything stricter arrives as WEAK_PASSWORD and is
// shown from authErrors. Do not add rules here that we cannot verify.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { authAPI } from '../../../api';
import { useCountdown } from '../../../hooks/useCountdown';
import { useFormFocus } from '../../../hooks/useFormFocus';
import {
  authErrorCode,
  authErrorMessage,
  isOtpExpired,
  isRateLimited,
  rateLimitSeconds,
} from '../../../lib/errors';
import { revealer, submitState } from '../../../lib/formGuard';
import { icons } from '../../../theme/icons';
import { color, radius, space, text } from '../../../theme/tokens';
import {
  Button,
  Field,
  FieldError,
  IconButton,
  InlineAlert,
  LinkButton,
  TextField,
  useToast,
} from '../../../ui';
import { AuthScreen } from '../components/AuthScreen';

const CODE_LENGTH = 6;
const PASSWORD_MIN = 8;
const RESEND_COOLDOWN_MS = 30_000;

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
              width: 44,
              height: 56,
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
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [focused, setFocused] = useState(false);

  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [failure, setFailure] = useState(null);
  const [codeFailure, setCodeFailure] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(null);

  // A code was sent immediately before this screen opened, so the resend
  // starts on cooldown rather than inviting a second mail at once.
  const [resendUntil, setResendUntil] = useState(() => Date.now() + RESEND_COOLDOWN_MS);

  const codeInput = useRef(null);
  const focus = useFormFocus();
  const passwordFocus = useRef(null);

  const passwordRegister = useMemo(() => {
    const base = focus.register('password');
    return {
      ...base,
      registerFocus: (fn) => {
        passwordFocus.current = fn;
        base.registerFocus(fn);
      },
    };
  }, [focus]);

  const secondsLeft = useCountdown(cooldownUntil);
  const resendSeconds = useCountdown(resendUntil);
  const show = revealer(attempted);

  // Open the keyboard on the code: this screen exists to take six digits, and
  // unlike Login there is no button for it to cover — the content scrolls.
  useEffect(() => {
    const t = setTimeout(() => codeInput.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const problems = useCallback(() => {
    const found = {};
    if (code.length !== CODE_LENGTH) found._code = `Enter the ${CODE_LENGTH}-digit code we emailed you.`;
    if (!password) found.password = 'Choose a new password.';
    else if (password.length < PASSWORD_MIN) {
      found.password = `Use at least ${PASSWORD_MIN} characters.`;
    }
    return found;
  }, [code, password]);

  const onCode = useCallback((next) => {
    // Digits only, so a pasted "123 456" or "code: 123456" still works.
    const digits = String(next || '').replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCodeFailure(false);
    setFailure(null);
    setCode(digits);
  }, []);

  const verify = useCallback(async () => {
    if (busy || secondsLeft > 0) return;

    // Both problems are shown at once (§6) — the guard travels to whichever is
    // higher on screen, which is the code.
    if (focus.focusFirstProblem(problems())) {
      setAttempted(true);
      return;
    }

    setBusy(true);
    setFailure(null);
    setCodeFailure(false);

    try {
      await authAPI.verifyForgotPasswordOtp({
        identifier,
        otp: code,
        context,
        requestId,
        newPassword: password,
      });

      showToast('Password updated. Sign in with your new password.', 'success');

      // Reset rather than navigate: the reset is finished, and leaving a dead
      // requestId on the stack means a back swipe lands on a form that can
      // only fail.
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (err) {
      setFailure(authErrorMessage(err, 'Couldn’t verify that code. Please try again.'));

      if (isRateLimited(err) || authErrorCode(err) === 'OTP_ATTEMPTS_EXCEEDED') {
        setCooldownUntil(Date.now() + rateLimitSeconds(err) * 1000);
        setCodeFailure(true);
        return;
      }

      // An expired code is NOT a wrong code. The person typed it correctly, so
      // the boxes keep their digits and the message points at the resend.
      if (isOtpExpired(err)) {
        setCodeFailure(true);
        return;
      }

      // A wrong code: clear the boxes and put the caret back in the first one.
      setCodeFailure(true);
      setCode('');
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }, [
    busy, secondsLeft, focus, problems, identifier, code, context, requestId,
    password, showToast, navigation,
  ]);

  const resend = useCallback(async () => {
    if (resending || resendSeconds > 0) return;

    setResending(true);
    setFailure(null);

    try {
      const res = await authAPI.resendOtp({ identifier, context, requestId });
      const data = res?.data || res || {};

      // THE WHOLE POINT OF THIS HANDLER. The old id is dead.
      const nextId = data.requestId || data.request_id;
      if (nextId) setRequestId(nextId);

      setCode('');
      setCodeFailure(false);
      setCooldownUntil(null);
      setResendUntil(Date.now() + RESEND_COOLDOWN_MS);
      showToast('We’ve sent another code.', 'success');
      codeInput.current?.focus();
    } catch (err) {
      if (isRateLimited(err)) {
        setResendUntil(Date.now() + rateLimitSeconds(err) * 1000);
      }
      setFailure(authErrorMessage(err, 'Couldn’t send another code. Please try again.'));
    } finally {
      setResending(false);
    }
  }, [resending, resendSeconds, identifier, context, requestId, showToast]);

  const submit = submitState({ busy, cooldownUntil });
  const codeProblem = show(problems()._code);

  return (
    <AuthScreen
      title="Check your inbox"
      subtitle={`We sent a ${CODE_LENGTH}-digit code to ${maskIdentifier(identifier)}.`}
      onBack={() => navigation.goBack()}
      logo={false}
    >

      {failure ? (
        <InlineAlert tone="rose" style={{ marginTop: space[4] }}>
          {failure}
        </InlineAlert>
      ) : null}

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
          editable={!busy}
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

      {/* ── The new password ──────────────────────────────────────────────── */}
      <View style={{ marginTop: space[6] }}>
        <Field
          label="New password"
          wide
          hint={`At least ${PASSWORD_MIN} characters.`}
          error={show(problems().password)}
          register={passwordRegister}
        >
          <TextField
            value={password}
            onChangeText={(v) => { setFailure(null); setPassword(v); }}
            kind="password"
            placeholder="Your new password"
            editable={!busy}
            secureTextEntry={!reveal}
            autoComplete="password-new"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={verify}
            right={
              <IconButton
                icon={reveal ? icons.reject : icons.view}
                accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
                onPress={() => setReveal((v) => !v)}
              />
            }
          />
        </Field>
      </View>

      <View style={{ marginTop: space[5] }}>
        <Button
          title="Verify"
          onPress={verify}
          loading={busy}
          fullWidth
          size="lg"
          disabled={submit.disabled}
          disabledReason={
            secondsLeft > 0 ? `Too many attempts — try again in ${secondsLeft}s.` : submit.disabledReason
          }
        />
      </View>

      <View style={{ alignItems: 'center', marginTop: space[4], gap: space[2] }}>
        <LinkButton
          title={resendSeconds > 0 ? `Send it again in ${resendSeconds}s` : 'Send it again'}
          onPress={resend}
          disabled={resending || resendSeconds > 0}
          // LinkButton passes `disabled` to its Pressable but has no dimmed
          // state of its own, and a live-looking link that ignores taps reads
          // as a broken screen.
          style={resending || resendSeconds > 0 ? { opacity: 0.45 } : undefined}
        />
        <LinkButton title="Use a different email" onPress={() => navigation.goBack()} />
      </View>
    </AuthScreen>
  );
}

export { OtpScreen, maskIdentifier };
