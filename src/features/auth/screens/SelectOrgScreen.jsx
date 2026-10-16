// ─────────────────────────────────────────────────────────────────────────────
// features/auth/screens/SelectOrgScreen.jsx
//
// Spec: NativeRef/40-screens/01-auth.md § SelectOrg.
//
// One person, more than one organisation. Rare — most people never see this
// screen — but when it appears, getting it wrong means looking at somebody
// else's company, so it has to be unmissable rather than clever.
//
// ── NOTHING IS FETCHED ───────────────────────────────────────────────────────
//
// `useAuth().selection` already holds `{ token, organizations[] }` from the
// login response. There is no endpoint to list them and no loading state.
//
// ── THE SELECTION TOKEN IS NOT A ROUTE PARAM ─────────────────────────────────
//
// It lives in AuthContext state for the few seconds this screen is up, and it
// is never persisted and never passed through navigation. Navigation state
// ends up in crash reports and in the Android activity bundle; a bearer
// credential to payroll data must not. `chooseOrganization(id)` reaches into
// the context for it, which is why this screen only ever hands over an id.
//
// ── A NON-EMPLOYEE ORGANISATION IS STILL LISTED ──────────────────────────────
//
// If one of these organisations knows the person as an HR admin, the row is
// shown anyway, and picking it lands on WrongWorkspace. Refusing it here would
// be a second gate in a second place, with its own copy to drift — and
// WrongWorkspace is the one screen built to explain the refusal properly.
// Hiding it would be worse still: somebody who knows they have two workspaces
// would be left staring at a list missing one of them.
//
// ── NO ORG ID AND NO RAW ROLE ON SCREEN ──────────────────────────────────────
//
// `roleLabel('hr')` is "HR Admin" (CLAUDE.md §4). An id identifies the row for
// the API, never for the person reading it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useAuth } from '../../../state/AuthContext';
import { roleLabel } from '../../../state/session';
import { authErrorMessage, isSelectionExpired } from '../../../lib/errors';
import { color, space, text } from '../../../theme/tokens';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  InlineAlert,
  Row,
  Screen,
} from '../../../ui';
import { AuthBackdrop } from '../components/AuthScreen';

/* The organisation rows in a login response are not shape-documented in
   NativeRef/10-api/, so each field is read from the handful of spellings the
   gateway uses elsewhere rather than assuming one. */
const orgId = (org) => org?.id ?? org?.org_id ?? org?.organization_id ?? null;
const orgName = (org) =>
  org?.name || org?.organization_name || org?.organization?.name || 'Unnamed organisation';
const orgLogo = (org) =>
  org?.logo_url || org?.logo || org?.organization?.logo_url || null;
const orgRole = (org) => org?.role || org?.user_role || org?.membership_role || null;

/* Hoisted: a component defined inside render is a new type on every render,
   which throws away the list's row state. */
const RowSpacer = () => <View style={{ height: space[2] }} />;

export default function SelectOrgScreen({ navigation }) {
  const { selection, chooseOrganization, logout } = useAuth();

  // The id currently being spent, so that row alone shows a spinner and the
  // others stop taking presses.
  const [picking, setPicking] = useState(null);
  const [failure, setFailure] = useState(null);
  // The token is gone or stale: nothing on this screen can work any more.
  const [expired, setExpired] = useState(false);

  const organizations = useMemo(() => selection?.organizations || [], [selection]);

  const backToLogin = useCallback(() => {
    // Abandoning the selection must leave no half-session behind: logout()
    // drops the selection token with everything else.
    logout();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }, [logout, navigation]);

  const pick = useCallback(async (org) => {
    const id = orgId(org);
    if (picking || expired || !id) return;

    setPicking(id);
    setFailure(null);

    try {
      const result = await chooseOrganization(id);

      if (result?.ok) {
        // Nothing. AuthContext flips `isAuthenticated` and RootNavigator swaps
        // the stack — same rule as LoginScreen.
        return;
      }
      if (result?.refused) {
        navigation.navigate('WrongWorkspace', { role: result.refused });
        return;
      }

      // No token and no reason: the selection token is the only thing that can
      // have failed silently here.
      setExpired(true);
    } catch (err) {
      if (isSelectionExpired(err)) {
        setExpired(true);
        return;
      }
      setFailure(authErrorMessage(err, 'Couldn’t open that workspace. Please try again.'));
    } finally {
      setPicking(null);
    }
  }, [picking, expired, chooseOrganization, navigation]);

  /* ── The dead end ──────────────────────────────────────────────────────────
     The selection token lives for seconds. When it is spent there is nothing
     to retry — the only way on is a fresh sign-in. */
  if (expired || !selection) {
    return (
      <Screen background="transparent">
        <AuthBackdrop />
        <View style={{ marginTop: space[10] }}>
          <Text accessibilityRole="header" style={text.display}>Choose a workspace</Text>
        </View>

        <InlineAlert tone="rose" style={{ marginTop: space[4] }}>
          That took too long. Sign in again.
        </InlineAlert>

        <View style={{ marginTop: space[5] }}>
          <Button title="Back to sign in" onPress={backToLogin} fullWidth size="lg" />
        </View>
      </Screen>
    );
  }

  const header = (
    <View style={{ marginTop: space[10], marginBottom: space[5] }}>
      <Text accessibilityRole="header" style={text.display}>Choose a workspace</Text>
      <Text style={[text.body, { color: color.textSecondary, marginTop: space[2] }]}>
        Your account is in more than one organisation. Pick the one you want to open.
      </Text>

      {failure ? (
        <InlineAlert tone="rose" style={{ marginTop: space[4] }}>
          {failure}
        </InlineAlert>
      ) : null}
    </View>
  );

  return (
    // The backdrop is a SIBLING of Screen, not a child: Screen's content area
    // is the list, and anything decorative inside it would scroll away.
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <AuthBackdrop />

      {/* scroll={false}: the child is a FlatList, and a FlatList inside a
          ScrollView renders every row at once (ui/Screen.jsx header). */}
      <Screen
        scroll={false}
        background="transparent"
        footer={
          <Button title="Sign out" variant="ghost" onPress={backToLogin} fullWidth />
        }
      >
        <FlatList
          data={organizations}
          keyExtractor={(org, i) => String(orgId(org) ?? i)}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: space[4] }}
          ItemSeparatorComponent={RowSpacer}
          ListEmptyComponent={
            <EmptyState
              title="No workspaces to choose from"
              message="Your account isn’t in any organisation yet. Contact your HR administrator."
            />
          }
          renderItem={({ item }) => {
            const id = orgId(item);
            const busyThis = picking === id;
            const role = roleLabel(orgRole(item));
            const name = orgName(item);

            return (
              <Card padded={false}>
                <Row
                  title={name}
                  // The role in words, never the code, and never the org id.
                  subtitle={role || undefined}
                  accessibilityLabel={name}
                  left={
                    <Avatar person={{ name }} src={orgLogo(item)} size={40} />
                  }
                  // A press while another row is resolving would spend a token
                  // that is already being spent.
                  onPress={picking ? undefined : () => pick(item)}
                  disabled={!!picking && !busyThis}
                  actions={
                    busyThis ? <ActivityIndicator size="small" color={color.brand} /> : undefined
                  }
                />
              </Card>
            );
          }}
        />
      </Screen>
    </View>
  );
}

export { SelectOrgScreen };
