// ─────────────────────────────────────────────────────────────────────────────
// features/home/components/AttendanceMixCard.jsx — how the month went.
//
// The web dashboard's "Attendance mix" donut, ported: the same four slices in
// the same order and the same four colours (theme/tokens.js `chart.mix`, which
// is the web's MIX array to the hex), the same centre figure, and the same two
// extra rows — late arrivals and overtime — under a divider.
//
// Like every other section on Home it is FLAT: no card, no border, no shadow
// and no padding of its own, so its heading lines up with the screen gutter
// and the donut is the only shape on it. The web's subtitle ("How your 14 days
// in October 2026 went") is gone — the donut's own centre already reads
// "10 / of 14 present", and the month is named in the stepper above.
//
// ── FOUR SLICES. NEVER A FIFTH ───────────────────────────────────────────────
//
// `late_days` OVERLAPS `present_days`: a late day is a present day. Adding it
// as a slice makes the donut add up to more than the month, which is why it is
// a LEGEND ROW under the divider and not a wedge. The same rule is written on
// `chart.mix` in tokens.js; this is the component that would break it.
//
// ── THE DONUT IS FOUR ARCS, NOT A CHART LIBRARY ──────────────────────────────
//
// react-native-svg is already in the binary (ProgressRing uses it). Each slice
// is one stroked circle with a dash pattern — length = its share of the
// circumference, offset = everything before it. A small gap is taken off every
// slice's dash so the wedges read apart without a white ring drawn over them.
//
// ── WHY ABSENCES BEFORE THE JOINING DATE COME OFF ────────────────────────────
//
// Same reason as MyMonthCard: graph-data marks every unrecorded day absent,
// including the ones before this person existed as an employee (backend ask
// R-7). The web dashboard subtracts them here too — keep the two in step.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../../../state/AuthContext';
import { listFrom, num } from '../../../lib/normalize';
import { fmtMinutes, monthLabel, ymdOnly } from '../../../lib/dates';
import { dayChipKey } from '../../../lib/dayStatus';
import { isWeeklyOffDate, weeklyOffsOf } from '../../../lib/monthChart';
import { chart, color, palette, space, text } from '../../../theme/tokens';
import { ErrorState, SkeletonBlock } from '../../../ui';

const SIZE = 128;
const STROKE = 20;
// Arc length of the gap between two wedges. Any slice too small to survive it
// keeps a hairline rather than vanishing.
const GAP = 3;

/** The donut. `slices` are already filtered to the ones with a value. */
function Donut({ slices, total, children }) {
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;

  let cursor = 0;
  const arcs = slices.map((s) => {
    const len = (s.value / total) * c;
    const drawn = Math.max(1, len - GAP);
    const arc = { key: s.key, color: s.color, drawn, offset: cursor + GAP / 2, rest: c - drawn };
    cursor += len;
    return arc;
  });

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={SIZE}
        height={SIZE}
        // Start the first wedge at 12 o'clock and sweep clockwise — the one
        // orientation everybody reads without thinking about it.
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        {arcs.map((a) => (
          <Circle
            key={a.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={STROKE}
            strokeDasharray={`${a.drawn} ${a.rest}`}
            // Negative, because dashoffset counts BACKWARDS along the path.
            strokeDashoffset={-a.offset}
          />
        ))}
      </Svg>
      {children}
    </View>
  );
}

/* The first load, in this section's own shape — a disc over four rows. */
function LoadingShape() {
  return (
    <View style={{ gap: space[5] }}>
      <View style={{ alignItems: 'center' }}>
        <SkeletonBlock width={SIZE} height={SIZE} radius={SIZE / 2} />
      </View>
      <View style={{ gap: space[3] }}>
        {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={14} />)}
      </View>
    </View>
  );
}

