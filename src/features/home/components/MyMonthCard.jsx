// ─────────────────────────────────────────────────────────────────────────────
// features/home/components/MyMonthCard.jsx — the web dashboard's "My month",
// at phone width: three numbers over one bar per day.
//
// ── WHAT THE PHONE VERSION DROPPED, AND WHY ──────────────────────────────────
//
//   • THE PAGER. The web splits the month into halves because a mouse can't
//     swipe. The bars scroll here instead, opening on today, which deletes a
//     whole row of chrome (two arrows and a "1/2") and makes every bar a
//     bigger tap target than a paged chart could give them.
//   • THE SUBTITLE. "Hours worked each day" under a heading reading "My month"
//     above an axis in hours.
//
// ── EVERY DAY SAYS WHAT IT WAS (2026-10-17) ──────────────────────────────────
//
// The first version drew ONE series — hours worked — and nothing at all on a
// day with no hours. So a Sunday, a public holiday, a day of approved leave
// and a day somebody simply didn't turn up were FOUR IDENTICAL GAPS, and a
// month of mostly leave rendered as an empty chart with "No hours recorded"
// across it. That is the complaint this card now answers.
//
// Every slot is now coloured by its day chip (lib/dayStatus.js — the same nine
// the calendar grid and the status badges use):
//
//   • present / late / half day → a BAR, height = hours, tinted by which
//   • leave / absent / holiday / weekly off → a BASELINE BLOCK. No height,
//     because no hours were worked; a colour, because something happened
//   • no data → a hairline stub, so "we have nothing for this day" is visibly
//     different from "this day was a day off"
//   • upcoming → nothing. A day that hasn't happened has no fact to draw
//
// A legend under the plot names only the chips the month actually contains, so
// it is two entries in a normal month and never a nine-chip wall.
//
// `chart.day` in theme/tokens.js holds the fills. Keep the chip KEYS the same
// as dayStatus's or a day will read one colour here and another in a list.
//
// ── WHY THE BARS ARE VIEWS AND NOT A CHART LIBRARY ───────────────────────────
//
// A bar is a coloured rectangle whose height is a fraction of the axis top. A
// charting dependency for that is weight the app doesn't need. The SHAPE
// matches the web's TrendBar: flat bottom, 3pt softened cap, outlined in its
// own darker step.
//
// ── THE DAYS THAT AREN'T YOURS ───────────────────────────────────────────────
//
// graph-data fills every day without a record as absent, INCLUDING the days
// before this person joined (backend ask R-7). Those days are set aside here
// using the joining date the profile already carries, the same way the web
// dashboard does it — somebody who joined on the 12th must not open the app to
// eleven absences their own attendance screen doesn't show.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../../state/AuthContext';
import { listFrom, num } from '../../../lib/normalize';
import {
  fmtDateShort, fmtHours, monthLabel, todayYMD, totalWorkedLabel, workedLabel, ymdOnly,
} from '../../../lib/dates';
import { DAY_CHIPS, DAY_CHIP_ORDER, dayChipKey } from '../../../lib/dayStatus';
import {
  dayOfMonth, fillMonthDays, hoursAxis, isWeeklyOffDate, weeklyOffsOf,
} from '../../../lib/monthChart';
import {
  chart, color, dayBarOf, elevate, iconSize, palette, radius, space, text,
} from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { Card, ErrorState, FieldHelp, MonthStepper, SkeletonBlock } from '../../../ui';

const PLOT_H = 132; // the bars' own height; the axis labels hang off the same number
const AXIS_W = 26;
const SLOT_W = 15;
const SLOT_GAP = 3;
const BAR_W = 11;
const CAP_RADIUS = 3;
// How many days of run-up to leave on screen when the chart opens on today.
const LEAD_IN = 9;

// The three chips that mean "hours were worked", so the slot draws a real bar.
const WORKED_CHIPS = new Set(['present', 'late', 'half_day']);

/* ─── The headline row ────────────────────────────────────────────────────────
   Three numbers inside soft slate tiles for clear scannability. */
