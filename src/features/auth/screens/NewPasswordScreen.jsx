// ─────────────────────────────────────────────────────────────────────────────
// features/auth/screens/NewPasswordScreen.jsx — step 3 of 3.
//
// New password, confirm new password, and the live rule checklist. This is
// where the reset actually happens: `/auth/forgot-password/verify` takes the
// code AND the new password in one call, so the six digits carried over from
// Otp are spent here.
//
// ── A WRONG CODE SENDS YOU BACK TO THE CODE SCREEN ───────────────────────────
//
// Because the code is only checked now, a mistyped one surfaces on a password
// form — a screen with no way to fix it. So a code-shaped failure pops back to
// Otp with `rejected: true`, which clears the boxes and refocuses them. Every
// other failure (a weak password the server refuses, a network error) stays
// here, because here is where it can be fixed.
//
// ── THE CHECKLIST IS A FLOOR, AND IT SAYS WHAT IT IS ─────────────────────────
//
// The five rules are the ones the reference shows and they are checked live,
// unticked → ticked, so the person is never told "no" by a button that won't
// move. They are a FLOOR, not the policy: the real policy is the server's and
// is NOT documented in NativeRef/10-api/, so anything stricter comes back as
// WEAK_PASSWORD and is shown from authErrors. Do not add rules here that we
// cannot verify.
//
// ── THE BUTTON STAYS LIVE WHILE THE RULES ARE UNMET ──────────────────────────
//
// CLAUDE.md §11: disabled is only for what a press cannot fix. An unfinished
// password is exactly what a press CAN fix — it validates, names the first
// unmet rule in a toast, and moves the focus. A dead button with a checklist
// beside it looks like the checklist is wrong.
//
// ── CONFIRM IS CHECKED ON SUBMIT, NOT ON EVERY KEYSTROKE ─────────────────────
//
// "Passwords don't match" the instant you type the first character of the
// second field is noise that is true for everybody, every time. It is shown
// once the field has been left or the form submitted.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { authAPI } from '../../../api';
import { useFormFocus } from '../../../hooks/useFormFocus';
import { authErrorCode, authErrorMessage, isOtpExpired } from '../../../lib/errors';
import { revealer } from '../../../lib/formGuard';
import { icons } from '../../../theme/icons';
import { color, iconSize, space, text, toneOf } from '../../../theme/tokens';
import { Button, Field, IconButton, TextField, useToast } from '../../../ui';
import { AuthScreen, StepDots } from '../components/AuthScreen';

const PASSWORD_MIN = 8;

/* The five rules from the reference, each a predicate so the list and the
   validation can never disagree — there is one definition of "has a number". */