function LegendRow({ dot, label, value, suffix, divided }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
        paddingTop: divided ? space[3] : 0,
        marginTop: divided ? space[1] : 0,
        borderTopWidth: divided ? 1 : 0,
        borderTopColor: color.borderSubtle,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexShrink: 1 }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot }} />
        <Text numberOfLines={1} style={[text.small, { color: color.textLabel, flexShrink: 1 }]}>
          {label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={[text.smallStrong, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
        {suffix ? <Text style={[text.caption, { fontVariant: ['tabular-nums'] }]}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

/**
 * @param {object} props
 * @param {{data: object|null, loading: boolean, error: any, reload: Function}} props.graph
 * @param {{year: number, month: number}} props.period
 */
export function AttendanceMixCard({ graph, period, shift }) {
  const { user } = useAuth();
  // `|| {}` makes a NEW object every render, which would re-run the memo below
  // on every tick of the punch card's clock. Memoised on the payload itself.
  const summary = useMemo(() => graph.data?.summary || {}, [graph.data]);
  const joinedOn = ymdOnly(user?.joining_date || user?.date_of_joining) || '';
  const weeklyOffs = useMemo(() => weeklyOffsOf(shift), [shift]);

  const { mix, markedDays, daysOff } = useMemo(() => {
    const daily = listFrom(graph.data, ['daily', 'days']);
    const phantomAbsences = !joinedOn ? 0 : daily.filter((d) => {
      const date = ymdOnly(d.date || d.day || d.attendance_date);
      return !!date && date < joinedOn && d.status === 'absent';
    }).length;

    // Weekly offs and holidays are NOT a slice: they are days nothing was due,
    // so counting them in a donut of "how the month went" would dilute every
    // other share by the weekends. They get a row under the divider instead —
    // which is also the answer to "why doesn't the mix know about Sundays".
    // graph-data never sends `weekly_off`: a day off comes back as `absent`
    // like any other day with no attendance row. So the schedule from
    // /attendance/shift decides it, exactly as the month chart does — or this
    // row reads "0" every month while four Sundays sit in the absent slice.
    const off = daily.filter((d) => {
      const date = ymdOnly(d.date || d.day || d.attendance_date);
      const key = dayChipKey({ ...d, date });
      if (key === 'weekly_off' || key === 'holiday') return true;
      return (key === 'absent' || key === 'no_data') && isWeeklyOffDate(date, weeklyOffs);
    }).length;

    // The same days, counted again as the ones the SUMMARY is wrong about.
    // `absent_days` is a server total and it includes the days off, so the
    // slice has to lose them too — otherwise the donut keeps showing four
    // absences a month while the row underneath says four days off.
    const offAbsences = daily.filter((d) => {
      const date = ymdOnly(d.date || d.day || d.attendance_date);
      if (!date || (joinedOn && date < joinedOn)) return false; // already in phantomAbsences
      return dayChipKey({ ...d, date }) === 'absent' && isWeeklyOffDate(date, weeklyOffs);
    }).length;

    const slices = chart.mix.map((m) => ({
      ...m,
      value: m.key === 'absent'
        ? Math.max(0, num(summary[m.field]) - phantomAbsences - offAbsences)
        : num(summary[m.field]),
    }));
    return { mix: slices, markedDays: slices.reduce((s, m) => s + m.value, 0), daysOff: off };
  }, [graph.data, joinedOn, summary, weeklyOffs]);

  const monthName = monthLabel(period.year, period.month);
  const drawn = mix.filter((m) => m.value > 0);

  return (
    <View style={{ gap: space[4] }}>
      <Text accessibilityRole="header" style={text.h2}>Attendance mix</Text>

      {graph.error ? (
        <ErrorState
          error={graph.error}
          domain="attendance"
          onRetry={graph.reload}
          fallback="We couldn’t load your attendance mix."
        />
      ) : graph.loading && !graph.data ? (
        <LoadingShape />
      ) : markedDays === 0 ? (
        <Text style={[text.small, { color: color.textMuted, paddingVertical: space[6], textAlign: 'center' }]}>
          {`No attendance recorded for ${monthName}.`}
        </Text>
      ) : (
        // Donut over legend, not beside it: at 128pt the donut and a four-row
        // legend side by side leave the labels about 90pt to live in, and
        // "Half day" wraps.
        <View style={{ gap: space[5], opacity: graph.loading ? 0.6 : 1 }}>
          <View style={{ alignItems: 'center' }}>
            <Donut slices={drawn} total={markedDays}>
              <View style={{ alignItems: 'center' }}>
                <Text style={[text.metric, { fontSize: 26, lineHeight: 30 }]}>{mix[0].value}</Text>
                <Text style={[text.caption, { marginTop: 2 }]}>{`of ${markedDays} present`}</Text>
              </View>
            </Donut>
          </View>

          <View style={{ gap: space[3] }}>
            {mix.map((m) => (
              <LegendRow
                key={m.key}
                dot={m.color}
                label={m.label}
                value={m.value}
                suffix={`${Math.round((m.value / markedDays) * 100)}%`}
              />
            ))}
            {/* Under the divider, because neither is a share of the month:
                a late day is also a present day, and overtime is time. */}
            <LegendRow
              divided
              dot={palette.fuchsia[500]}
              label="Late arrivals"
              value={num(summary.late_days)}
            />
            <LegendRow
              dot={palette.purple[500]}
              label="Overtime"
              value={fmtMinutes(summary.total_overtime_minutes, '0m')}
            />
            {/* Weekly offs and holidays. Shown only when the month has them,
                so a row reading "0" never implies somebody worked 31 days. */}
            {daysOff > 0 ? (
              <LegendRow
                dot={palette.slate[300]}
                label="Weekly offs & holidays"
                value={daysOff}
              />
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

export default AttendanceMixCard;
