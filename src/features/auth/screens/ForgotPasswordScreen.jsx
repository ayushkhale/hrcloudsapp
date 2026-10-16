// ─────────────────────────────────────────────────────────────────────────────
// features/auth/screens/ForgotPasswordScreen.jsx
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
// That is why there is no success state here either. A "check your email"
// panel on THIS screen would have to be shown for an address that will never
// get a mail — the next screen says it instead, where it is also the place
// you type the code.
//
// ── TWO STEPS, TWO SCREENS ───────────────────────────────────────────────────
//
// The new password is NOT asked for here. It is set by the verify call on the
// Otp screen — there is no separate reset endpoint. Asking for it before the
// code arrives means typing it twice when the code never comes.
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
import { Button, Field, InlineAlert, LinkButton, TextField } from '../../../ui';
import { AuthScreen } from '../components/AuthScreen';

const Mail = icons.mail;

export default function ForgotPasswordScreen({ navigation, route }) {
  // Pre-filled from Login, so a reset doesn't begin by retyping an address.
  const [identifier, setIdentifier] = useState(route?.params?.identifier || '');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [cooldownUntil, setCooldownUntil] = useState(null);

  const focus = useFormFocus();
  const secondsLeft = useCountdown(cooldownUntil);
  const show = revealer(attempted);

  const problems = useCallback(() => {
    const found = {};
    if (!identifier.trim()) found.identifier = 'Enter your email or phone number.';
    return found;
  }, [identifier]);

  const send = useCallback(async () => {
    if (busy || secondsLeft > 0) return;

    if (focus.focusFirstProblem(problems())) {
      setAttempted(true);
      return;
    }

    setBusy(true);
    setFailure(null);

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
    } catch (err) {
      // A rate limit is the only failure worth a different shape of answer —
      // the person is doing the right thing, just too often.
      if (isRateLimited(err)) {
        setCooldownUntil(Date.now() + rateLimitSeconds(err) * 1000);
      }
      setFailure(authErrorMessage(err, 'Couldn’t send the code. Please try again.'));
    } finally {
      setBusy(false);
    }
  }, [busy, secondsLeft, focus, problems, identifier, navigation]);

  const submit = submitState({ busy, cooldownUntil });

  return (
    <AuthScreen
      title="Reset your password"
      subtitle="We’ll send a 6-digit code to the email or phone on your account."
      onBack={() => navigation.goBack()}
      logo={false}
    >

      {failure ? (
        <InlineAlert tone="rose" style={{ marginBottom: space[4] }}>
          {failure}
        </InlineAlert>
      ) : null}

      <Field
        label="Email or phone"
        wide
        error={show(problems().identifier)}
        register={focus.register('identifier')}
      >
        <TextField
          value={identifier}
          onChangeText={(v) => { setFailure(null); setIdentifier(v); }}
          kind="email"
          autoComplete="username"
          placeholder="you@company.com or 9876543210"
          left={<Mail size={iconSize.md} color={color.textMuted} />}
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={send}
        />
      </Field>

      <View style={{ marginTop: space[5] }}>
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
      </View>

      <View style={{ alignItems: 'center', marginTop: space[4] }}>
        <LinkButton title="Back to sign in" onPress={() => navigation.goBack()} />
      </View>

      <Text
        style={[
          text.caption,
          { textAlign: 'center', marginTop: space[6], color: color.textMuted },
        ]}
      >
        If an account exists for that address, the code is on its way.
      </Text>
    </AuthScreen>
  );
}

export { ForgotPasswordScreen };