function Headline({ items }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[2] }}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <View
            key={item.label}
            style={{
              flex: 1,
              minWidth: 0,
              backgroundColor: color.surface,
              borderRadius: radius.md,
              paddingHorizontal: space[3],
              paddingVertical: space[2] + 2,
              borderWidth: 1,
              borderColor: color.borderSubtle,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {Icon ? <Icon size={iconSize.info} color={palette.purple[500]} /> : null}
              <Text numberOfLines={1} style={[text.label, { fontSize: 10, flexShrink: 1, color: color.textMuted }]}>
                {item.label}
              </Text>
              {/* Beside the truncating label, never inside it, so an ellipsis
                  can't swallow the ⓘ. */}
              {item.help ? <FieldHelp {...item.help} /> : null}
            </View>
            <Text numberOfLines={1} style={[text.metric, { fontSize: 17, lineHeight: 22, marginTop: 4 }]}>
              {item.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* The first load, in this section's own shape. */
function LoadingShape() {
  return (
    <View style={{ gap: space[5] }}>
      <View style={{ flexDirection: 'row', gap: space[4] }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, gap: 6 }}>
            <SkeletonBlock height={9} width="70%" />
            <SkeletonBlock height={18} width="55%" />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SLOT_GAP, height: PLOT_H }}>
        {[0.45, 0.8, 0.6, 0.9, 0.5, 0.75, 0.35, 0.85, 0.55, 0.7, 0.4, 0.8, 0.6, 0.5].map((h, i) => (
          <SkeletonBlock key={i} width={0} height={PLOT_H * h} style={{ flex: 1 }} />
        ))}
      </View>
    </View>
  );
}

/* ─── One slot ────────────────────────────────────────────────────────────────
   WHAT THIS IS NOT, AND WHY (2026-10-17, second pass):

   A version of this card wrote the day's state DOWN the slot as stacked
   letters — L·E·A·V·E, A·B·S·E·N·T, S·U·N·D·A·Y — borrowing the web chart's
   vertical SUNDAY label. On the web that label appears a handful of times
   across a wide chart. Here there are 31 slots 11pt wide, so a normal month
   became a wall of 7.5pt vertical words reading "ABSENT SUNDAY ABSENT
   SUNDAY" down the page, every one of them shouting, none of them a chart.

   A bar chart's job is to be READ IN ONE LOOK. Text in a slot has to be
   deciphered letter by letter, and six letters stacked in 132pt is the least
   legible way to render a word on a phone. So the state is a COLOUR and the
   legend underneath names the colours — two entries in a typical month.

   The shapes:
     • present / late / half day → a BAR, height = hours, tinted by which
     • leave / absent / holiday / weekly off → a BASELINE BLOCK: no height,
       because no hours were worked; a colour, because something happened
     • no data → a 3pt stub, so "we have nothing" differs visibly from "this
       was a day off"
     • upcoming → nothing. A day that hasn't happened has no fact to draw */
const BLOCK_H = 9; // leave / absent / holiday / weekly off
const STUB_H = 3; // no_data

function DayMark({ day, axis }) {
  const paint = dayBarOf(day.chip);

  if (day.hours > 0) {
    const h = Math.max(2, Math.round((day.hours / axis.max) * PLOT_H));
    return (
      <View
        style={{
          width: BAR_W,
          height: h,
          backgroundColor: paint.fill,
          borderWidth: 1,
          borderColor: paint.edge,
          borderTopLeftRadius: CAP_RADIUS,
          borderTopRightRadius: CAP_RADIUS,
        }}
      />
    );
  }

  if (day.chip === 'upcoming') return null;

  const isStub = day.chip === 'no_data';
  return (
    <View
      style={{
        width: BAR_W,
        height: isStub ? STUB_H : BLOCK_H,
        backgroundColor: paint.fill,
        borderWidth: isStub ? 0 : 1,
        borderColor: paint.edge,
        borderRadius: CAP_RADIUS,
      }}
    />
  );
}

/* ─── The key ─────────────────────────────────────────────────────────────────
   Only the chips THIS MONTH actually contains, in the canonical order. A key
   listing nine states for a month that holds three is a legend you have to
   read to discover is irrelevant.

   Every swatch is the same 10×10, including `no_data`, which draws as a 3pt
   stub in the plot itself: the legend's job is to name a COLOUR, and making
   each swatch mimic its mark's geometry produces a row of slivers nobody can
   tell apart. */
