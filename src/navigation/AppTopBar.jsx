import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { unreadCount } from '../features/notifications/notifications.data';

const firstNameOf = (user) =>
  user?.first_name || user?.firstName || (user?.name ? String(user.name).trim().split(/\s+/)[0] : '') || null;

export function AppTopBar() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { openDrawer } = useDrawer();
  const go = useGo();
  const profileTarget = useRouteTarget('profile');
  const [unread, setUnread] = useState(() => unreadCount());

  useFocusEffect(
    useCallback(() => {
      setUnread(unreadCount());
    }, []),
  );

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

        <Pressable
          onPress={openNotifications}
          accessibilityRole="button"
          accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
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
          {unread ? (
            <View
              style={{
                position: 'absolute',
                top: 7,
                right: 8,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: color.brand,
                borderWidth: 2,
                borderColor: color.surface,
              }}
            />
          ) : null}
        </Pressable>

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
