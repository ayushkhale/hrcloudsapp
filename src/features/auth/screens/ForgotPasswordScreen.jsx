// ─────────────────────────────────────────────────────────────────────────────
// features/auth/screens/ForgotPasswordScreen.jsx — step 1 of 3.
//
// Spec: NativeRef/40-screens/01-auth.md § ForgotPassword.
//
// ── THE ONE SCREEN THAT CALLS authAPI DIRECTLY ───────────────────────────────
//
// Every other auth screen goes through AuthContext, because AuthContext owns
// the session. This flow starts no session — it asks for a code and hands a
// request handle to the next screen — so there is nothing for the context to
// own and routing it through would mean adding a method that touches no state.
//
// ── AN UNKNOWN ACCOUNT MUST LOOK EXACTLY LIKE A KNOWN ONE ────────────────────
//
// The API answers 200 either way, on purpose. Telling a stranger which email
// addresses exist is account enumeration: it turns a login form into a
// directory of who works here. So this screen does not branch on anything in
// the response, does not count organisations, and never says "no such
// account". It navigates to Otp regardless, and somebody who typed the wrong
// address simply never receives a code.
//
// ── THE BUTTON DOES NOT COME BACK FROM LOADING ───────────────────────────────
//
// `setBusy(false)` is NOT in a `finally`. On success this screen stays mounted
// for the whole push animation, so clearing the flag there made the spinner
// stop and the button snap back to "Send the code" for a beat before Otp slid
// over it — which reads as "it failed, press it again". The flag is cleared
// only on the paths that keep the person here: a validation stop and a caught
// error. Leaving it set on the way out is correct; the screen is leaving.
//
// ── THREE STEPS, THREE SCREENS ───────────────────────────────────────────────
//
// ForgotPassword → Otp → NewPassword. The code and the new password still go
// to the server in ONE call (there is no separate reset endpoint); the call
// simply happens on screen 3, which is where both halves of it are known. See
// NewPasswordScreen's header for how a stale code is handled.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { authAPI } from '../../../api';
import { useCountdown } from '../../../hooks/useCountdown';
import { useFormFocus } from '../../../hooks/useFormFocus';
import { authErrorMessage, isRateLimited, rateLimitSeconds } from '../../../lib/errors';
import { revealer, submitState } from '../../../lib/formGuard';
import { icons } from '../../../theme/icons';
import { color, iconSize, space, text } from '../../../theme/tokens';
import { Button, Field, LinkButton, TextField, useToast } from '../../../ui';
import { AuthScreen, StepDots } from '../components/AuthScreen';

const Mail = icons.mail;

export default function ForgotPasswordScreen({ navigation, route }) {
  const { showToast } = useToast();
  // Pre-filled from Login, so a reset doesn't begin by retyping an address.
  const [identifier, setIdentifier] = useState(route?.params?.identifier || '');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(null);

  const focus = useFormFocus();
  const secondsLeft = useCountdown(cooldownUntil);
  const show = revealer(attempted);

  const problems = useCallback(() => {
    const found = {};
    if (!identifier.trim()) found.identifier = 'Enter your email.';
    return found;
  }, [identifier]);

  const send = useCallback(async () => {
    if (busy || secondsLeft > 0) return;

    if (focus.focusFirstProblem(problems())) {
      setAttempted(true);
      const prob = problems();
      if (prob.identifier) showToast(prob.identifier, 'error');
      return;
    }

    setBusy(true);

    const trimmed = identifier.trim();

    try {
      const res = await authAPI.forgotPassword({ identifier: trimmed });
      const data = res?.data || res || {};

      // `context` and `requestId` are a REQUEST HANDLE, not credentials: they
      // identify which reset this is and they die with the code. Params are
      // the right place for them, unlike the selection token in SelectOrg.
      navigation.navigate('Otp', {
        identifier: trimmed,
        requestId: data.requestId || data.request_id || null,
        context: data.context || 'forgot-password',
      });
      // NO setBusy(false) here — see the header.
    } catch (err) {
      // A rate limit is the only failure worth a different shape of answer —
      // the person is doing the right thing, just too often.
      if (isRateLimited(err)) {
        setCooldownUntil(Date.now() + rateLimitSeconds(err) * 1000);
      }
      const msg = authErrorMessage(err, 'Couldn’t send the code. Please try again.');
      showToast(msg, 'error');
      setBusy(false);
    }
  }, [busy, secondsLeft, focus, problems, identifier, navigation, showToast]);

  const submit = submitState({ busy, cooldownUntil });

  return (
    <AuthScreen
      title="Forgot password?"
      subtitle="No worries. Enter your registered email and we’ll send you a 6-digit code to reset your password."
      onBack={() => navigation.goBack()}
      logo
      logoPaddingBottom={space[2]}
      footer={
        <View style={{ gap: space[4] }}>
          <Button
            title="Send the code"
            onPress={send}
            icon={icons.arrowRight}
            iconRight
            loading={busy}
            fullWidth
            size="lg"
            disabled={submit.disabled}
            disabledReason={
              secondsLeft > 0 ? `Try again in ${secondsLeft}s.` : submit.disabledReason
            }
          />
          <StepDots step={1} />
        </View>
      }
    >
      <Field
        label="Email"
        wide
        error={show(problems().identifier)}
        register={focus.register('identifier')}
      >
        <TextField
          value={identifier}
          onChangeText={(v) => setIdentifier(v ? v.toLowerCase() : v)}
          kind="email"
          autoComplete="email"
          placeholder="you@company.com"
          left={<Mail size={iconSize.md} color={color.textMuted} />}
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={send}
        />
      </Field>

      <View style={{ alignItems: 'center', marginTop: space[3] }}>
        <LinkButton title="Back to sign in" onPress={() => navigation.goBack()} />
      </View>

      <Text
        style={[
          text.caption,
          { textAlign: 'center', marginTop: space[3], color: color.textMuted },
        ]}
      >
        If an account exists for that address, the code is on its way.
      </Text>
    </AuthScreen>
  );
}

export { ForgotPasswordScreen };
