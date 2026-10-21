// ─────────────────────────────────────────────────────────────────────────────
// state/AuthContext.jsx — the session's whole lifecycle.
//
// Ported from shared/contexts/AuthContext.jsx. What it owns:
//   • hydrating a stored session at launch (no login flash)
//   • THE ROLE GATE — a non-employee never enters the app
//   • expiring on `exp`, and re-checking when the app returns to the
//     foreground (timers don't fire reliably while a phone sleeps)
//   • expiring on a 401 from anywhere (the client's session bus)
//   • the multi-org selection flow, whose selection_token is never persisted
//   • fetching the person's NAME — a login response and a JWT carry only an
//     id, a role and an identifier, so without this the app greets people by
//     their email address
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { authAPI, onSessionExpired, isTokenExpired, tokenExpiresAt } from '../api';
import {
  clearSession, isEmployeeApp, loadSession, saveSession, sessionFromToken, workspaceForRole,
} from './session';
// The imperative toast, straight from the module rather than the `ui` barrel:
// the auth layer must not pull in every screen component to say one sentence.
import { showToast } from '../ui/Toast';
import { clearMemoryCache } from '../lib/memoryCache';
import { clearImageCache } from '../lib/imageCache';

const AuthContext = createContext(null);

// setTimeout overflows past ~24.8 days; longer-lived tokens are re-checked on
// foreground instead.
const MAX_TIMER_MS = 2 ** 31 - 1;

