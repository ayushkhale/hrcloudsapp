// ─────────────────────────────────────────────────────────────────────────────
// navigation/AppTabs.jsx — the bottom tab bar and one native stack per tab.
//
// Built from `tabs.employee.js`, which is DATA. Nothing in this file names a
// screen or a tab; when the manager app arrives it supplies its own tab file
// and this renders it unchanged.
//
// ── WHY ONE STACK PER TAB AND NOT ONE SHARED STACK ───────────────────────────
//
// Each tab keeps its own history. Somebody three screens deep in Pay who taps
// Time and comes back expects to be where they left off — a shared stack loses
// that, and it also means the back gesture walks across unrelated screens.
//
// ── LABELS ARE ALWAYS SHOWN ──────────────────────────────────────────────────
//
// An icon-only tab bar makes people guess, and the guesses are wrong: a rupee
// glyph reads as "payments" (outgoing) at least as often as "my pay". Five
// short words cost 14pt of height and remove the guessing.
//
// ── ACTIVE IS SOLID, INACTIVE IS OUTLINE ─────────────────────────────────────
//
// Plus the colour change. Colour alone is not enough — it is the same reason
// StatusBadge always carries a word as well as a dot, and the inactive-outline
// convention is what both platforms already do.
//
// ── THE 2026-10-20 LOOK ──────────────────────────────────────────────────────
//
//  · The active tab's glyph sits in a tinted PILL (the reference tab bars) —
//    a third cue on top of solid-vs-outline and colour, and the one you can
//    see at arm's length.
//  · The ✚ is an INK disc, the same ink as the primary button: it is the
//    app's one "do something" control, and it out-weighs the five tabs.
//  · A pushed screen's header sits on the canvas with a ROUND WHITE BACK
//    BUTTON and the title beside it, left-aligned on both platforms — the
//    reference headers. The back button is ours (`HeaderBack`), not the
//    platform chevron, so it looks the same on iOS and Android; the iOS swipe
//    gesture is native-stack's and is unaffected by a custom headerLeft.
//  · Tab presses tick (selection haptic); the ✚ gives a medium one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { icons, tabIcons, iconFor } from '../theme/icons';
import { color, elevate, font, iconSize, radius } from '../theme/tokens';
import { haptic } from '../ui/haptics';
import { useAuth } from '../state/AuthContext';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../lib/events';
import { documentsAPI } from '../api';
import { listFrom } from '../lib/normalize';
import { tabsForWorkspace } from './tabs.employee';
import { screenFor } from './screens';
import { DrawerProvider, useDrawer } from './DrawerContext';
import { AppDrawer } from './AppDrawer';
import { ActionSheet } from './ActionSheet';
import { MayaProvider } from '../features/maya/MayaProvider';
import { setupPush } from '../features/notifications/push';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/** Header options, shared by every stack. On the canvas, no hairline. */
const headerOptions = {
  headerStyle: { backgroundColor: color.bg },
  headerShadowVisible: false,
  headerTitleAlign: 'left',
  headerTitleStyle: { fontFamily: font.bold, fontSize: 18, color: color.ink },
  headerTintColor: color.ink,
  headerBackTitleVisible: false, // iOS: chevron only
};

/** The round white back button every pushed screen wears. */
function HeaderBack({ onPress }) {
  const Back = icons.arrowLeft || icons.chevronLeft;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? color.brandSoftBg : color.surface,
        borderWidth: 1,
        borderColor: color.borderSubtle,
        // iOS puts headerLeft flush with the edge; Android insets it already.
        marginRight: Platform.OS === 'ios' ? 8 : 12,
        ...elevate('xs'),
      })}
    >
      {Back ? <Back size={iconSize.md} color={color.ink} /> : null}
    </Pressable>
  );
}

/** Per-screen header options: the shared ones plus our back button. */
const stackScreenOptions = ({ navigation }) => ({
  ...headerOptions,
  ...(navigation.canGoBack()
    ? { headerBackVisible: false, headerLeft: () => <HeaderBack onPress={navigation.goBack} /> }
    : null),
});

