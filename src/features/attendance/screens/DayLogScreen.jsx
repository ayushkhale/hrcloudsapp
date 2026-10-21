// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/screens/DayLogScreen.jsx — "Attendance Log": one day of
// attendance, as a page.
//
// A PUSHED STACK SCREEN in both the Home and Time stacks (route `DayLog`,
// param `{ date: 'YYYY-MM-DD' }`), opened by tapping a day on either graph. It
// replaced DayLogSheet on 2026-10-21 — the user: "single attendance on graph is
// unscrollable, make it a separate screen cause its big data".
//
// ── THE LOOK (user's reference, 2026-10-21) ─────────────────────────────────
//
// Light, not a purple slab: "remove chevron purple header and use white,
// light purple themed calendar kinda design".
//
//   header  "Attendance Log" + a calendar button (jump to any past day)
//   row     ‹ white circle · white date pill (also opens the calendar) · ›
//   body    DayLogBody — person card, timeline, total summary
//
// The title was "That day", which said nothing; tabs.employee.js carries the
// new one for both stacks, and the header, the route title and this file
// agree (CLAUDE.md §6).
//
// The chevrons move a day at a time; forward stops at today (there is nothing
// to read in the future). The old day stays on screen until the new one lands
// — only the first load is a skeleton (§2). The date is local state, not a
// route param: stepping through a week must not stack seven screens.
//
// ── "REQUEST A CORRECTION" FLOATS AT THE BOTTOM (user, 2026-10-21) ──────────
//
// On any PAST day — the web's rule (DailyLogModal: `date < todayYMD()`).
// Today is still being recorded, so there is nothing settled to correct yet.
// It shows whether or not the day has a record: "I was marked absent but I
// was working" is the commonest correction there is, and that day has none.
// The form lives in the Time stack only, so from Home it is reached through
// the Time tab (`initial: false`, so closing it lands on My Time, CLAUDE.md §6).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useLayoutEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../../state/AuthContext';
import { addDaysYMD, fmtDate, fmtWeekday, todayYMD } from '../../../lib/dates';
import { color, elevate, gutter, iconSize, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { DatePicker, FLOATING_CLEARANCE, FloatingAction, Skeleton } from '../../../ui';
import { haptic } from '../../../ui/haptics';
import { DayLogBody, useDayLog } from '../components/DayLogParts';

/** A white circle with a chevron — 44pt, the house tap target. */
function RoundButton({ icon: Icon, label, onPress, disabled = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [{
        width: 44,
        height: 44,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? color.brandChipBg : color.surface,
        opacity: disabled ? 0.4 : 1,
      }, elevate('xs')]}
    >
      {Icon ? <Icon size={iconSize.sm} color={color.ink} /> : null}
    </Pressable>
  );
}

function DateRow({ date, onStep, onPick, canGoForward }) {
  const isToday = date === todayYMD();
  const Down = icons.chevronDown;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <RoundButton icon={icons.chevronLeft} label="The day before" onPress={() => onStep(-1)} />
      <Pressable
        onPress={onPick}
        accessibilityRole="button"
        accessibilityLabel={`${fmtDate(date, '')}. Choose another day.`}
        style={({ pressed }) => [{
          flex: 1,
          minHeight: 44,
          borderRadius: radius.full,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[2],
          paddingHorizontal: space[3],
          backgroundColor: pressed ? color.brandChipBg : color.surface,
        }, elevate('xs')]}
      >
        <View style={{ alignItems: 'center' }}>
          <Text numberOfLines={1} style={[text.bodyStrong, { color: color.ink }]}>{fmtDate(date, 'Choose a day')}</Text>
          <Text numberOfLines={1} style={[text.caption, { color: color.brand }]}>
            {isToday ? 'Today' : fmtWeekday(date, '')}
          </Text>
        </View>
        {Down ? <Down size={16} color={color.textSecondary} /> : null}
      </Pressable>
      <RoundButton
        icon={icons.chevronRight}
        label="The day after"
        onPress={() => onStep(1)}
        disabled={!canGoForward}
      />
    </View>
  );
}

export default function DayLogScreen({ navigation, route }) {
  const { user } = useAuth();
  const [date, setDate] = useState(() => route?.params?.date || todayYMD());
  const [picking, setPicking] = useState(false);
  const { loading, error, day, ready, reload } = useDayLog(date);
  const today = todayYMD();
  const canGoForward = date < today;
  const canCorrect = date < today;

  const requestCorrection = () => {
    if (navigation.getState()?.routeNames?.includes('CorrectionForm')) {
      navigation.navigate('CorrectionForm', { date });
    } else {
      navigation.navigate('TimeTab', { screen: 'CorrectionForm', params: { date }, initial: false });
    }
  };

  const go = (next) => {
    if (!next || next > today || next === date) return;
    haptic('selection');
    setDate(next);
  };

  // The calendar button in the native header, top right — the reference's.
  useLayoutEffect(() => {
    const Cal = icons.calendar;
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel="Choose a day"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? color.brandChipBg : color.brandSoftBg,
          })}
        >
          {Cal ? <Cal size={iconSize.sm} color={color.brand} /> : null}
        </Pressable>
      ),
    });
  }, [navigation]);

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: color.bg }}
        contentContainerStyle={{ padding: gutter, gap: space[4], paddingBottom: canCorrect ? FLOATING_CLEARANCE : space[10] }}
        refreshControl={<RefreshControl refreshing={loading && ready} onRefresh={reload} tintColor={color.brand} colors={[color.brand]} />}
      >
        <DateRow
          date={date}
          onStep={(delta) => go(addDaysYMD(date, delta))}
          onPick={() => setPicking(true)}
          canGoForward={canGoForward}
        />

        {!ready && !day && !error ? (
          <Skeleton type="sheet" />
        ) : (
          <DayLogBody date={date} day={day} error={error} onRetry={reload} person={user} />
        )}
      </ScrollView>

      {canCorrect ? (
        <FloatingAction
          title="Request a correction"
          icon={icons.edit}
          onPress={requestCorrection}
          overTabBar={false}
        />
      ) : null}

      <DatePicker
        open={picking}
        value={date}
        max={today}
        onChange={go}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

export { DayLogScreen };