const RULES = [
  { key: 'len', label: `At least ${PASSWORD_MIN} characters`, ok: (v) => v.length >= PASSWORD_MIN },
  { key: 'upper', label: 'Include an uppercase letter', ok: (v) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'Include a lowercase letter', ok: (v) => /[a-z]/.test(v) },
  { key: 'digit', label: 'Include a number', ok: (v) => /\d/.test(v) },
  { key: 'special', label: 'Include a special character', ok: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** A code-shaped failure: the thing this screen cannot fix. */
function isCodeFailure(err) {
  const code = authErrorCode(err);
  return (
    isOtpExpired(err)
    // The names the gateway uses for "that code is not the code" — the same
    // list AUTH_ERROR_MESSAGES maps to OTP_WRONG, kept in step with it.
    || code === 'INVALID_OTP'
    || code === 'OTP_INVALID'
    || code === 'OTP_MISMATCH'
    || code === 'OTP_ATTEMPTS_EXCEEDED'
  );
}

function RuleRow({ label, met }) {
  const Check = icons.check;
  const tone = toneOf('emerald');

  return (
    <View
      // One line to a screen reader, not "image" then text: the tick is the
      // state, so it belongs in the same announcement as the rule.
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}${met ? ', done' : ', not yet'}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: met ? tone.dot : 'transparent',
          borderWidth: met ? 0 : 1.5,
          borderColor: color.border,
        }}
      >
        {met && Check ? <Check size={13} color={color.textOnBrand} /> : null}
      </View>
      <Text
        style={[
          text.small,
          { color: met ? color.textBody : color.textMuted, flexShrink: 1 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function NewPasswordScreen({ navigation, route }) {
  const { showToast } = useToast();
  const identifier = route?.params?.identifier || '';
  const context = route?.params?.context || 'forgot-password';
  const requestId = route?.params?.requestId || null;
  const otp = route?.params?.otp || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [revealConfirm, setRevealConfirm] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const focus = useFormFocus();
  const show = revealer(attempted);

  // TextField hands its focus() to the form guard through `registerFocus`, not
  // through a ref — the guard holds a function, never a component's internals.
  // This borrows the same channel so "next" on the first field can jump to the
  // second one, which is the only reason this screen needs it.
  const confirmFocus = useRef(null);
  const confirmRegister = useMemo(() => {
    const base = focus.register('confirm');
    return {
      ...base,
      registerFocus: (fn) => { confirmFocus.current = fn; base.registerFocus(fn); },
    };
  }, [focus]);

  const checks = useMemo(
    () => RULES.map((r) => ({ ...r, met: r.ok(password) })),
    [password],
  );

  const problems = useCallback(() => {
    const found = {};
    const unmet = RULES.find((r) => !r.ok(password));
    if (!password) found.password = 'Choose a new password.';
    else if (unmet) found.password = unmet.label;

    if (!confirm) found.confirm = 'Type the password again.';
    else if (confirm !== password) found.confirm = 'Both passwords must match.';
    return found;
  }, [password, confirm]);

  const submit = useCallback(async () => {
    if (busy) return;

    if (focus.focusFirstProblem(problems())) {
      setAttempted(true);
      setConfirmTouched(true);
      const prob = problems();
      const firstProblem = prob.password || prob.confirm;
      if (firstProblem) showToast(firstProblem, 'error');
      return;
    }

    setBusy(true);

    try {
      await authAPI.verifyForgotPasswordOtp({
        identifier,
        otp,
        context,
        requestId,
        newPassword: password,
      });

      showToast('Password updated. Sign in with your new password.', 'success');

      // Reset rather than navigate: the reset is finished, and leaving a dead
      // requestId on the stack means a back swipe lands on a form that can
      // only fail. No setBusy(false) — this screen is going away, and letting
      // the button flick back to "Reset password" first reads as a failure.
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (err) {
      const msg = authErrorMessage(err, 'Couldn’t reset your password. Please try again.');
      showToast(msg, 'error');
      setBusy(false);

      // The one failure this screen cannot fix — see the header.
      if (isCodeFailure(err)) {
        navigation.navigate('Otp', { identifier, context, requestId, rejected: true });
      }
    }
  }, [
    busy, focus, problems, showToast, identifier, otp, context, requestId,
    password, navigation,
  ]);

  const Lock = icons.locked;

  return (
    <AuthScreen
      title="Create new password"
      subtitle="Your new password must be different from the ones you’ve used before."
      onBack={() => navigation.goBack()}
      logo={false}
      footer={
        <View style={{ gap: space[4] }}>
          <Button
            title="Reset password"
            onPress={submit}
            icon={icons.arrowRight}
            iconRight
            loading={busy}
            fullWidth
            size="lg"
          />
          <StepDots step={3} />
        </View>
      }
    >
      <Field
        label="New password"
        wide
        error={show(problems().password)}
        register={focus.register('password')}
      >
        <TextField
          value={password}
          onChangeText={setPassword}
          kind="password"
          placeholder="Enter new password"
          left={Lock ? <Lock size={iconSize.md} color={color.textMuted} /> : undefined}
          editable={!busy}
          secureTextEntry={!reveal}
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmFocus.current?.()}
          right={
            <IconButton
              icon={reveal ? icons.eyeSlash : icons.view}
              accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
              onPress={() => setReveal((v) => !v)}
            />
          }
        />
      </Field>

      <View style={{ marginTop: space[4] }}>
        <Field
          label="Confirm new password"
          wide
          // Shown once the field has been left or the form submitted — see
          // the header.
          error={(confirmTouched || attempted) ? problems().confirm : undefined}
          register={confirmRegister}
        >
          <TextField
            value={confirm}
            onChangeText={setConfirm}
            onBlur={() => setConfirmTouched(true)}
            kind="password"
            placeholder="Confirm new password"
            left={Lock ? <Lock size={iconSize.md} color={color.textMuted} /> : undefined}
            editable={!busy}
            secureTextEntry={!revealConfirm}
            autoComplete="password-new"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
            right={
              <IconButton
                icon={revealConfirm ? icons.eyeSlash : icons.view}
                accessibilityLabel={revealConfirm ? 'Hide password' : 'Show password'}
                onPress={() => setRevealConfirm((v) => !v)}
              />
            }
          />
        </Field>
      </View>

      {/* ── The rules, ticking live ───────────────────────────────────────── */}
      <View style={{ marginTop: space[5], gap: space[3] }}>
        {checks.map((c) => <RuleRow key={c.key} label={c.label} met={c.met} />)}
      </View>

      <Text style={[text.caption, { color: color.textMuted, marginTop: space[4] }]}>
        Your organisation may ask for more than this.
      </Text>
    </AuthScreen>
  );
}

export { NewPasswordScreen };