/** One tab's stack, generated from its screen list. */
function makeStack(tab) {
  function TabStack() {
    return (
      <Stack.Navigator screenOptions={stackScreenOptions}>
        {tab.screens.map((s) => (
          <Stack.Screen
            key={s.name}
            name={s.name}
            component={screenFor(s.name)}
            options={{
              // The header title, the tab label and the screen's own h1 are
              // the same words. That string lives in tabs.employee.js (§2).
              title: s.title,
              headerShown: s.headerShown !== false && s.presentation !== 'modal',
              presentation: s.presentation,
              // A modal form supplies its own header (FormSheet) with an X.
              ...(s.presentation === 'modal' ? { headerShown: false } : null),
              ...(s.name === 'Profile' ? { headerTintColor: color.textPrimary } : null),
            }}
          />
        ))}
      </Stack.Navigator>
    );
  }
  TabStack.displayName = `${tab.name}Stack`;
  return TabStack;
}

/**
 * The More badge: things waiting on the PERSON.
 *
 * Company documents they haven't acknowledged, plus document requests HR has
 * made of them. Not their own pending requests — see tabs.employee.js.
 *
 * It subscribes to the event bus, so an acknowledgement clears it WITHOUT A
 * RELOAD (CLAUDE.md §7). A queue whose decisions aren't emitted goes stale
 * until the app restarts.
 */
