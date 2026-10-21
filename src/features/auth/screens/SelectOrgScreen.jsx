// ─────────────────────────────────────────────────────────────────────────────
// features/auth/screens/SelectOrgScreen.jsx
//
// Spec: NativeRef/40-screens/01-auth.md § SelectOrg.
//
// One person, more than one organisation. Rare — most people never see this
// screen — but when it appears, getting it wrong means looking at somebody
// else's company, so it has to be unmissable rather than clever.
//
// ── PICK THEN CONFIRM, NOT PICK-IS-GO ───────────────────────────────────────
//
// The row selects; the Continue button at the foot commits. The earlier
// version spent the selection token on the first tap, which is the wrong trade
// HERE even though it is the right one for most lists: the token is
// single-use and lives for seconds, so a mis-tap does not open the wrong
// workspace — it ends the session and sends the person back to sign in. A
// second tap is cheap next to that, and it is what the reference composition
// does. (Everywhere else in the app, a row still opens its thing directly —
// ui/Row.jsx's rule is unchanged.)
//
// ── THE SEARCH BOX APPEARS ONLY WHEN IT EARNS ITS PLACE ─────────────────────
//
// Five or fewer organisations fit on a phone without scrolling, and a search
// box above five rows is furniture. The realistic case for this screen is two
// or three.
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
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { useAuth } from '../../../state/AuthContext';
import { roleLabel } from '../../../state/session';
import { authErrorMessage, isSelectionExpired } from '../../../lib/errors';
import { color, iconSize, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button,
  EmptyState,
  IconTile,
  InlineAlert,
  Screen,
  TextField,
  useToast,
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
/* The reference composition shows a domain under each name. Our login response
   may or may not carry one, so the second line falls back to the ROLE IN WORDS
   — which is the more useful line anyway when somebody has two memberships of
   the same company. Never the id. */
const orgDomain = (org) =>
  org?.domain || org?.subdomain || org?.organization?.domain || org?.slug || null;

/** Show the search box only above this many rows — see the header. */
const SEARCH_THRESHOLD = 5;

/* Hoisted: a component defined inside render is a new type on every render,
   which throws away the list's row state. */
const RowSpacer = () => <View style={{ height: space[2] }} />;

/* ─── One organisation ────────────────────────────────────────────────────── */

function OrgRow({ org, selected, disabled, onPress }) {
  const name = orgName(org);
  const logo = orgLogo(org);
  const second = orgDomain(org) || roleLabel(orgRole(org)) || null;
  const Check = icons.check;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={second ? `${name}, ${second}` : name}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[3],
        borderRadius: radius.lg,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? color.brand : color.border,
        backgroundColor: selected
          ? color.brandSoftBg
          : pressed ? color.pressTint : color.surface,
        opacity: disabled ? 0.55 : 1,
      })}
    >
      {/* A real logo when there is one; the building glyph when there isn't.
          Avatar's initials circle is for PEOPLE — a two-letter monogram where
          a company logo goes reads as a person's account. */}
      {logo ? (
        <Image
          source={{ uri: logo }}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: color.surfaceSubtle,
          }}
        />
      ) : (
        <IconTile icon={icons.office} tone={selected ? 'purple' : 'slate'} size="md" />
      )}

      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={text.bodyStrong}>{name}</Text>
        {second ? <Text numberOfLines={1} style={text.small}>{second}</Text> : null}
      </View>

      {/* The radio. Filled-and-ticked when chosen, a hollow ring when not —
          the tick is what makes the state readable without relying on the
          purple fill alone. */}
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: selected ? 0 : 2,
          borderColor: color.border,
          backgroundColor: selected ? color.brand : 'transparent',
        }}
      >
        {selected && Check ? <Check size={14} color={color.textOnBrand} /> : null}
      </View>
    </Pressable>
  );
}

/* ─── The screen ──────────────────────────────────────────────────────────── */

