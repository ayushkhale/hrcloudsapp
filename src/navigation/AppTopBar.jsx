import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../state/AuthContext';
import { greetingFor } from '../lib/dates';
import { color, elevate, gutter, iconSize, radius, space, text } from '../theme/tokens';
import { icons } from '../theme/icons';
import { Avatar } from '../ui';
import { DrawerButton } from './AppDrawer';
import { useDrawer } from './DrawerContext';
import { useGo, useRouteTarget } from './routes';
import {
  badgeLabel, cachedUnreadCount, refreshUnreadCount, subscribeInbox,
} from '../features/notifications/notifications.data';
import { mayaAvailable, openMaya } from '../features/maya/mayaBridge';

/** Keep the bell honest when the app is open and nothing else refreshed it. */
const POLL_MS = 60000;

const firstNameOf = (user) =>
  user?.first_name || user?.firstName || (user?.name ? String(user.name).trim().split(/\s+/)[0] : '') || null;

export function AppTopBar() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { openDrawer } = useDrawer();
  const go = useGo();
  const profileTarget = useRouteTarget('profile');
  const [badge, setBadge] = useState(() => cachedUnreadCount());
  const pollRef = useRef(null);

  // Every mutation inside notifications.data pushes a fresh { unread, disabled }
  // through this subscription, so the dot clears without a reload.
  useEffect(() => subscribeInbox(setBadge), []);

  useFocusEffect(
    useCallback(() => {
      refreshUnreadCount().catch(() => {});
    }, []),
  );

  useEffect(() => {
    const tick = () => refreshUnreadCount().catch(() => {});
    tick();
    pollRef.current = setInterval(tick, POLL_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick();
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      sub.remove();
    };
  }, []);

  const openNotifications = useCallback(() => {
    go(['HomeTab', 'Notifications']);
  }, [go]);

  const openProfile = useCallback(() => {
    if (profileTarget) {
      go(profileTarget);
    } else {
      go(['HomeTab', 'Profile']);
    }
  }, [go, profileTarget]);

  const greeting = greetingFor();
  const firstName = firstNameOf(user) || 'there';
  const Bell = icons.bell;
  const Sparkle = icons.maya;

  return (
    <View
      style={{
        paddingTop: insets.top + space[2],
        paddingHorizontal: gutter,
        paddingBottom: space[3],
        // TRANSPARENT (2026-10-20): the bar sits on whatever the screen is —
        // white on Home, the lavender canvas on a list root — so the top of
        // the app is one surface instead of a white band with a hairline.
        backgroundColor: 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <DrawerButton onPress={openDrawer} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[text.caption, { color: color.textSecondary }]}>{greeting}</Text>
          <Text numberOfLines={1} accessibilityRole="header" style={text.h2}>
            {firstName}
          </Text>
        </View>

        {/* ── ASK MAYA LIVES HERE (user, 2026-10-21) ─────────────────────────
            "place ask maya next to notification, remove floating everywhere,
            just sparkle icon". It was a floating purple pill over every tab
            (features/maya/MayaFab), covering the bottom of every list. Now a
            sparkle beside the bell — tinted purple, not white like the bell,
            because it is the one control up here that does something rather
            than goes somewhere. Absent when Maya has no key (§2). */}
        {mayaAvailable() && Sparkle ? (
          <Pressable
            onPress={() => openMaya()}
            accessibilityRole="button"
            accessibilityLabel="Ask Maya"
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? color.brandSoftBorder : color.brandChipBg,
            })}
          >
            <Sparkle size={iconSize.md} color={color.brandChipFg} />
          </Pressable>
        ) : null}

        {/* 503 FEATURE_DISABLED → the bell quietly vanishes until the engine
            is turned back on. The badge shows "99+" when the server capped the
            count. */}
        {badge.disabled ? null : (
          <Pressable
            onPress={openNotifications}
            accessibilityRole="button"
            accessibilityLabel={badge.unread ? `Notifications, ${badge.unread} unread` : 'Notifications'}
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
              ...elevate('xs'),
            })}
          >
            {Bell ? <Bell size={iconSize.md} color={color.textSecondary} /> : null}
            {badge.unread > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 4,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: color.danger.dot,
                  borderWidth: 2,
                  borderColor: color.surface,
                }}
              >
                <Text style={[text.caption, { color: '#fff', fontWeight: '700', fontSize: 10, lineHeight: 12 }]}>
                  {badgeLabel(badge.unread, badge.isCapped)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        )}

        <Pressable
          onPress={openProfile}
          accessibilityRole="button"
          accessibilityLabel="My profile"
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Avatar person={user} size={40} />
        </Pressable>
      </View>
    </View>
  );
}

export default AppTopBar;
