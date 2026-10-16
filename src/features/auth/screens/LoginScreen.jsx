// ─────────────────────────────────────────────────────────────────────────────
// features/auth/screens/LoginScreen.jsx
//
// Spec: NativeRef/40-screens/01-auth.md § Login.
//
// ── IT NEVER NAVIGATES ON SUCCESS ────────────────────────────────────────────
//
// `login()` resolving `ok` does not mean "go to Home". AuthContext flips
// `isAuthenticated`, and RootNavigator swaps AuthStack for AppTabs — the stack
// swap IS the navigation. A `navigate('AppTabs')` here races that unmount and
// crashes. This is the single most important line in the file, and it is a
// line that isn't here.
//
// The other two outcomes DO navigate, because they stay inside the auth stack:
// `needsOrg` → SelectOrg, `refused` → WrongWorkspace.
//
// ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────
//
// No Google button. The spec lists it as Phase 8, `@react-native-google-signin`
// is not a dependency, and `ENV.GOOGLE_WEB_CLIENT_ID` is blank — so a button
// here would be a control that cannot work. Absent, not broken (CLAUDE.md §2).
// `useAuth().loginWithGoogle` is already waiting for it.
//
// No "remember me": a native session survives a reboot by default, which is
// what the Keychain in state/session.js is for. No password-strength meter —
// that belongs on a reset, not a sign-in. No email-format regex: an employee
// code is a valid `identifier` and a regex would reject it. The server decides.
//
// No `autoFocus`. On a 390pt screen the keyboard opens over the Sign in
// button, and the person's first impression of the app is a form they have to
// scroll. The OS password manager still offers to fill, because
// `TextField kind="email"` sets the autofill hints that trigger it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { ENV } from '../../../config/env';
import { useCountdown } from '../../../hooks/useCountdown';
import { useFormFocus } from '../../../hooks/useFormFocus';
import {
  authErrorMessage,
  isAccountUnusable,
  isBadCredentials,
  isRateLimited,
  rateLimitSeconds,
} from '../../../lib/errors';
import { revealer, submitState } from '../../../lib/formGuard';
import { useAuth } from '../../../state/AuthContext';
import { icons } from '../../../theme/icons';
import { color, iconSize, space, text } from '../../../theme/tokens';
import {
  Button,
  Field,
  IconButton,
  InlineAlert,
  LinkButton,
  TextField,
} from '../../../ui';
import { AuthLegal, AuthScreen } from '../components/AuthScreen';

/* Pulled out of the render: `icons.mail` is a component, and reading it from
   the map inside JSX makes a new element type on every keystroke. */
const Mail = icons.mail;
const Locked = icons.locked;