export default function SelectOrgScreen({ navigation }) {
  const { selection, chooseOrganization, logout } = useAuth();
  const { showToast } = useToast();

  const [chosen, setChosen] = useState(null);
  const [query, setQuery] = useState('');
  // The token is being spent: the button shows a spinner and the rows stop
  // taking presses.
  const [busy, setBusy] = useState(false);
  // The token is gone or stale: nothing on this screen can work any more.
  const [expired, setExpired] = useState(false);

  const organizations = useMemo(() => selection?.organizations || [], [selection]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((org) => {
      const haystack = `${orgName(org)} ${orgDomain(org) || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [organizations, query]);

  const backToLogin = useCallback(() => {
    // Abandoning the selection must leave no half-session behind: logout()
    // drops the selection token with everything else.
    logout();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }, [logout, navigation]);

  const submit = useCallback(async () => {
    if (busy || expired) return;

    const org = organizations.find((o) => orgId(o) === chosen);
    const id = orgId(org);
    // The button stays live with nothing chosen, so this is where it says what
    // is missing. A silent return here would be the dead press the live-button
    // rule exists to avoid.
    if (!id) {
      showToast('Choose a company to continue.', 'info');
      return;
    }

    setBusy(true);

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
      setBusy(false);
      setExpired(true);
    } catch (err) {
      setBusy(false);
      if (isSelectionExpired(err)) {
        setExpired(true);
        return;
      }
      const msg = authErrorMessage(err, 'Couldn’t open that workspace. Please try again.');
      showToast(msg, 'error');
    }
    // No `finally`: the two paths that leave (the stack swap, WrongWorkspace)
    // keep the button loading until this screen is gone — same reason as
    // LoginScreen.
  }, [organizations, chosen, busy, expired, chooseOrganization, navigation, showToast]);

  /* ── The dead end ──────────────────────────────────────────────────────────
     The selection token lives for seconds. When it is spent there is nothing
     to retry — the only way on is a fresh sign-in. */
  if (expired || !selection) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <AuthBackdrop />
        <Screen background="transparent">
          <View style={{ marginTop: space[10] }}>
            <Text accessibilityRole="header" style={text.display}>Select your company</Text>
          </View>

          <InlineAlert tone="rose" style={{ marginTop: space[4] }}>
            That took too long. Sign in again.
          </InlineAlert>

          <View style={{ marginTop: space[5] }}>
            <Button title="Back to sign in" onPress={backToLogin} fullWidth size="lg" />
          </View>
        </Screen>
      </View>
    );
  }

  const Chevron = icons.chevronLeft;
  const Search = icons.search;

  const header = (
    <View style={{ paddingBottom: space[5], gap: space[4] }}>
      {/* The circular back chevron, the same one AuthScreen draws. The auth
          stack runs headerShown: false, so a native bar would put a grey strip
          over the backdrop. */}
      <Pressable
        onPress={backToLogin}
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
        hitSlop={12}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? color.surfaceSubtle : color.surface,
          borderWidth: 1,
          borderColor: color.border,
        })}
      >
        {Chevron ? <Chevron size={iconSize.md} color={color.textPrimary} /> : null}
      </Pressable>

      <View style={{ gap: space[2] }}>
        <Text accessibilityRole="header" style={text.display}>
          {'Select your\ncompany'}
        </Text>
        <Text style={[text.body, { color: color.textSecondary }]}>
          Your account is in more than one organisation. Choose the one you want to open.
        </Text>
      </View>

      {organizations.length > SEARCH_THRESHOLD ? (
        <TextField
          kind="search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search company or domain"
          accessibilityLabel="Search your organisations"
          left={Search ? <Search size={iconSize.sm} color={color.textMuted} /> : null}
        />
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
          <View style={{ gap: space[2] }}>
            <Button
              title="Continue"
              onPress={submit}
              loading={busy}
              // Live with nothing chosen, on purpose (ui/Button.jsx rule 2):
              // a dead button cannot say WHY it is dead. It validates on the
              // press instead and says what is missing.
              icon={icons.arrowRight}
              iconRight
              fullWidth
              size="lg"
            />
            <Button title="Sign out" variant="ghost" onPress={backToLogin} fullWidth />
          </View>
        }
      >
        <FlatList
          data={visible}
          keyExtractor={(org, i) => String(orgId(org) ?? i)}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingTop: space[6], paddingBottom: space[4], flexGrow: 1 }}
          ItemSeparatorComponent={RowSpacer}
          keyboardShouldPersistTaps="handled"
          accessibilityRole="radiogroup"
          ListEmptyComponent={
            query ? (
              <EmptyState
                filtered
                title="No match"
                message="No organisation matches what you typed. Check the spelling, or clear the search."
                action={<Button title="Clear search" variant="soft" onPress={() => setQuery('')} />}
              />
            ) : (
              <EmptyState
                title="No workspaces to choose from"
                message="Your account isn’t in any organisation yet. Contact your HR administrator."
              />
            )
          }
          renderItem={({ item }) => {
            const id = orgId(item);
            return (
              <OrgRow
                org={item}
                selected={chosen === id}
                disabled={busy}
                onPress={() => setChosen(id)}
              />
            );
          }}
        />
      </Screen>
    </View>
  );
}

export { SelectOrgScreen };