function Legend({ keys = [] }) {
  if (keys.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3], rowGap: space[2] }}>
      {keys.map((key) => {
        const paint = dayBarOf(key);
        return (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: paint.fill,
                borderWidth: 1,
                borderColor: paint.edge,
              }}
            />
            <Text style={text.caption}>{DAY_CHIPS[key].label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ─── The plot ────────────────────────────────────────────────────────────────
   A fixed axis on the left and the whole month scrolling beside it. The
   gridlines are drawn once, under the scroller, so they stay put while the
   bars move — a grid that slides with the content reads as the chart tipping
   over. Sundays carry a faint band: the mobile stand-in for the web's vertical
   SUNDAY label, which has nowhere to go at this width. */
function Plot({ rows, axis, todayIndex, onDayPress }) {
  const scroller = useRef(null);
  const positioned = useRef(false);

  // Open on today, with a few days of run-up behind it. Done on the first
  // content-size callback rather than in an effect: before the content is
  // measured a scrollTo is a no-op, which is why this used to open on the 1st.
  const onContentSize = useCallback(() => {
    if (positioned.current || todayIndex < 0 || !scroller.current) return;
    positioned.current = true;
    const x = Math.max(0, (todayIndex - LEAD_IN) * (SLOT_W + SLOT_GAP));
    if (x > 0) scroller.current.scrollTo({ x, animated: false });
  }, [todayIndex]);

  return (
    <View style={{ flexDirection: 'row', gap: space[2] }}>
      <View style={{ width: AXIS_W, height: PLOT_H }}>
        {axis.ticks.map((t) => (
          <Text
            key={t}
            style={[text.caption, {
              position: 'absolute',
              right: 0,
              // -7 lifts the 14pt line box so its CENTRE lands on the gridline.
              top: PLOT_H * (1 - t / axis.max) - 7,
              fontSize: 10,
              color: color.textMuted,
            }]}
          >
            {`${t}h`}
          </Text>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {/* Under the scroller, and rendered before it so it paints beneath:
            a grid that slid with the bars would read as the chart tipping
            over. `pointerEvents none` keeps it out of the bars' taps. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: PLOT_H }}
        >
          {axis.ticks.map((t) => (
            <View
              key={t}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: PLOT_H * (1 - t / axis.max),
                height: 1,
                backgroundColor: chart.grid,
              }}
            />
          ))}
        </View>

        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={onContentSize}
          contentContainerStyle={{ gap: SLOT_GAP, paddingRight: space[1] }}
        >
          {rows.map((d) => (
            <Pressable
              key={d.date}
              onPress={d.openable ? () => onDayPress?.(d.date) : undefined}
              accessibilityRole={d.openable ? 'button' : 'text'}
              accessibilityLabel={
                d.openable
                  ? `${fmtDateShort(d.date, d.date)}: ${d.spoken}. Open this day.`
                  : `${fmtDateShort(d.date, d.date)}: ${d.spoken}.`
              }
              style={({ pressed }) => ({
                width: SLOT_W,
                alignItems: 'center',
                borderRadius: radius.sm,
                backgroundColor: pressed && d.openable
                  ? color.brandSoftBg
                  : d.off ? color.borderSubtle : 'transparent',
              })}
            >
              <View style={{ height: PLOT_H, justifyContent: 'flex-end' }}>
                <DayMark day={d} axis={axis} />
              </View>
              <Text
                numberOfLines={1}
                style={[text.caption, {
                  marginTop: 6,
                  fontSize: 9,
                  color: d.isToday ? color.brand : d.off ? color.textMuted : color.textSecondary,
                }]}
              >
                {dayOfMonth(d.date)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

/**
 * @param {object} props
 * @param {{data: object|null, loading: boolean, error: any, reload: Function}} props.graph
 * @param {{year: number, month: number}} props.period
 * @param {Function} props.onChangePeriod
 * @param {Function} [props.onDayPress]  a bar was tapped → open that day's log
 */
export function MyMonthCard({ graph, period, onChangePeriod, onDayPress, shift }) {
  const { user } = useAuth();
  const summary = useMemo(() => graph.data?.summary || {}, [graph.data]);
  const joinedOn = ymdOnly(user?.joining_date || user?.date_of_joining) || '';
  const todayKey = todayYMD();
  // [0] until /attendance/shift answers. See `weeklyOffsOf` for why the
  // weekday numbers are the only honest source for this.
  const weeklyOffs = useMemo(() => weeklyOffsOf(shift), [shift]);

  const days = useMemo(() => {
    const beforeJoining = (ymd) => !!joinedOn && !!ymd && ymd < joinedOn;

    /* One slot's worth of facts. `chip` is what the slot is COLOURED by and
       `spoken` is what a screen reader hears, so the two can never disagree:
       a day drawn as leave must also be read out as leave. */
    const slot = (row, date) => {
      // A day before this person joined is nobody's absence (backend ask R-7),
      // and a day still to come has nothing to show — both are set aside
      // before the chip is read, or graph-data's blanket "absent" leaks in.
      const raw = beforeJoining(date) ? 'upcoming'
        : date > todayKey ? 'upcoming'
        : dayChipKey({ ...(row || {}), date }, todayKey);

      // THE WEEKLY OFF, WHICH graph-data DOES NOT SEND (2026-10-17).
      //
      // That endpoint reports a day with no attendance row as `absent`, and
      // it does that on the person's days off too — so a normal month came
      // back as absent, Sunday, absent, Sunday all the way down, and the
      // chart faithfully drew four absences a month that nobody had.
      //
      // The schedule lives on /attendance/shift as `weekly_offs: [0, 6]`, so
      // a day the person was never due to work is relabelled here. Only
      // `absent` and `no_data` are overridden: a Sunday somebody actually
      // worked stays present, and approved leave or a holiday that happens
      // to fall on a Sunday keeps the more specific fact.
      const chip = (raw === 'absent' || raw === 'no_data') && isWeeklyOffDate(date, weeklyOffs)
        ? 'weekly_off'
        : raw;

      const hours = WORKED_CHIPS.has(chip)
        ? Math.max(0, parseFloat(row?.effective_hours ?? row?.worked_hours ?? 0) || 0)
        : 0;
      return {
        date,
        chip,
        hours,
        openable: chip !== 'upcoming',
        spoken: beforeJoining(date) ? 'Before you joined'
          : hours > 0 ? `${workedLabel(row)} worked`
          : DAY_CHIPS[chip].label,
      };
    };

    const rows = listFrom(graph.data, ['daily', 'days'])
      .map((d) => {
        const date = ymdOnly(d.date || d.day || d.attendance_date);
        return date ? slot(d, date) : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));

    // A slot for every calendar day, so one month isn't three fat bars and the
    // next fifteen thin ones. A day the server never mentioned is `no_data`,
    // which is now a visible state rather than a gap.
    return fillMonthDays(rows, period, (date) => slot(null, date))
      .map((d) => ({ ...d, off: isWeeklyOffDate(d.date, weeklyOffs), isToday: d.date === todayKey }));
  }, [graph.data, joinedOn, todayKey, period, weeklyOffs]);

  const axis = hoursAxis(days);
  const todayIndex = days.findIndex((d) => d.isToday);

  // The chart draws whenever there is ANYTHING to say about the month — not
  // only when somebody worked. A month of nothing but leave used to render the
  // empty state, which was the defect.
  const hasAnything = days.some((d) => d.hours > 0 || (d.chip !== 'upcoming' && d.chip !== 'no_data'));

  const legendKeys = useMemo(() => {
    const present = new Set(days.map((d) => d.chip));
    // `upcoming` draws nothing, so it would be a key to an invisible mark.
    return DAY_CHIP_ORDER.filter((k) => k !== 'upcoming' && present.has(k));
  }, [days]);



  const headline = [
    { label: 'Avg / day', value: fmtHours(summary.average_hours_per_day, '0m'), icon: icons.clock },
    {
      label: 'On time',
      // Rounded: the server sends 81.818181…, and two decimal places of
      // punctuality is a precision nobody asked for and nobody can act on.
      value: `${Math.round(num(summary.punctuality_percentage))}%`,
      icon: icons.ok,
      help: { surface: 'attendance.summary', field: 'punctuality_percentage' },
    },
    { label: 'Total', value: totalWorkedLabel(summary), icon: icons.chart },
  ];

  const Chart = icons.chart;

  return (
    <Card
      tone="flat"
      style={{
        backgroundColor: color.surfaceSubtle,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.border,
        padding: space[4],
        gap: space[4],
        ...elevate('xs'),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <Text accessibilityRole="header" style={text.h2}>My month</Text>
        <MonthStepper year={period.year} month={period.month} onChange={onChangePeriod} short />
      </View>

      {graph.error ? (
        <ErrorState
          error={graph.error}
          domain="attendance"
          onRetry={graph.reload}
          fallback="We couldn’t load your month."
        />
      ) : graph.loading && !graph.data ? (
        <LoadingShape />
      ) : (
        <View style={{ gap: space[4], opacity: graph.loading ? 0.6 : 1 }}>
          <Headline items={headline} />

          {hasAnything ? (
            <>
              {/* Keyed on the month so the scroller remounts and re-positions
                  on today (or on the 1st of a past month) when it changes. */}
              <Plot
                key={`${period.year}-${period.month}`}
                rows={days}
                axis={axis}
                todayIndex={todayIndex}
                onDayPress={onDayPress}
              />
              <Legend keys={legendKeys} />
            </>
          ) : (
            <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
              {Chart ? <Chart size={iconSize.xl} color={color.borderSubtle} /> : null}
              <Text style={[text.small, { color: color.textMuted }]}>
                {`Nothing recorded for ${monthLabel(period.year, period.month)}`}
              </Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

export default MyMonthCard;
