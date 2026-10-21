// ─────────────────────────────────────────────────────────────────────────────
// features/home/components/UpcomingCard.jsx — what is coming, on one card.
//
// TWO SOURCES, ONE LIST: upcoming holidays (/attendance/holidays) and the
// person's own APPROVED leave (/leaves/my-requests). They answer the same
// question — "which of the next few working days am I not working?" — and
// splitting them into two cards makes the reader merge them in their head.
//
// ── THE WINDOW IS 45 DAYS, AND IT IS NOT A SETTING ──────────────────────────
//
// Far enough that a holiday at the end of next month shows up while there is
// still time to plan leave around it; near enough that the card doesn't become
// a calendar. A holiday nine months out on the Home screen is noise.
//
// ── APPROVED LEAVE ONLY ─────────────────────────────────────────────────────
//
// A pending request is not a plan — it is a question somebody else hasn't
// answered. Showing it here as "upcoming" is how people end up booking flights
// against leave that gets refused. Pending requests live on the Leave tab,
// where the status is the point.
//
// ── EACH SOURCE FAILS ON ITS OWN (home spec §5) ─────────────────────────────
//
// A dead holidays call must not take the leave rows down with it, and both
// being dead renders NOTHING rather than an error block: this card is a
// convenience, and a red box where a convenience was is a worse screen than
// no card at all. The punch card above it is what matters.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { attendanceAPI, leaveAPI } from '../../../api';
import { unwrap } from '../../../lib/normalize';
import { fmtDateShort, todayYMD, ymdOnly } from '../../../lib/dates';
import { normalizeStatusKey } from '../../../lib/enums';
import { useGo, useRouteTarget } from '../../../navigation/routes';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { Card, CardHeader, IconTile, LinkButton, Skeleton } from '../../../ui';

const WINDOW_DAYS = 45;
const MAX_ROWS = 3;

const first = (o, ...keys) => {
  for (const k of keys) { const v = o?.[k]; if (v !== undefined && v !== null && v !== '') return v; }
  return null;
};

const daysUntil = (ymd) => {
  const t = Date.parse(`${ymd}T00:00:00`);
  return Number.isNaN(t) ? Infinity : Math.ceil((t - Date.now()) / 86400000);
};

/** "Today" · "Tomorrow" · "Fri, 15 Aug" — the same ladder the bell list uses. */
function whenLabel(ymd) {
  const d = daysUntil(ymd);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return fmtDateShort(ymd, '');
}

/** A date inside the window, today included, future only. */
const inWindow = (ymd) => {
  if (!ymd || ymd < todayYMD()) return false;
  const d = daysUntil(ymd);
  return d >= 0 && d <= WINDOW_DAYS;
};

export function UpcomingCard({ reloadKey }) {
  const [holidays, setHolidays] = useState({ done: false, rows: [] });
  const [leave, setLeave] = useState({ done: false, rows: [] });

  const leaveTarget = useRouteTarget('leaves');
  const holidaysTarget = useRouteTarget('holidays');
  const go = useGo();

  useEffect(() => {
    let cancelled = false;
    attendanceAPI.getUpcomingHolidays()
      .then((res) => {
        if (cancelled) return;
        const data = unwrap(res);
        const list = Array.isArray(data) ? data : (data?.holidays || data?.upcoming || []);
        setHolidays({ done: true, rows: Array.isArray(list) ? list : [] });
      })
      .catch(() => { if (!cancelled) setHolidays({ done: true, rows: [] }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    leaveAPI.getMyRequests()
      .then((res) => {
        if (cancelled) return;
        const data = unwrap(res);
        const list = Array.isArray(data) ? data : (data?.requests || data?.leave_requests || data?.leaves || []);
        setLeave({ done: true, rows: Array.isArray(list) ? list : [] });
      })
      .catch(() => { if (!cancelled) setLeave({ done: true, rows: [] }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const rows = useMemo(() => {
    const out = [];

    holidays.rows.forEach((h) => {
      const date = ymdOnly(first(h, 'date', 'holiday_date', 'day'));
      if (!inWindow(date)) return;
      out.push({
        key: `h-${date}`,
        kind: 'holiday',
        title: first(h, 'name', 'holiday_name', 'title') || 'Public holiday',
        subtitle: first(h, 'type', 'holiday_type') ? 'Public holiday' : 'Office closed',
        date,
      });
    });

    leave.rows.forEach((l, i) => {
      const status = normalizeStatusKey(first(l, 'status', 'request_status'));
      if (status !== 'approved') return;
      const from = ymdOnly(first(l, 'start_date', 'from_date', 'leave_from'));
      const to = ymdOnly(first(l, 'end_date', 'to_date', 'leave_to')) || from;
      if (!inWindow(from)) return;
      const type = first(l, 'leave_type_name', 'leave_type', 'type_name') || 'Leave';
      out.push({
        key: `l-${first(l, 'id', 'request_id') || i}`,
        kind: 'leave',
        title: typeof type === 'string' ? type : 'Leave',
        subtitle: from === to ? 'Approved · 1 day' : `Approved · until ${fmtDateShort(to, '')}`,
        date: from,
      });
    });

    return out.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, MAX_ROWS);
  }, [holidays.rows, leave.rows]);

  const loading = !holidays.done || !leave.done;

  // Nothing coming up is not worth a card. Same reasoning as a failed load:
  // Home is for what needs attention today.
  if (!loading && rows.length === 0) return null;

  const seeAll = holidaysTarget || leaveTarget;

  return (
    <Card padded={false} style={{ paddingTop: space[4], paddingBottom: space[2] }}>
      <View style={{ paddingHorizontal: space[4] }}>
        <CardHeader
          variant="title"
          right={seeAll ? <LinkButton title="View all" onPress={() => go(seeAll)} /> : undefined}
        >
          Upcoming
        </CardHeader>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
          <Skeleton type="rows" rows={2} />
        </View>
      ) : (
        <View style={{ paddingHorizontal: space[4], paddingBottom: space[2], gap: space[2] }}>
          {rows.map((r) => (
            <View
              key={r.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                paddingVertical: space[2],
              }}
            >
              <IconTile
                icon={r.kind === 'holiday' ? icons.calendar : icons.earnedLeave}
                tone={r.kind === 'holiday' ? 'amber' : 'emerald'}
                size="md"
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={text.bodyStrong}>{r.title}</Text>
                <Text numberOfLines={1} style={text.small}>{r.subtitle}</Text>
              </View>
              <View
                style={{
                  paddingHorizontal: space[2],
                  paddingVertical: 4,
                  borderRadius: radius.sm,
                  backgroundColor: color.surfaceSubtle,
                  borderWidth: 1,
                  borderColor: color.borderSubtle,
                }}
              >
                <Text style={[text.caption, { color: color.textLabel }]}>{whenLabel(r.date)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

export default UpcomingCard;