export default function LoginScreen({ navigation }) {
  const { login, sessionExpired, acknowledgeExpiry } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);

  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  // The sentence above the form, for a failure the fields can't express.
  const [failure, setFailure] = useState(null);
  // A credential failure reddens BOTH boxes without printing a message under
  // either — the server never says which half was wrong, and guessing is how
  // people get told their email is wrong when the password was.
  const [credentialFailure, setCredentialFailure] = useState(false);
  // Absolute deadline, never a remaining count — see hooks/useCountdown.js.
  const [cooldownUntil, setCooldownUntil] = useState(null);

  // No scroll ref: this form is two boxes and cannot overflow, so there is
  // nothing to travel TO — the guard still reddens and focuses.
  const focus = useFormFocus();
  const passwordFocus = useRef(null);

  // Keep the guard's registration AND a handle of our own, so a 401 can put
  // the caret back in the password box.
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
  const show = revealer(attempted);

  const problems = useCallback(() => {
    const found = {};
    if (!identifier.trim()) found.identifier = 'Enter your email or phone number.';
    // NOT trimmed. Trailing spaces are legal characters in a password and
    // trimming silently breaks somebody's password manager entry.
    if (!password) found.password = 'Enter your password.';
    return found;
  }, [identifier, password]);

  /** Clears the "your session ended" notice the first time anything is typed. */
  const touch = useCallback(() => {
    if (sessionExpired) acknowledgeExpiry();
  }, [sessionExpired, acknowledgeExpiry]);

  const onIdentifier = useCallback((value) => {
    touch();
    setCredentialFailure(false);
    setFailure(null);
    setIdentifier(value);
  }, [touch]);

  const onPassword = useCallback((value) => {
    touch();
    setCredentialFailure(false);
    setFailure(null);
    setPassword(value);
  }, [touch]);

  const signIn = useCallback(async () => {
    if (busy || secondsLeft > 0) return;

    // §11: the press does the checking. It reveals what is missing, reddens
    // those boxes and travels to the first one — and sends nothing.
    if (focus.focusFirstProblem(problems())) {
      setAttempted(true);
      return;
    }

    setBusy(true);
    setFailure(null);
    setCredentialFailure(false);

    try {
      const result = await login(identifier.trim(), password);

      if (result?.ok) {
        // Nothing. RootNavigator's stack swap is the navigation. See the header.
        return;
      }
      if (result?.needsOrg) {
        navigation.navigate('SelectOrg');
        return;
      }
      if (result?.refused) {
        // The gate has already cleared the token; this screen only routes.
        navigation.navigate('WrongWorkspace', { role: result.refused });
        return;
      }

      // `login()` resolved without a token and without a reason — treat it as
      // a credential failure, which is the only thing it can be.
      setCredentialFailure(true);
      setPassword('');
      setFailure(authErrorMessage(null));
      passwordFocus.current?.();
    } catch (err) {
      if (isRateLimited(err)) {
        setCooldownUntil(Date.now() + rateLimitSeconds(err) * 1000);
        setFailure(authErrorMessage(err));
        return;
      }

      setFailure(authErrorMessage(err));

      // A locked or deactivated account is not a typo — leaving the boxes red
      // and the caret in the password invites a retry that cannot work.
      if (isAccountUnusable(err)) return;

      if (isBadCredentials(err)) {
        setCredentialFailure(true);
        setPassword('');
        passwordFocus.current?.();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, secondsLeft, focus, problems, login, identifier, password, navigation]);

  // Disabled is only for what a press cannot fix (§11). A rate limit is the
  // one case on this screen that qualifies — waiting is the only cure.
  const submit = submitState({ busy, cooldownUntil });

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to continue to your workspace."
      legal={<AuthLegal />}
    >
      {sessionExpired ? (
        <InlineAlert tone="blue" style={{ marginBottom: space[4] }}>
          Your session ended. Sign in to carry on.
        </InlineAlert>
      ) : null}

      {failure ? (
        <InlineAlert tone="rose" style={{ marginBottom: space[4] }}>
          {failure}
        </InlineAlert>
      ) : null}

      <View style={{ gap: space[4] }}>
        <Field
          // Email OR PHONE. Not an employee code: /auth/login takes an
          // `identifier` the endpoint registry defines as "email or phone",
          // and `employee_code` is a field on the PROFILE payload, not a
          // credential. Promising it here would send people to a 401.
          label="Email or phone"
          wide
          error={show(problems().identifier)}
          register={focus.register('identifier')}
        >
          <TextField
            value={identifier}
            onChangeText={onIdentifier}
            kind="email"
            // `username`, not `email`: the box takes a phone number too, and
            // a password manager offering only email addresses for it is a
            // dead end for everybody signing in with a number.
            autoComplete="username"
            placeholder="you@company.com or 9876543210"
            invalid={credentialFailure}
            editable={!busy}
            returnKeyType="next"
            onSubmitEditing={() => passwordFocus.current?.()}
            left={<Mail size={iconSize.md} color={color.textMuted} />}
          />
        </Field>

        <Field
          label="Password"
          wide
          error={show(problems().password)}
          register={passwordRegister}
        >
          <TextField
            value={password}
            onChangeText={onPassword}
            kind="password"
            placeholder="Your password"
            invalid={credentialFailure}
            editable={!busy}
            // `kind="password"` sets secureTextEntry; this overrides it for the
            // eye, because kindProps are spread before the rest.
            secureTextEntry={!reveal}
            returnKeyType="go"
            onSubmitEditing={signIn}
            left={<Locked size={iconSize.md} color={color.textMuted} />}
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

      <View style={{ alignItems: 'flex-end', marginTop: space[3] }}>
        <LinkButton
          title="Forgot your password?"
          // Carry what they just typed, so a reset doesn't start with retyping
          // an email address on a phone keyboard.
          onPress={() => navigation.navigate('ForgotPassword', { identifier: identifier.trim() })}
        />
      </View>

      <View style={{ marginTop: space[6] }}>
        <Button
          title="Sign in"
          onPress={signIn}
          loading={busy}
          fullWidth
          size="lg"
          icon={icons.arrowRight}
          iconRight
          disabled={submit.disabled}
          disabledReason={
            secondsLeft > 0 ? `Too many tries — try again in ${secondsLeft}s.` : submit.disabledReason
          }
        />
      </View>

      <Text style={[text.caption, { textAlign: 'center', marginTop: space[5], color: color.textMuted }]}>
        Your account is created by your HR team. Version {ENV.APP_VERSION}
      </Text>
    </AuthScreen>
  );
}

export { LoginScreen };
