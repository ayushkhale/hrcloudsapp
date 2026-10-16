// ─────────────────────────────────────────────────────────────────────────────
// features/home/screens/HomeScreen.jsx — the screen 95% of people open the app
// for. Spec: NativeRef/40-screens/02-home-and-punch.md.
//
// LAYOUT (top → bottom): the purple hero (greeting · first name · date · a
// logout button, and a holiday chip when one is near), then the PunchCard — the
// whole point of the screen, above the fold always — then the month snapshot,
// the daily-hours chart, and the recent-days preview.
//
// WHY THE HERO HAS NO NATIVE HEADER: this is the one screen with headerShown:
// false (tabs.employee.js), because the PageHeader IS the header. That is also
// why the sign-out control lives here — there is no header bar to hang it on,
// and the hero's top-right is where the reference app puts its account actions.
//
// DATA: today + shift + contract come from useTodayAttendance (never call
// getToday yourself — the hook owns the tokens, the midnight re-arm and the
// foreground refresh). The month tiles, the chart, the recent rows and the
// holiday chip are each their OWN request, each failing independently (§5):
// one dead call hides its own card and nothing else. There is NO poller (T-H5).
//
// DayLog is a SHEET, not a route (§ DayLog): tapping a recent row or a bar opens
// DayLogSheet as local state, so this screen stays mounted behind it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { attendanceAPI } from '../../../api';
import { useAuth } from '../../../state/AuthContext';
import { useTodayAttendance } from '../../../hooks/useTodayAttendance';
import { useAttendanceChanged, ATTENDANCE_EVENTS } from '../../../lib/events';
import { unwrap } from '../../../lib/normalize';
import { fmtClockMinutes, fmtDate, fmtDateShort, greetingFor, todayYMD } from '../../../lib/dates';
import { humanize } from '../../../lib/enums';
import { color, gutter, iconSize, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Card, CardHeader, ErrorState, HeroChip, LinkButton, ListFooter,
  PageHeader, Row, Skeleton, StatusBadge,
} from '../../../ui';
import { PunchCard } from '../../attendance/components/PunchCard';
import { DayLogSheet } from '../../attendance/components/DayLogSheet';
import { MonthlySnapshot } from '../components/MonthlySnapshot';
import { DailyHoursChart } from '../components/DailyHoursChart';

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const first = (o, ...keys) => { for (const k of keys) { const v = o?.[k]; if (v !== undefined && v !== null) return v; } return null; };

const firstNameOf = (user) =>
  user?.first_name || user?.firstName || (user?.name ? String(user.name).trim().split(/\s+/)[0] : '') || null;

