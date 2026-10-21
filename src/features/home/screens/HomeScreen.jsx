// ─────────────────────────────────────────────────────────────────────────────
// features/home/screens/HomeScreen.jsx — the screen 95% of people open the app
// for. Spec: NativeRef/40-screens/02-home-and-punch.md.
//
// LAYOUT (top → bottom), four things and nothing else:
//
//   1. the top bar — the menu, the greeting beside it, the bell and the avatar
//   2. the punch card, above the fold, always
//   3. "My month"      — the headline numbers over the daily-hours bars
//   4. "Attendance mix" — how the month's days went
//
// ── WHY IT IS ONLY FOUR THINGS (2026-10-17) ──────────────────────────────────
//
// This screen is the phone version of the WEB EMPLOYEE DASHBOARD, and that
// page is exactly this: the punch card beside My month, then recent days
// beside the attendance mix. Home had grown four cards the web dashboard
// doesn't have — quick actions, upcoming, announcements, a 2×2 month snapshot
// — and a daily-hours chart that duplicated what My month already draws. The
// result was a scroll nobody reached the bottom of, and two different answers
// to "how is my month going?" on one screen.
//
// So: quick actions are gone (every one of them is a tab away), upcoming and
// announcements are gone, and MonthlySnapshot + DailyHoursChart are REPLACED
// by MyMonthCard, which is the same numbers and the same bars in the web's own
// arrangement. Recent days is the one web row left out: on a phone, tapping a
// bar in My month opens that day's log, which is what the table was for.
//
// The components those cards lived in are still in features/home/components —
// unreferenced, not deleted, because Upcoming and Announcements are wanted
// again the day there is a screen with room for them.
//
// ── NO CARDS, NO SHADOWS, ONE GUTTER (2026-10-17) ────────────────────────────
//
// The three sections were white cards with a border and a shadow on a slate-50
// wash. Stacked, that is three frames around content that needed none, and
// every frame cost 16pt of padding ON TOP of the screen's own 16pt gutter —
// so the content sat 32pt in from the edge of a 360pt phone and the charts
// paid for it.
//
// So the screen is WHITE and the sections are flat: a heading and its content,
// aligned to the one gutter, separated by space rather than by edges. The only
// fills left are the soft slate tiles on the punch card, which is the one
// place a fill is doing a job (grouping a label with its number).
//
// `color.bg` (slate-50) is still right for a screen of LISTS, where white rows
// need something to sit on. This screen has no list. If a later screen keeps
// its cards, that is fine — what must not happen is cards and flat sections on
// the SAME screen.
//
// ── THE DATE IS NOT ON THIS SCREEN ANY MORE ──────────────────────────────────
//
// The greeting used to face a weekday-and-date block across the top. The date
// is on the lock screen, in the status bar, and inside every card that needs
// one; a third copy bought a whole row of chrome. The greeting now sits beside
// the hamburger on the top bar's own line and costs nothing.
//
// DATA: today + shift + contract come from useTodayAttendance (never call
// getToday yourself — the hook owns the tokens, the midnight re-arm and the
// foreground refresh). The month is ONE call shared by both cards
// (useMonthGraph) — see that file for why it isn't two.
//
// DayLog is a ROUTE (2026-10-21): tapping a bar pushes DayLogScreen with
// `{ date }`. It used to be a sheet over this screen; a whole day of punches
// didn't fit one and couldn't be scrolled, so it became a page.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { attendanceAPI } from '../../../api';
import { useTodayAttendance } from '../../../hooks/useTodayAttendance';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { unwrap } from '../../../lib/normalize';
import { color, gutter, space } from '../../../theme/tokens';
import { ErrorState, SkeletonBlock } from '../../../ui';
import { AppTopBar } from '../../../navigation/AppTopBar';
import { PunchCard } from '../../attendance/components/PunchCard';
import { useMonthGraph } from '../useMonthGraph';
import { MyMonthCard } from '../components/MyMonthCard';
import { AttendanceMixCard } from '../components/AttendanceMixCard';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { today, shift, loading, error, refresh } = useTodayAttendance();

  const [contract, setContract] = useState(null);
  const navigation = useNavigation();
  const openDay = useCallback((ymd) => navigation.navigate('DayLog', { date: ymd }), [navigation]);
  const [refreshing, setRefreshing] = useState(false);
  // Bumped by pull-to-refresh so the month cards (which key off the month)
  // also refetch; punch events already refresh `today` through the hook.
  const [reloadKey, setReloadKey] = useState(0);

  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });

  // ONE read for both month cards — see useMonthGraph for why.
  const graph = useMonthGraph(period.year, period.month, reloadKey);

  // Field assignments — the ONLY source of work mode and office names (§3).
  useEffect(() => {
    let cancelled = false;
    attendanceAPI.getMyFieldAssignments()
      .then((res) => { if (!cancelled) setContract(unwrap(res) || null); })
      .catch(() => { if (!cancelled) setContract(null); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Back on Home — from a punch on the web, a correction, a day page — re-read
  // quietly (hooks/useListRefresh.js; its pull spinner is unused here, Home's
  // own pull below awaits the punch card first).
  useListRefresh(
    useCallback(() => { refresh(); setReloadKey((k) => k + 1); }, [refresh]),
    loading,
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      setReloadKey((k) => k + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <AppTopBar />

      <ScrollView
        contentContainerStyle={{
          paddingTop: space[4],
          paddingHorizontal: gutter,
          paddingBottom: insets.bottom + space[10],
          // With no card edges left, space IS the separator — which is why it
          // is 32 between sections and not the 16 a stack of cards needed.
          gap: space[8],
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} colors={[color.brand]} />
        }
      >
        {/* The punch card — above the fold, always (§4). An error here replaces
            the card only; the month cards below still render (§5). */}
        {loading && !today ? (
          <View style={{ gap: space[4] }}>
            <SkeletonBlock height={22} width="35%" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
              <SkeletonBlock width={104} height={104} radius={52} />
              <View style={{ flex: 1, gap: space[2] }}>
                <SkeletonBlock height={50} />
                <SkeletonBlock height={50} />
              </View>
            </View>
            <SkeletonBlock height={48} />
          </View>
        ) : error && !today ? (
          <ErrorState error={error} domain="attendance" onRetry={refresh} fallback="We couldn’t load today." />
        ) : today ? (
          <PunchCard
            today={today}
            shift={shift}
            contract={contract}
            refresh={refresh}
          />
        ) : null}

        {/* Both read the one `graph`, so they can never disagree about the
            month and the stepper in My month's header moves them together. */}
        <MyMonthCard
          graph={graph}
          period={period}
          onChangePeriod={setPeriod}
          onDayPress={openDay}
          // The org's weekly offs live on this wrapper. Without them
          // graph-data's blanket "absent" paints every Sunday red.
          shift={shift}
        />

        <AttendanceMixCard graph={graph} period={period} shift={shift} />
      </ScrollView>

    </View>
  );
}

export { HomeScreen };
