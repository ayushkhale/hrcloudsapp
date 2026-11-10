// ─────────────────────────────────────────────────────────────────────────────
// features/notifications/screens/NotificationsScreen.jsx — the bell's list.
//
// Reached from the Home top bar. One screen, one list, a filter strip above it,
// and a detail screen behind each row.
//
// Backed by the real engine (api/notifications.api.js). The feed is paginated
// (20 at a time, up to 50 per page server-side); the list scrolls to load the
// next page.
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
// ── 503 FEATURE_DISABLED HIDES THE WHOLE THING ──────────────────────────────
//
// The engine kill switch (`NOTIFICATION_ENGINE_ENABLED`) answers 503 on every
// endpoint; the UI must degrade gracefully, not hard-error. The bell is
// hidden by AppTopBar; this screen draws an empty state in case a deep link
// gets here anyway.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { fmtDateShort, fmtTime, todayYMD, ymdOnly } from '../../../lib/dates';
import { color, gutter, radius, space, text } from '../../../theme/tokens';
import { iconFor, icons } from '../../../theme/icons';
import {
  Button, EmptyState, FilterTabs, IconTile, Screen, Skeleton, showToast, useConfirm, useHeaderMenu,
} from '../../../ui';
import { useBadgeCounts } from '../../../hooks/useBadgeCounts';
import {
  CATEGORIES, badgeLabel, dismiss, listNotifications, markAllRead, markRead, metaFor, refreshUnreadCount, useUnreadCount,
} from '../notifications.data';

const PAGE_SIZE = 20;

/**
 * "10:30 am" for today, "Yesterday", "Sat, 11 Oct" beyond that. A timestamp
 * on every row would be read as a precise fact nobody needs: what matters in
 * a list is HOW OLD, and the exact instant is on the detail screen.
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
   this is a three-line block with a timestamp column and an unread dot. */