// Longer than the root navigator's fade from the app shell to Login, so the
// shell never draws itself without a user (see endSession).
const SHELL_FADE_MS = 600;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // true until hydration finishes
  const [tokenExp, setTokenExp] = useState(null);

  // True after the session ended on its own (not via Sign out) — the login
  // screen explains why rather than just appearing.
  const [sessionExpired, setSessionExpired] = useState(false);

  // The role that was refused, for WrongWorkspaceScreen. Set only by the gate.
  const [refusedRole, setRefusedRole] = useState(null);

  // Multi-org selection. The selection token is MEMORY ONLY — it lives for
  // seconds and is never written to the Keychain.
  const [selection, setSelection] = useState(null); // { token, organizations[] }

  const mounted = useRef(true);
  // Bumped by every session start and end — see endSession.
  const sessionGen = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /**
   * Fetch the profile and merge it into `user`. THIS IS WHAT SUPPLIES THE NAME.
   *
   * Failure is non-fatal on purpose: every screen that shows a name already
   * falls back, and a profile read that times out must not cost somebody their
   * session.
   */
  const hydrateProfile = useCallback(() => {
    authAPI.me()
      .then((res) => {
        const profile = res?.data || res?.user;
        if (!profile || !mounted.current) return;
        // Keep the SESSION's user id: /organizations/me reuses the employee
        // detail view, whose `id` may be the profile row, and a changed id
        // makes the identity check below discard this profile on the next
        // token check.
        setUser((prev) => ({ ...prev, ...profile, id: prev?.id ?? profile.id }));
      })
      .catch(() => {
        // Non-fatal. Deliberately silent — the fallbacks handle it.
      });
  }, []);

  const applyToken = useCallback((token) => {
    const session = sessionFromToken(token);
    if (!session) return false;

    // ── THE GATE ──────────────────────────────────────────────────────────────
    // Exact match, fails closed. The backend will NOT stop a wrong-workspace
    // session, because every self-service endpoint accepts every tenant role.
    if (!isEmployeeApp(session.role)) {
      setRefusedRole(session.role || 'unknown');
      clearSession();
      setIsAuthenticated(false);
      setUser(null);
      setRole(null);
      setOrgId(null);
      return false;
    }

    setRefusedRole(null);
    sessionGen.current += 1; // a sign-out's pending wipe must not hit this session
    setIsAuthenticated(true);
    setRole(session.role);
    setOrgId(session.orgId);
    setUser((prev) => (prev?.id === session.user.id ? { ...prev, ...session.user } : session.user));
    setTokenExp(tokenExpiresAt(token));
    hydrateProfile();
    return true;
  }, [hydrateProfile]);

  /* ── SIGNING OUT IN TWO STEPS (2026-10-21) ─────────────────────────────────
     "Sign out is breaking ui in between." Everything used to be wiped in one
     render — and RootNavigator FADES the app shell out rather than cutting
     it, so for that fade the shell was still on screen with `role` already
     null: `workspace` went null, AppTabs drew nothing, and the greeting and
     avatar emptied. A blank, half-torn app, then Login.

     So `isAuthenticated` drops first (that is what starts the switch to
     Login, and the token is cleared below either way), and the person's
     identity is wiped once the shell has gone. `sessionGen` lets a sign-in
     inside that window cancel the wipe rather than lose its own user. */
  const endSession = useCallback(async ({ expired = false } = {}) => {
    // The cached profile and saved photos belong to this session (lib/
    // memoryCache.js, lib/imageCache.js) — never to the next person.
    clearMemoryCache();
    clearImageCache();
    setIsAuthenticated(false);
    setTokenExp(null);
    setSelection(null);
    setSessionExpired(expired);
    const gen = ++sessionGen.current;
    setTimeout(() => {
      if (gen !== sessionGen.current || !mounted.current) return;
      setUser(null);
      setRole(null);
      setOrgId(null);
    }, SHELL_FADE_MS);

    // Safely clear persistent session data in background
    try {
      await clearSession();
    } catch (err) {
      // THIS IS NOT A SILENT FAILURE (2026-10-17). It used to be a __DEV__
      // console.warn, which means that in a release build somebody taps Sign
      // out, the screen returns to Login — and their tokens are still in the
      // keychain on a device they may have just handed to somebody else. The
      // in-memory session IS gone, so the wording says exactly that much and
      // no more, and it goes through the house toast like every other error.
      if (__DEV__) console.warn('Failed to cleanly clear session:', err);
      showToast('Signed out, but we couldn’t clear the saved sign-in on this device.', 'error');
    }
  }, []);

  /* ── Launch hydration ─────────────────────────────────────────────────────
     The splash stays up until this finishes, so a returning user never sees
     the Login screen flash for 200ms — which reads as having been signed out. */
  useEffect(() => {
    let done = false;
    const safetyTimer = setTimeout(() => {
      if (!done) {
        done = true;
        setIsLoading(false);
      }
    }, 2000);

    (async () => {
      try {
        const stored = await loadSession();
        if (stored?.accessToken) {
          if (isTokenExpired(stored.accessToken)) {
            await clearSession();
            setSessionExpired(true);
          } else {
            applyToken(stored.accessToken);
          }
        }
      } catch (err) {
        if (__DEV__) console.warn('Launch hydration error:', err);
      } finally {
        if (!done) {
          done = true;
          clearTimeout(safetyTimer);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      clearTimeout(safetyTimer);
    };
  }, [applyToken]);

  /* ── Expiry: the timer, plus a foreground re-check ─────────────────────── */
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const check = () => {
      if (isTokenExpired()) endSession({ expired: true });
    };
    check();

    const ms = tokenExp != null ? tokenExp - Date.now() : null;
    const timer = ms != null && ms > 0 && ms < MAX_TIMER_MS ? setTimeout(check, ms + 500) : null;

    // Timers don't run reliably while the phone sleeps, so re-check whenever
    // the app comes back to the foreground.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });

    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [isAuthenticated, tokenExp, endSession]);

  /* ── Any 401 from anywhere ends the session ───────────────────────────── */
  useEffect(() => onSessionExpired(() => endSession({ expired: true })), [endSession]);

  /* ── Starting a session ───────────────────────────────────────────────── */

  // Login, org selection and org switch all answer in one of several shapes.
  const extractAuth = (res) => {
    if (!res) return null;
    const data = res.data || res;
    const userObj = data.user || res.user || (typeof data === 'object' && !data.requires_org_selection ? data : {});
    const accessToken =
      userObj?.accessToken || userObj?.access_token ||
      data?.accessToken || data?.access_token ||
      res?.accessToken || res?.access_token || data?.token || res?.token;
    const refreshToken =
      userObj?.refreshToken || userObj?.refresh_token ||
      data?.refreshToken || data?.refresh_token ||
      res?.refreshToken || res?.refresh_token;
    return { accessToken, refreshToken, user: userObj };
  };

  /**
   * Apply an auth response.
   * @returns {{ ok: boolean, needsOrg?: boolean, refused?: string }}
   */
  const startSession = useCallback(async (res) => {
    const data = res?.data || res || {};

    // Multi-org: nothing is stored, and the selection token stays in memory.
    if (data.requires_org_selection || data.selection_token) {
      setSelection({
        token: data.selection_token || data.selectionToken,
        organizations: data.organizations || data.orgs || [],
      });
      return { ok: false, needsOrg: true };
    }

    const auth = extractAuth(res);
    if (!auth?.accessToken) return { ok: false };

    // The gate runs BEFORE the token is persisted, so a refused account never
    // leaves anything on the device.
    const session = sessionFromToken(auth.accessToken);
    if (!session || !isEmployeeApp(session.role)) {
      setRefusedRole(session?.role || 'unknown');
      await clearSession();
      return { ok: false, refused: session?.role || 'unknown' };
    }

    // Best-effort: the session is live either way, and a Keystore that would
    // not take it is a “you’ll have to sign in again next time”, not a failed
    // sign-in (state/session.js). Saying so once beats letting somebody
    // discover it every morning.
    const remembered = await saveSession(auth.accessToken, auth.refreshToken);
    if (!remembered) {
      showToast(
        'Signed in. This device can’t save your sign-in, so you’ll need to do it again next time.',
        'info',
      );
    }
    setSessionExpired(false);
    setSelection(null);
    sessionGen.current += 1; // cancels a sign-out's pending wipe (endSession)
    clearMemoryCache(); // a new session (another org, say) starts with nothing cached
    setUser({ ...auth.user, ...session.user });
    setRole(session.role);
    setOrgId(session.orgId);
    setTokenExp(tokenExpiresAt(auth.accessToken));
    setIsAuthenticated(true);
    setRefusedRole(null);
    // Signing in, selecting an org and switching org all land here, and none
    // of those replies carries the person's name.
    hydrateProfile();
    return { ok: true };
  }, [hydrateProfile]);

  const login = useCallback(async (identifier, password) => {
    const res = await authAPI.login({ identifier, password });
    return startSession(res);
  }, [startSession]);

  const loginWithGoogle = useCallback(async (idToken) => {
    const res = await authAPI.googleAuth({ idToken });
    return startSession(res);
  }, [startSession]);

  const chooseOrganization = useCallback(async (orgIdToPick) => {
    if (!selection?.token) return { ok: false };
    const res = await authAPI.selectOrganization({ org_id: orgIdToPick }, selection.token);
    return startSession(res);
  }, [selection, startSession]);

  const switchOrganization = useCallback(async (orgIdToPick) => {
    const res = await authAPI.switchOrganization({ org_id: orgIdToPick });
    return startSession(res);
  }, [startSession]);

  const logout = useCallback(() => endSession({ expired: false }), [endSession]);

  const value = useMemo(() => ({
    user,
    role,
    orgId,
    workspace: workspaceForRole(role),
    isAuthenticated,
    isLoading,
    sessionExpired,
    refusedRole,
    selection,
    login,
    loginWithGoogle,
    chooseOrganization,
    switchOrganization,
    logout,
    // Re-read /organizations/me and merge it into `user`. The Profile screen
    // calls it after a save, so the Home greeting and the drawer's name show
    // the new display name without a restart.
    refreshProfile: hydrateProfile,
    clearRefusal: () => setRefusedRole(null),
    acknowledgeExpiry: () => setSessionExpired(false),
  }), [
    user, role, orgId, isAuthenticated, isLoading, sessionExpired, refusedRole, selection,
    login, loginWithGoogle, chooseOrganization, switchOrganization, logout, hydrateProfile,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