const daysUntil = (ymd) => {
  const t = Date.parse(`${ymd}T00:00:00`);
  if (Number.isNaN(t)) return Infinity;
  return Math.ceil((t - Date.now()) / 86400000);
};

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { today, shift, loading, error, refresh } = useTodayAttendance();

  const [contract, setContract] = useState(null);
  const [holiday, setHoliday] = useState(null);
  const [recent, setRecent] = useState({ loading: true, failed: false, rows: [] });
  const [selectedDate, setSelectedDate] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // Bumped by pull-to-refresh so the month cards (which key off the month) also
  // refetch; punch events already refresh `today` through the hook.
  const [reloadKey, setReloadKey] = useState(0);

  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });

  // Field assignments — the ONLY source of work mode and office names (§3).
  useEffect(() => {
    let cancelled = false;
    attendanceAPI.getMyFieldAssignments()
      .then((res) => { if (!cancelled) setContract(unwrap(res) || null); })
      .catch(() => { if (!cancelled) setContract(null); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Next holiday, for the hero chip — shown only when it's within 30 days.
  useEffect(() => {
    let cancelled = false;
    attendanceAPI.getUpcomingHolidays()
      .then((res) => {
        if (cancelled) return;
        const data = unwrap(res);
        const list = Array.isArray(data) ? data : (data?.holidays || data?.upcoming || []);
        setHoliday(list[0] || null);
      })
      .catch(() => { if (!cancelled) setHoliday(null); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Recent days preview (§4). Refetched on any punch so it never goes stale.
  const loadRecent = useCallback(() => {
    let cancelled = false;
    setRecent((s) => ({ ...s, loading: true, failed: false }));
    attendanceAPI.getHistory({ limit: 5 })
      .then((res) => {
        if (cancelled) return;
        const data = unwrap(res);
        const rows = Array.isArray(data) ? data : (data?.records || data?.history || data?.days || []);
        setRecent({ loading: false, failed: false, rows: rows.slice(0, 5) });
      })
      .catch(() => { if (!cancelled) setRecent({ loading: false, failed: true, rows: [] }); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => loadRecent(), [loadRecent, reloadKey]);
  useAttendanceChanged([ATTENDANCE_EVENTS.PUNCH], loadRecent);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      setReloadKey((k) => k + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const onLogout = useCallback(() => {
    // A confirm, because a stray tap top-right shouldn't end the session — but
    // kept simple (no async provider dependency) so the hero stays self-contained.
    logout();
  }, [logout]);

  const greeting = greetingFor();
  const firstName = firstNameOf(user) || 'Loading…';
  const dateLine = fmtDate(today?.date || todayYMD(), '');

  const holidayChip = useMemo(() => {
    const date = first(holiday, 'date', 'holiday_date', 'day');
    if (!date || daysUntil(date) < 0 || daysUntil(date) > 30) return null;
    const name = first(holiday, 'name', 'holiday_name', 'title') || 'Holiday';
    return { name, date };
  }, [holiday]);

  const logoutButton = (
    <Pressable
      onPress={onLogout}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      hitSlop={10}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.full,
        backgroundColor: color.heroBadgeBg,
        borderWidth: 1,
        borderColor: color.heroBadgeBorder,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {icons.logout ? <icons.logout size={iconSize.md} color={color.textOnBrand} /> : (
        <Text style={[text.smallStrong, { color: color.textOnBrand }]}>Exit</Text>
      )}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space[2],
          paddingHorizontal: gutter,
          paddingBottom: insets.bottom + space[10],
          gap: space[4],
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} colors={[color.brand]} />
        }
      >
        <PageHeader
          badgeText={greeting}
          title={firstName}
          subtitle={dateLine}
          right={logoutButton}
        />

        {holidayChip ? (
          <Pressable
            onPress={() => navigation?.getParent?.()?.navigate('LeaveTab', { screen: 'Holidays' })}
            accessibilityRole="button"
            accessibilityLabel={`Upcoming holiday: ${holidayChip.name} on ${fmtDateShort(holidayChip.date, '')}`}
            style={{ alignSelf: 'flex-start' }}
          >
            <HeroChip icon={icons.calendar} style={{ backgroundColor: color.brandSoftBg, borderColor: color.brandSoftBorder }}>
              <Text style={[text.smallStrong, { color: color.brand }]}>
                {`${holidayChip.name} · ${fmtDateShort(holidayChip.date, '')}`}
              </Text>
            </HeroChip>
          </Pressable>
        ) : null}

        {/* The punch card — above the fold, always (§4). Error here replaces the
            card only; the month below still renders (§5). */}
        {loading && !today ? (
          <Skeleton type="card" />
        ) : error && !today ? (
          <Card>
            <ErrorState error={error} domain="attendance" onRetry={refresh} fallback="We couldn’t load today." />
          </Card>
        ) : today ? (
          <PunchCard today={today} shift={shift} contract={contract} refresh={refresh} />
        ) : null}

        <MonthlySnapshot
          year={period.year}
          month={period.month}
          onChange={setPeriod}
          reloadKey={reloadKey}
        />

        <DailyHoursChart
          year={period.year}
          month={period.month}
          onBarPress={setSelectedDate}
          reloadKey={reloadKey}
        />

        {/* Recent days (§4). Independent failure hides it. */}
        {recent.failed ? null : (
          <Card padded={false}>
            <View style={{ paddingHorizontal: space[4], paddingTop: space[4] }}>
              <CardHeader>Recent days</CardHeader>
            </View>
            {recent.loading ? (
              <View style={{ padding: space[4] }}><Skeleton type="rows" rows={4} avatar={false} /></View>
            ) : recent.rows.length === 0 ? (
              <Text style={[text.small, { color: color.textMuted, padding: space[4] }]}>
                No days recorded yet.
              </Text>
            ) : (
              <>
                {recent.rows.map((r, i) => {
                  const date = first(r, 'date', 'attendance_date', 'day');
                  const mins = num(first(r, 'worked_minutes', 'effective_minutes'));
                  const worked = mins != null
                    ? fmtClockMinutes(mins, { short: true }, '')
                    : (num(first(r, 'worked_hours', 'total_hours')) != null
                      ? fmtClockMinutes(Math.round(num(first(r, 'worked_hours', 'total_hours')) * 60), { short: true }, '')
                      : '');
                  return (
                    <Row
                      key={date || i}
                      title={fmtDateShort(date, 'That day')}
                      subtitle={r?.status ? humanize(r.status) : undefined}
                      left={r?.status ? <StatusBadge kind="record" status={r.status} dense /> : undefined}
                      value={worked || undefined}
                      onPress={date ? () => setSelectedDate(date) : undefined}
                    />
                  );
                })}
                <ListFooter>
                  <LinkButton
                    title="See all my time"
                    onPress={() => navigation?.getParent?.()?.navigate('TimeTab', { screen: 'Time' })}
                  />
                </ListFooter>
              </>
            )}
          </Card>
        )}
      </ScrollView>

      {/* DayLog — local state, never a route, so this screen stays mounted. */}
      {selectedDate ? (
        <DayLogSheet date={selectedDate} onClose={() => setSelectedDate(null)} />
      ) : null}
    </View>
  );
}

export { HomeScreen };
