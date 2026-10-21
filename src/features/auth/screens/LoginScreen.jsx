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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
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
import { color, font, space } from '../../../theme/tokens';
import {
  Button,
  Field,
  TextField,
  useToast,
} from '../../../ui';
import { AuthLegal, AuthScreen } from '../components/AuthScreen';

const Eye = icons.view;
const EyeSlash = icons.eyeSlash;

/** Official Google multi-color G icon */
function GoogleIcon({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </Svg>
  );
}

export default function LoginScreen({ navigation }) {
  const { login, sessionExpired, acknowledgeExpiry } = useAuth();
  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);

  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
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
    if (!identifier.trim()) found.identifier = 'Enter your email.';
    // NOT trimmed. Trailing spaces are legal characters in a password and
    // trimming silently breaks somebody's password manager entry.
    if (!password) found.password = 'Enter your password.';
    return found;
  }, [identifier, password]);

  /* ── THE SPINNER STOPS WHEN THIS SCREEN IS LOOKED AT AGAIN (2026-10-18) ──
     `signIn` deliberately leaves `busy` true on every path that LEAVES this
     screen, so the button doesn't flicker back to "Sign In" mid-transition
     (see the end of signIn). That is right while the screen is going away —
     and wrong the moment it comes back.

     It came back three ways: the back gesture out of SelectOrg, "Sign in as
     someone else" from WrongWorkspace, and signing out. Each returned a
     Login screen with a dead spinner on the button and no way to clear it
     but killing the app. Reported as "the Sign in button keeps loading".

     Focus is the exact moment to undo it: it never fires during the
     transition away, and it always fires on the way back. */
  useFocusEffect(
    useCallback(() => { setBusy(false); }, []),
  );

  /** Clears the "your session ended" notice the first time anything is typed. */
  useEffect(() => {
    if (sessionExpired) {
      showToast('Your session ended. Sign in to carry on.', 'info');
      acknowledgeExpiry();
    }
  }, [sessionExpired, acknowledgeExpiry, showToast]);

  const onIdentifier = useCallback((value) => {
    setCredentialFailure(false);
    setIdentifier(value ? value.toLowerCase() : value);
  }, []);

  const onPassword = useCallback((value) => {
    setCredentialFailure(false);
    setPassword(value);
  }, []);

  const onGoogleSignIn = useCallback(() => {
    showToast('Google Sign In is available for active employee accounts.', 'info');
  }, [showToast]);

  const signIn = useCallback(async () => {
    if (busy || secondsLeft > 0) return;

    // §11: the press does the checking. It reveals what is missing, reddens
    // those boxes and travels to the first one — and sends nothing.
    if (focus.focusFirstProblem(problems())) {
      setAttempted(true);
      const prob = problems();
      const firstProblem = prob.identifier || prob.password;
      if (firstProblem) showToast(firstProblem, 'error');
      return;
    }

    setBusy(true);
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
      setBusy(false);
      setCredentialFailure(true);
      setPassword('');
      const msg = authErrorMessage(null);
      showToast(msg, 'error');
      passwordFocus.current?.();
    } catch (err) {
      setBusy(false);
      const msg = authErrorMessage(err);
      if (isRateLimited(err)) {
        setCooldownUntil(Date.now() + rateLimitSeconds(err) * 1000);
        showToast(msg, 'error');
        return;
      }

      showToast(msg, 'error');

      // A locked or deactivated account is not a typo — leaving the boxes red
      // and the caret in the password invites a retry that cannot work.
      if (isAccountUnusable(err)) return;

      if (isBadCredentials(err)) {
        setCredentialFailure(true);
        setPassword('');
        passwordFocus.current?.();
      }
    }
    // NO `finally { setBusy(false) }`. Every path that LEAVES this screen —
    // a successful sign-in (the root stack swaps), SelectOrg, WrongWorkspace —
    // keeps the button in its loading state, because this screen stays mounted
    // for the whole transition and a spinner that stops mid-animation reads as
    // "it failed, press it again". The flag is cleared only on the paths where
    // the person stays here and can press again.
  }, [busy, secondsLeft, focus, problems, login, identifier, password, navigation, showToast]);

  // Disabled is only for what a press cannot fix (§11). A rate limit is the
  // one case on this screen that qualifies — waiting is the only cure.
  const submit = submitState({ busy, cooldownUntil });

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to your HR Clouds account"
      logoPaddingBottom={space[10]}
      legal={<AuthLegal />}
    >
      {/* ── Email & Password inputs ────────────────────────────────────── */}
      <View style={styles.formContainer}>
        <Field
          label="Email Address"
          required
          wide
          labelStyle={styles.fieldLabel}
          error={show(problems().identifier)}
          register={focus.register('identifier')}
        >
          <TextField
            value={identifier}
            onChangeText={onIdentifier}
            kind="email"
            autoComplete="email"
            placeholder="yourmail@gmail.com"
            placeholderTextColor="#94A3B8"
            invalid={credentialFailure}
            editable={!busy}
            returnKeyType="next"
            onSubmitEditing={() => passwordFocus.current?.()}
            style={[
              styles.inputBox,
              { borderColor: credentialFailure || show(problems().identifier) ? color.danger.dot : '#CBD5E1' },
            ]}
            inputStyle={styles.inputText}
          />
        </Field>

        <Field
          label="Password"
          required
          wide
          labelStyle={styles.fieldLabel}
          labelRight={
            <Pressable
              onPress={() => navigation.navigate('ForgotPassword', { identifier: identifier.trim() })}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
              // Two words at 13pt sitting in a label row is a ~17pt target, so
              // the link only answered a press that landed on the letters
              // themselves. The padding widens the real box; the asymmetric
              // hitSlop takes it past 44pt without pushing the label row
              // taller or letting the slop reach back over the "Password"
              // label on its left.
              style={({ pressed }) => ({
                paddingVertical: space[2],
                paddingLeft: space[4],
                opacity: pressed ? 0.6 : 1,
              })}
              hitSlop={{ top: 12, bottom: 12, left: 4, right: 12 }}
            >
              <Text style={styles.forgotPasswordText}>
                Forgot password?
              </Text>
            </Pressable>
          }
          error={show(problems().password)}
          register={passwordRegister}
        >
          <TextField
            value={password}
            onChangeText={onPassword}
            kind="password"
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            invalid={credentialFailure}
            editable={!busy}
            secureTextEntry={!reveal}
            returnKeyType="go"
            onSubmitEditing={signIn}
            style={[
              styles.inputBox,
              { borderColor: credentialFailure || show(problems().password) ? color.danger.dot : '#CBD5E1' },
            ]}
            inputStyle={styles.inputText}
            right={
              <Pressable
                onPress={() => setReveal((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
                hitSlop={12}
                style={styles.eyeButton}
              >
                {reveal ? (
                  <EyeSlash size={20} color="#64748B" />
                ) : (
                  <Eye size={20} color="#64748B" />
                )}
              </Pressable>
            }
          />
        </Field>
      </View>

      {/* ── Sign In Button ─────────────────────────────────────────────── */}
      <View style={styles.submitContainer}>
        <Button
          title="Sign In"
          onPress={signIn}
          loading={busy}
          fullWidth
          size="lg"
          disabled={submit.disabled}
          disabledReason={
            secondsLeft > 0 ? `Too many tries — try again in ${secondsLeft}s.` : submit.disabledReason
          }
          style={styles.signInButton}
          textStyle={styles.signInButtonText}
        />
      </View>

      {/* ── Divider ────────────────────────────────────────────────────── */}
      <View style={styles.dividerContainer}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>
          or continue with
        </Text>
        <View style={styles.dividerLine} />
      </View>

      {/* ── Sign in with Google Button ──────────────────────────────────── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign in with Google"
        onPress={onGoogleSignIn}
        style={({ pressed }) => [
          styles.googleButton,
          { backgroundColor: pressed ? '#F8FAFC' : '#FFFFFF' },
        ]}
      >
        <GoogleIcon size={20} />
        <Text style={styles.googleButtonText}>
          Sign in with Google
        </Text>
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: space[3],
  },
  googleButtonText: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: '#1E293B',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: space[5],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: space[3],
    fontFamily: font.medium,
    fontSize: 13,
    color: '#94A3B8',
  },
  formContainer: {
    gap: space[4],
    marginTop: space[4],
  },
  fieldLabel: {
    textTransform: 'none',
    fontSize: 14,
    fontFamily: font.medium,
    color: '#1E293B',
  },
  forgotPasswordText: {
    fontFamily: font.semibold,
    fontSize: 13.5,
    color: '#8B5CF6',
  },
  inputBox: {
    backgroundColor: '#EEF2F6',
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  inputText: {
    fontSize: 15,
    fontFamily: font.medium,
    color: '#0F172A',
  },
  eyeButton: {
    padding: 4,
  },
  submitContainer: {
    marginTop: space[6],
  },
  signInButton: {
    borderRadius: 10,
    height: 48,
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  signInButtonText: {
    fontSize: 16,
    fontFamily: font.bold,
  },
});

export { LoginScreen };

