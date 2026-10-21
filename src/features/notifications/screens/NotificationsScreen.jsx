// ─────────────────────────────────────────────────────────────────────────────
// features/notifications/screens/NotificationsScreen.jsx — the bell's list.
//
// Reached from the Home top bar. One screen, one list, a filter strip above it,
// and a detail screen behind each row.
//
// ── IT IS BUILT ON PLACEHOLDER DATA, AND IT IS BUILT LIKE IT ISN'T ───────────
//
// There is no notifications endpoint yet (see ../notifications.data.js). This
// screen still has a loading state, an error state, two different empty states
// and pull-to-refresh, because those are the parts that get bolted on wrong
// when the real endpoint lands at the end. Swapping the data module's two
// functions for `request()` calls is the whole migration.
//
// ── TWO EMPTY STATES, NOT ONE (ui/EmptyState.jsx rule 2) ────────────────────
//
// "Nothing yet" and "nothing in THIS filter" are different facts and are
// worded differently, and the second offers a way back to All. Showing
// "You have no notifications" to somebody who has simply filtered to Payroll
// is the bug that rule exists to prevent.
//
// ── READ STATE IS SET ON OPEN, NOT ON SCROLL-PAST ───────────────────────────
//
// A row goes read when it is opened. Marking rows read as they scroll by means
// somebody who flicks past an announcement has "read" it, and the bell badge
// then lies about what still needs their attention.
//
// ── THE LIST IS A FlatList, SO Screen RUNS scroll={false} ───────────────────
//
// A FlatList inside a ScrollView renders every row at once and windowing dies
// (ui/Screen.jsx header). The filter strip rides along as ListHeaderComponent
// rather than sitting above the list, so it scrolls away with the content
// instead of eating 48pt of a phone permanently.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { fmtDateShort, fmtTime, todayYMD, ymdOnly } from '../../../lib/dates';
import { color, gutter, radius, space, text } from '../../../theme/tokens';
import { iconFor, icons } from '../../../theme/icons';
import {
  Button, EmptyState, FilterTabs, IconTile, Screen, Skeleton, showToast, useHeaderMenu,
} from '../../../ui';
import { CATEGORIES, listNotifications, markAllRead, markRead, metaFor } from '../notifications.data';

/**
 * "10:30 am" for today, "Yesterday", "Sat, 11 Oct" beyond that.
 *
 * A timestamp on every row would be read as a precise fact nobody needs: what
 * matters in a list is HOW OLD, and the exact instant is on the detail screen.
 */
function whenLabel(iso) {
  const ymd = ymdOnly(iso);
  if (!ymd) return '';
  const today = todayYMD();
  if (ymd === today) return fmtTime(iso, '');

  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  if (ymd === yesterday) return 'Yesterday';

  return fmtDateShort(iso, '');
}

/* ─── One row ──────────────────────────────────────────────────────────────
   Not ui/Row: that one is a title / subtitle / value row with a chevron, and
   this is a three-line block with a timestamp column and an unread dot. Forcing
   it through Row would mean adding two props to Row that only this screen ever
   passes. */
function NotificationRow({ item, onPress }) {
  const meta = metaFor(item.category);
  const when = whenLabel(item.created_at);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.read ? '' : 'Unread. '}${when}`}
      accessibilityHint="Opens the full notification"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3],
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: item.read ? color.borderSubtle : color.brandSoftBorder,
        // An unread row is tinted, not bolded-and-tinted-and-dotted. The dot
        // carries it; the tint is a second, quieter signal for anybody who
        // can't separate the dot from the background.
        backgroundColor: pressed
          ? color.pressTint
          : item.read ? color.surface : color.brandSoftBg,
      })}
    >
      <IconTile icon={iconFor(meta.icon)} tone={meta.tone} size="md" />

      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={text.bodyStrong}>{item.title}</Text>
        <Text numberOfLines={2} style={text.small}>{item.preview}</Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 6, minWidth: 64 }}>
        <Text style={text.caption}>{when}</Text>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: item.read ? color.border : color.brand,
          }}
        />
      </View>
    </Pressable>
  );
}

const RowSpacer = () => <View style={{ height: space[2] }} />;

export default function NotificationsScreen({ navigation }) {
  const [category, setCategory] = useState('all');
  const [state, setState] = useState({ loading: true, failed: false, rows: [], unread: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState((s) => ({ ...s, loading: true, failed: false }));
    try {
      const { notifications, unread } = await listNotifications({ category });
      setState({ loading: false, failed: false, rows: notifications, unread });
    } catch {
      setState({ loading: false, failed: true, rows: [], unread: 0 });
    }
  }, [category]);

  useEffect(() => { load(); }, [load]);

  // Coming back from the detail screen, the row that was opened is now read.
  // Re-reading on focus is what keeps the dot and the badge honest without a
  // subscription the placeholder store doesn't have.
  useFocusEffect(useCallback(() => { load({ quiet: true }); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load({ quiet: true }); } finally { setRefreshing(false); }
  }, [load]);

  const open = useCallback((item) => {
    markRead(item.id);
    navigation.navigate('NotificationDetail', { id: item.id, title: item.title });
  }, [navigation]);

  const onMarkAll = useCallback(() => {
    markAllRead();
    load({ quiet: true });
    showToast('All caught up.', 'success');
  }, [load]);

  const { loading, failed, rows, unread } = state;
  const filtered = category !== 'all';

  /* Both screen-level actions live behind the ⋮ — see ui/HeaderMenu.jsx for
     why they left the list. "Mark all as read" stays VISIBLE and disabled when
     there is nothing unread, rather than disappearing: the menu is how people
     find out the screen can do it at all. */
  useHeaderMenu(navigation, [
    {
      key: 'read',
      label: 'Mark all as read',
      caption: unread > 0 ? `${unread} unread` : 'Nothing unread',
      icon: icons.check,
      disabled: unread === 0,
      onPress: onMarkAll,
    },
    {
      key: 'refresh',
      label: 'Refresh',
      caption: 'Check for anything new',
      icon: icons.refresh,
      onPress: () => load({ quiet: true }),
    },
  ], 'Notifications');

  const header = useMemo(() => (
    <View style={{ paddingBottom: space[3] }}>
      <FilterTabs options={CATEGORIES} value={category} onChange={setCategory} />
    </View>
  ), [category]);

  return (
    <Screen scroll={false} edges={[]} contentStyle={{ paddingHorizontal: 0 }}>
      <FlatList
        data={loading ? [] : rows}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={RowSpacer}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: space[3],
          paddingBottom: space[10],
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.brand}
            colors={[color.brand]}
          />
        }
        renderItem={({ item }) => (
          <NotificationRow item={item} onPress={() => open(item)} />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: space[2] }}>
              <Skeleton type="rows" rows={6} />
            </View>
          ) : failed ? (
            <EmptyState
              icon={icons.warn}
              title="We couldn’t load your notifications"
              message="Check your connection and pull down to try again."
              action={<Button title="Try again" onPress={() => load()} />}
            />
          ) : filtered ? (
            <EmptyState
              filtered
              title="Nothing in this filter"
              message="There are no notifications in this category yet. Try All to see everything."
              action={<Button title="Show all" variant="soft" onPress={() => setCategory('all')} />}
            />
          ) : (
            <EmptyState
              icon={icons.inbox}
              title="No notifications yet"
              message="Announcements from HR, leave decisions and payslip releases will show up here."
            />
          )
        }
      />
    </Screen>
  );
}

export { NotificationsScreen };
