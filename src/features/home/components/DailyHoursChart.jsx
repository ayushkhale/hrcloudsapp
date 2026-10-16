// ─────────────────────────────────────────────────────────────────────────────
// features/home/components/DailyHoursChart.jsx — worked hours per day, this month.
//
// The web dashboard's daily-hours bar chart, ported. Spec §4: a horizontal
// scroll of bars, one per day, Sundays marked, tap a bar → DayLog. The web's
// pie chart, Recharts tooltip and arrow-paging are explicitly NOT ported (§2).
//
// Drawn with Views, not a chart library: a bar is a coloured rectangle whose
// height is a fraction of the tallest day, and a tap target is a Pressable
// around it. A charting dependency for that is weight the app doesn't need, and
// it keeps the whole Home module dependency-free (loads over Metro, no rebuild).
//
// Call #6, and like the snapshot it fails independently (§5): no data, or a dead
// getGraphData, renders nothing — never an error where a chart was.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { unwrap } from '../../../lib/normalize';
import { chart, color, radius, space, text } from '../../../theme/tokens';
import { Card, CardHeader, Skeleton } from '../../../ui';

const MAX_H = 104; // tallest bar, in pt
const MIN_H = 4; // a worked-zero day still shows a sliver, so the gap reads as "0" not "missing"

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const first = (o, ...keys) => { for (const k of keys) { const v = o?.[k]; if (v !== undefined && v !== null) return v; } return null; };

const dateOf = (d) => first(d, 'date', 'day', 'attendance_date');
const hoursOf = (d) => {
  const mins = num(first(d, 'worked_minutes', 'effective_minutes'));
  if (mins != null) return mins / 60;
  const hrs = num(first(d, 'worked_hours', 'hours', 'total_hours', 'effective_hours'));
  return hrs != null ? hrs : null;
};
const isSunday = (ymd) => {
  const t = Date.parse(`${ymd}T00:00:00`);
  return Number.isNaN(t) ? false : new Date(t).getDay() === 0;
};
const dayNum = (ymd) => {
  const m = /-(\d{2})$/.exec(String(ymd || ''));
  return m ? String(Number(m[1])) : '';
};

export function DailyHoursChart({ year, month, onBarPress, reloadKey }) {
  const [state, setState] = useState({ loading: true, failed: false, rows: [] });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, failed: false }));
    attendanceAPI.getGraphData(month, year)
      .then((res) => {
        if (cancelled) return;
        const data = unwrap(res);
        const rows = Array.isArray(data) ? data : Array.isArray(data?.days) ? data.days : [];
        setState({ loading: false, failed: false, rows });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, failed: true, rows: [] }); });
    return () => { cancelled = true; };
  }, [month, year, reloadKey]);

  const { loading, failed, rows } = state;

  const bars = useMemo(() => {
    const parsed = rows
      .map((d) => ({ date: dateOf(d), hours: hoursOf(d) }))
      .filter((b) => b.date);
    const max = parsed.reduce((m, b) => Math.max(m, b.hours || 0), 0);
    return parsed.map((b) => ({
      ...b,
      h: max > 0 && b.hours ? Math.max(MIN_H, Math.round((b.hours / max) * MAX_H)) : MIN_H,
      sunday: isSunday(b.date),
    }));
  }, [rows]);

  // Independent failure or an empty month: nothing to draw.
  if (failed || (!loading && bars.length === 0)) return null;

  return (
    <Card>
      <CardHeader>Daily hours</CardHeader>
      {loading ? (
        <Skeleton type="chart" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space[2], paddingVertical: space[2], alignItems: 'flex-end' }}
        >
          {bars.map((b) => (
            <Pressable
              key={b.date}
              onPress={() => onBarPress?.(b.date)}
              accessibilityRole="button"
              accessibilityLabel={`${b.date}: ${b.hours != null ? `${b.hours.toFixed(1)} hours` : 'no hours'}. Open this day.`}
              style={{ alignItems: 'center', gap: 4, width: 22 }}
            >
              <View
                style={{
                  width: 14,
                  height: b.h,
                  borderRadius: radius.sm,
                  backgroundColor: b.sunday ? color.textMuted : chart.hoursBar,
                }}
              />
              <Text style={[text.caption, { color: b.sunday ? color.textMuted : color.textSecondary, fontSize: 10 }]}>
                {dayNum(b.date)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Card>
  );
}

export default DailyHoursChart;