function useInboxCount() {
  const [count, setCount] = useState(0);

  const load = React.useCallback(async () => {
    try {
      const [issued, reqs] = await Promise.all([
        // `compliance_state` is the server's own word for "this one still
        // needs the employee" — asking for pending and overdue separately
        // would be two requests for one number.
        documentsAPI.getMyIssuedDocuments({ compliance_state: 'pending', limit: 50 }).catch(() => null),
        // `open` + `overdue` — a request is never `pending`, so asking for
        // that counted nothing (fixed 2026-10-20).
        documentsAPI.getMyDocumentRequests({ status: ['open', 'overdue'], limit: 1 }).catch(() => null),
      ]);
      const ackCount = issued ? listFrom(issued, ['documents', 'issued_documents']).length : 0;
      // `limit: 1` keeps the payload tiny; the TOTAL is the number we want.
      // Both pagination spellings are checked — the two halves of the gateway
      // disagree (10-api/05-contract-traps.md).
      const reqCount = Number(
        reqs?.data?.pagination?.total
        ?? reqs?.data?.pagination?.total_count
        ?? reqs?.data?.total
        ?? 0,
      ) || 0;
      setCount(ackCount + reqCount);
    } catch {
      // A badge is never worth an error state. No number is better than a
      // wrong one, and the screens themselves report their own failures.
      setCount(0);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAttendanceChanged(
    [ATTENDANCE_EVENTS.ACKNOWLEDGEMENT, ATTENDANCE_EVENTS.DOCUMENT_REQUEST],
    load,
  );

  return count;
}

function DrawerOverlay() {
  const { open, closeDrawer } = useDrawer();
  return <AppDrawer open={open} onClose={closeDrawer} />;
}

const styles = StyleSheet.create({
  centerButtonContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevate('md'),
  },
  // Scale only — opacity over an elevated view is the Android grey flash.
  centerButtonPressed: {
    transform: [{ scale: 0.92 }],
  },
  activePill: {
    width: 54,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function CenterActionButton({ onPress, ...rest }) {
  const Glyph = icons.add;
  return (
    <Pressable
      {...rest}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Quick actions"
      style={styles.centerButtonContainer}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.centerButtonCircle,
            pressed ? styles.centerButtonPressed : null,
          ]}
        >
          <Glyph size={24} color={color.textOnBrand} />
        </View>
      )}
    </Pressable>
  );
}

const DummyActionScreen = () => null;

function renderTabScreen(tab, inbox, tabBarStyle) {
  const pair = tabIcons[tab.icon];
  const rootName = tab.screens[0]?.name;
  return (
    <Tab.Screen
      key={tab.name}
      name={tab.name}
      component={tab.Component}
      options={({ route }) => ({
        // ONLY A TAB ROOT SHOWS THE TAB BAR (user, 2026-10-20: "the screens
        // which are not present on tabs should be stack screens, why header
        // and bottom tabs appear on them?"). A pushed screen — Devices,
        // Profile, a task — is a stack page with its own back header; the bar
        // comes back the moment you are on the tab's root again.
        tabBarStyle: (getFocusedRouteNameFromRoute(route) ?? rootName) === rootName
          ? tabBarStyle
          : { display: 'none' },
        tabBarLabel: tab.label,
        tabBarAccessibilityLabel: tab.label,
        tabBarIcon: ({ focused, color: tint, size }) => {
          const Glyph = focused
            ? (pair?.active || iconFor(tab.icon))
            : (pair?.inactive || iconFor(tab.icon));
          if (!Glyph) return null;
          return (
            <View style={[styles.activePill, { backgroundColor: focused ? color.brandChipBg : 'transparent' }]}>
              <Glyph size={size ? Math.min(size, 22) : 22} color={tint} />
            </View>
          );
        },
        ...(tab.badge === 'inbox' && inbox > 0
          ? {
            tabBarBadge: inbox,
            tabBarBadgeStyle: {
              backgroundColor: color.danger.dot,
              color: color.textOnBrand,
              fontFamily: font.bold,
              fontSize: 10,
            },
          }
          : null),
      })}
    />
  );
}

export function AppTabs() {
  const { workspace } = useAuth();
  const insets = useSafeAreaInsets();
  const inbox = useInboxCount();
  const [actionsOpen, setActionsOpen] = useState(false);

  const bottomPadding = Math.max(insets.bottom, 14);
  const tabBarStyle = {
    height: 64 + bottomPadding,
    paddingTop: 8,
    paddingBottom: bottomPadding,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.borderSubtle,
    elevation: 0,
  };

  // Push is set up once the person is in the app (signed in): ask for the
  // notification permission, log the FCM token, listen for messages. A no-op if
  // Firebase isn't built in yet (push.js). Unsubscribes on sign-out/unmount.
  useEffect(() => {
    let cleanup = () => {};
    setupPush().then((fn) => { cleanup = fn || (() => {}); });
    return () => cleanup();
  }, []);

  // `null` for an unknown workspace rather than a default. The gate upstream
  // means this can't happen — and if it ever does, an empty navigator is the
  // right failure, not somebody else's tabs (§2).
  const tabs = tabsForWorkspace(workspace);

  const stacks = useMemo(
    () => (tabs || []).map((tab) => ({ ...tab, Component: makeStack(tab) })),
    [tabs],
  );

  if (!tabs) return null;

  return (
    <DrawerProvider>
      <View style={{ flex: 1 }}>
        <Tab.Navigator
          initialRouteName="HomeTab"
          // `initialRoute`, NOT `firstRoute`. They were the same thing while
          // Home was first in the tab set; Home is now the CENTRE tab
          // (tabs.employee.js), so `firstRoute` would send a back press to My
          // Time and a second one would exit from there. Back goes home, and
          // home is where back exits from.
          backBehavior="initialRoute"
          // A tick on every tab change (ui/haptics.js 'selection'). The ✚
          // tab has its own listener below and gives a heavier one.
          screenListeners={({ route }) => ({
            tabPress: () => { if (route.name !== 'ActionCenter') haptic('selection'); },
          })}
          screenOptions={{
            headerShown: false, // each stack draws its own header
            tabBarActiveTintColor: color.brand,
            tabBarInactiveTintColor: color.textMuted,
            tabBarStyle,
            tabBarLabelStyle: { fontFamily: font.bold, fontSize: 11, letterSpacing: 0.2 },
            tabBarHideOnKeyboard: true,
          }}
        >
          {stacks.slice(0, 2).map((tab) => renderTabScreen(tab, inbox, tabBarStyle))}

          <Tab.Screen
            name="ActionCenter"
            component={DummyActionScreen}
            listeners={{
              tabPress: (e) => {
                e.preventDefault();
                haptic('medium');
                setActionsOpen(true);
              },
            }}
            options={{
              tabBarShowLabel: false,
              tabBarButton: CenterActionButton,
            }}
          />

          {stacks.slice(2).map((tab) => renderTabScreen(tab, inbox, tabBarStyle))}
        </Tab.Navigator>
        <DrawerOverlay />
        <ActionSheet visible={actionsOpen} onClose={() => setActionsOpen(false)} />
        {/* Maya mounts once here, over every tab (features/maya/MayaProvider). */}
        <MayaProvider />
      </View>
    </DrawerProvider>
  );
}

export { headerOptions, stackScreenOptions, HeaderBack };
export default AppTabs;