function NotificationRow({ item, onPress, onDismiss }) {
  const meta = metaFor(item.category);
  const when = whenLabel(item.created_at);
  const preview = item.message || '';
  const Trash = icons.delete;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.is_read ? '' : 'Unread. '}${when}`}
      accessibilityHint="Opens the full notification. Long-press to dismiss."
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3],
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: item.is_read ? color.borderSubtle : color.brandSoftBorder,
        backgroundColor: pressed
          ? color.pressTint
          : item.is_read ? color.surface : color.brandSoftBg,
      })}
    >
      <IconTile icon={iconFor(meta.icon)} tone={meta.tone} size="md" />

      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={text.bodyStrong}>{item.title}</Text>
        <Text numberOfLines={2} style={text.small}>{preview}</Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 6, minWidth: 64 }}>
        <Text style={text.caption}>{when}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {!item.is_read ? (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: color.brand,
              }}
            />
          ) : null}
          {onDismiss && Trash ? (
            <Pressable
              hitSlop={8}
              onPress={onDismiss}
              accessibilityLabel="Dismiss this notification"
              style={({ pressed: p }) => ({ opacity: p ? 0.5 : 0.6, padding: 2 })}
            >
              <Trash size={14} color={color.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const RowSpacer = () => <View style={{ height: space[2] }} />;

export default function NotificationsScreen({ navigation }) {
  const [readFilter, setReadFilter] = useState('all'); // 'all' | 'unread' | 'read'
  const [category, setCategory] = useState('all');
  const { unread: unreadCountRaw, isCapped: unreadCapped } = useUnreadCount();
  const badgeCounts = useBadgeCounts();
  const unreadCount = Math.max(unreadCountRaw || 0, badgeCounts?.sidebar?.notificationsUnread || 0);
  const [state, setState] = useState({
    loading: true, failed: false, disabled: false, items: [], hasMore: false, page: 1, total: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const confirm = useConfirm();
  const abortRef = useRef(null);

  const load = useCallback(async ({ quiet = false, page = 1 } = {}) => {
    if (!quiet) setState((s) => ({ ...s, loading: page === 1, failed: false }));
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const isReadParam = readFilter === 'all' ? undefined : readFilter === 'read';
      const { items, pagination, disabled } = await listNotifications({
        category,
        is_read: isReadParam,
        page,
        limit: PAGE_SIZE,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setState((prev) => ({
        loading: false,
        failed: false,
        disabled,
        items: page === 1 ? items : [...prev.items, ...items],
        hasMore: !!pagination && pagination.page < pagination.total_pages,
        page: pagination?.page || page,
        total: pagination?.total != null ? pagination.total : (page === 1 ? items.length : prev.total),
      }));
    } catch (err) {
      if (controller.signal.aborted || err?.name === 'AbortError') return;
      setState((prev) => ({ ...prev, loading: false, failed: true }));
    }
  }, [category, readFilter]);

  useEffect(() => { load(); refreshUnreadCount().catch(() => {}); }, [load]);

  // Coming back from the detail screen, the row that was opened is now read.
  useFocusEffect(useCallback(() => { load({ quiet: true }); refreshUnreadCount().catch(() => {}); }, [load]));

  useEffect(() => () => abortRef.current?.abort(), []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ quiet: true });
      await refreshUnreadCount().catch(() => {});
      badgeCounts.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [load, badgeCounts]);

  const onLoadMore = useCallback(async () => {
    if (loadingMore || !state.hasMore || state.loading) return;
    setLoadingMore(true);
    try {
      await load({ quiet: true, page: state.page + 1 });
    } finally {
      setLoadingMore(false);
    }
  }, [load, loadingMore, state.hasMore, state.loading, state.page]);

  const open = useCallback(async (item) => {
    // Optimistic: show it as read right away; the server call is idempotent.
    if (!item.is_read) {
      setState((prev) => ({ ...prev, items: prev.items.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)) }));
      markRead(item.id).catch(() => {});
    }
    navigation.navigate('NotificationDetail', { notification: item });
  }, [navigation]);

  const onDismiss = useCallback(async (item) => {
    const ok = await confirm({
      title: 'Dismiss this notification?',
      message: 'This cannot be undone.',
      confirmText: 'Dismiss',
      destructive: true,
    });
    if (!ok) return;
    const prevItems = state.items;
    setState((prev) => ({ ...prev, items: prev.items.filter((n) => n.id !== item.id) }));
    try {
      await dismiss(item.id);
      refreshUnreadCount().catch(() => {});
      badgeCounts.refresh();
    } catch {
      setState((prev) => ({ ...prev, items: prevItems }));
      showToast('Could not dismiss that one. Try again.', 'error');
    }
  }, [confirm, state.items, badgeCounts]);

  const onMarkAll = useCallback(async () => {
    const prevItems = state.items;
    setState((prev) => ({ ...prev, items: prev.items.map((n) => ({ ...n, is_read: true })) }));
    try {
      await markAllRead();
      showToast('All caught up.', 'success');
      load({ quiet: true });
      refreshUnreadCount().catch(() => {});
      badgeCounts.refresh();
    } catch {
      setState((prev) => ({ ...prev, items: prevItems }));
      showToast('Could not mark everything read. Try again.', 'error');
    }
  }, [load, state.items, badgeCounts]);

  const { loading, failed, disabled, items, hasMore } = state;
  const isFiltered = category !== 'all' || readFilter !== 'all';

  useHeaderMenu(navigation, [
    {
      key: 'read',
      label: 'Mark all as read',
      caption: unreadCount > 0 ? `${badgeLabel(unreadCount, unreadCapped)} unread` : 'All caught up',
      icon: icons.check,
      disabled: unreadCount === 0,
      onPress: onMarkAll,
    },
    {
      key: 'refresh',
      label: 'Refresh',
      caption: 'Check for anything new',
      icon: icons.refresh,
      onPress: () => {
        load({ quiet: true });
        refreshUnreadCount().catch(() => {});
        badgeCounts.refresh();
      },
    },
  ], 'Notifications');

  const statusOptions = [
    { value: 'all', label: 'All', count: readFilter === 'all' ? state.total : undefined },
    { value: 'unread', label: 'Unread', count: unreadCount },
    { value: 'read', label: 'Read', count: readFilter === 'read' ? state.total : undefined },
  ];

  const header = (
    <View style={{ paddingBottom: space[3], gap: space[2] }}>
      <FilterTabs options={statusOptions} value={readFilter} onChange={setReadFilter} />
      <FilterTabs options={CATEGORIES} value={category} onChange={setCategory} />
    </View>
  );

  return (
    <Screen scroll={false} edges={[]} contentStyle={{ paddingHorizontal: 0 }}>
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={RowSpacer}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: space[3],
          paddingBottom: space[10],
          flexGrow: 1,
        }}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.brand}
            colors={[color.brand]}
          />
        }
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            onPress={() => open(item)}
            onDismiss={() => onDismiss(item)}
          />
        )}
        ListFooterComponent={hasMore && !loading ? (
          <View style={{ paddingVertical: space[4] }}>
            <Skeleton type="rows" rows={2} avatar={false} />
          </View>
        ) : null}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: space[2] }}>
              <Skeleton type="rows" rows={6} />
            </View>
          ) : disabled ? (
            <EmptyState
              icon={icons.bell}
              title="Notifications are off"
              message="Your workspace hasn’t turned notifications on yet. Updates will show here once they do."
            />
          ) : failed ? (
            <EmptyState
              icon={icons.warn}
              title="We couldn’t load your notifications"
              message="Check your connection and pull down to try again."
              action={<Button title="Try again" onPress={() => load()} />}
            />
          ) : isFiltered ? (
            <EmptyState
              filtered
              title="Nothing in this filter"
              message="There are no notifications in this category yet. Try All to see everything."
              action={<Button title="Show all" variant="soft" onPress={() => { setCategory('all'); setReadFilter('all'); }} />}
            />
          ) : (
            <EmptyState
              icon={icons.inbox}
              title="No notifications yet"
              message="Leave decisions, payslip releases and task updates will show up here."
            />
          )
        }
      />
    </Screen>
  );
}

export { NotificationsScreen };
