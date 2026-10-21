// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/HolidaysTab.jsx — My Time › Holidays.
//
// The organisation's holiday list: which days the office is closed, and which
// of them are optional. The web shows it as a widget at the bottom of the
// leave page; on a phone it is the answer to "is Monday a holiday or do I
// need to apply for leave?", which is worth its own tile.
//
// ── A CALENDAR TILE, NOT A LIST ROW (2026-10-18) ────────────────────────────
//
// Each holiday is a compact card, THREE across (user, 2026-10-21 — two
// across took too much room), and it leads with the date the way a wall
// calendar does: the month above a large day number, the occasion's icon
// opposite (hrcloudsweb's icon set), the name, then the weekday.
//
// ── ALL HOLIDAYS VISIBLE AT ONCE ────────────────────────────────────────────
//
// All holidays for the year are presented in a unified chronological grid.
// No hiding past holidays or "show earlier" toggle — everything is directly
// accessible at a glance.
//
// ── NO ACTION HERE, BY DESIGN (§2) ──────────────────────────────────────────
//
// Optional holidays are opted into through HR on the web, and there is no
// employee-facing endpoint for it. An optional day is LABELLED as optional
// and nothing more — a button that 403s is worse than no button.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { fmtWeekday, parseYMDLocal, todayYMD, ymdOnly } from '../../../lib/dates';
import { normalizeStatusKey } from '../../../lib/enums';
import { MONTHS_SHORT } from '../../../lib/format';
import { toList } from '../../../lib/normalize';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState, ErrorState } from '../../../ui';
import { CardsSkeleton, cardListStyle } from '../../../ui/ListCards';

const dateOf = (h) => ymdOnly(h?.date || h?.holiday_date || h?.day);
const nameOf = (h) => h?.name || h?.holiday_name || h?.title || 'Public holiday';

/* `is_optional` / `type: 'optional'` / `holiday_type: 'restricted'` — the
   payload has used all three names for the same idea. "Restricted holiday" is
   the Indian payroll term for one you may choose to take. */
const isOptional = (h) => {
  if (h?.is_optional === true || h?.optional === true) return true;
  const t = normalizeStatusKey(h?.type || h?.holiday_type);
  return t === 'optional' || t === 'restricted';
};

/** The two halves of the calendar block: "Oct" over "26". MONTHS_SHORT, not a
    local array — en-IN writes September as "Sept" and a second copy here would
    quietly disagree with every other date in the app. */
function datePieces(ymd) {
  const d = parseYMDLocal(ymd);
  if (!d) return { month: '', day: '' };
  return { month: MONTHS_SHORT[d.getMonth()] || '', day: String(d.getDate()).padStart(2, '0') };
}

/**
 * Festival / holiday icon resolver based on the HR Clouds web app pattern
 * (AttendanceHolidaysPage.jsx). Returns a Heroicon component suited to the occasion.
 */
function getHolidayIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('independence') || n.includes('republic')) return icons.flag;
  if (n.includes('diwali') || n.includes('deepavali')) return icons.fire || icons.sparkles;
  if (n.includes('holi')) return icons.paint || icons.sparkles;
  if (n.includes('christmas')) return icons.gift || icons.sparkles;
  if (n.includes('new year')) return icons.sparkles;
  if (
    n.includes('eid')
    || n.includes('ramzan')
    || n.includes('ramadan')
    || n.includes('bakrid')
    || n.includes('muharram')
  ) {
    return icons.moon;
  }
  if (n.includes('gandhi')) return icons.heart || icons.flag;
  if (
    n.includes('dussehra')
    || n.includes('dasara')
    || n.includes('navratri')
    || n.includes('durga')
    || n.includes('shivratri')
    || n.includes('janmashtami')
    || n.includes('ganesh')
  ) {
    return icons.star;
  }
  if (n.includes('good friday') || n.includes('easter')) return icons.heart;
  if (
    n.includes('guru nanak')
    || n.includes('baisakhi')
    || n.includes('makar')
    || n.includes('pongal')
    || n.includes('chhath')
    || n.includes('chhat')
  ) {
    return icons.sun;
  }
  if (n.includes('labour') || n.includes('may day')) return icons.work;
  return icons.holiday || icons.calendar;
}

const COLUMNS = 3;

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: space[2] + 2,
    paddingVertical: space[2] + 2,
    gap: space[2],
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  dateMonth: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dateDay: {
    fontSize: 22,
    lineHeight: 25,
  },
  iconChip: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/* ─── One holiday ───────────────────────────────────────────────────────────
   A third of the width (user, 2026-10-21: "holidays card take too much space,
   show 3 in one line"). The date leads — month over day, wall-calendar style —
   with the occasion's icon opposite it; the name under that, two lines at
   most; then the weekday, and "Optional" when it is one. The old two-across
   card spent 144pt of height on a separate date tile and a footer row. */

function HolidayCard({ ymd, holiday, past }) {
  const { month, day } = datePieces(ymd);
  const optional = isOptional(holiday);
  // A past holiday keeps its shape and loses its colour — it is still a fact,
  // it just isn't news. Slate for gone, purple for coming.
  const tone = toneOf(past ? 'slate' : 'purple');
  // The weekday, because a holiday that lands on a Sunday is not a day off and
  // people want to know before they plan around it.
  const weekday = fmtWeekday(ymd, '').slice(0, 3);
  const HolidayIcon = getHolidayIcon(nameOf(holiday));

  return (
    <View style={[styles.card, { borderColor: past ? color.borderSubtle : tone.border }]}>
      <View style={styles.top}>
        <View>
          <Text style={[text.caption, styles.dateMonth, { color: tone.fg }]}>{month}</Text>
          <Text style={[text.metric, styles.dateDay, { color: past ? color.textSecondary : color.brand }]}>{day}</Text>
        </View>
        {HolidayIcon ? (
          <View style={[styles.iconChip, { backgroundColor: past ? color.surfaceSubtle : tone.chip }]}>
            <HolidayIcon size={14} color={past ? color.textMuted : tone.fg} />
          </View>
        ) : null}
      </View>

      <Text
        numberOfLines={2}
        style={[text.smallStrong, { fontSize: 12.5, lineHeight: 16 }, past ? { color: color.textSecondary } : null]}
      >
        {nameOf(holiday)}
      </Text>

      <Text numberOfLines={1} style={[text.caption, { fontSize: 10.5 }]}>
        {optional ? `${weekday} · Optional` : weekday}
      </Text>
    </View>
  );
}

export function HolidaysTab() {
  const holidays = useResource(() => attendanceAPI.getUpcomingHolidays(), {
    // The web reads `res.data` as an array OR `res.data.holidays`
    // (LeaveDashboard.jsx `loadHolidays`). `toList` covers both, plus the two
    // other keys this endpoint has answered with.
    select: (data) => toList(data, ['holidays', 'upcoming', 'records']),
    initial: [],
  });

  const { refreshControl } = useListRefresh(holidays.reload, holidays.loading);

  // All holidays sorted chronologically — shown all at once
  const rows = useMemo(() => {
    return (holidays.data || [])
      .map((h) => ({ raw: h, date: dateOf(h) }))
      .filter((r) => !!r.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [holidays.data]);

  // The last row is padded with empty cells, so a lone holiday at the end
  // stays a third wide instead of stretching across the row.
  const cells = useMemo(() => {
    const out = [...rows];
    while (out.length % COLUMNS) out.push({ filler: true, date: `filler-${out.length}` });
    return out;
  }, [rows]);

  if (holidays.error && (holidays.data || []).length === 0) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState
          error={holidays.error}
          domain="attendance"
          onRetry={holidays.reload}
          fallback="We couldn’t load the holiday list."
        />
      </View>
    );
  }

  return (
    <FlatList
      data={cells}
      keyExtractor={(r) => r.date}
      numColumns={COLUMNS}
      // `columnWrapperStyle` is what puts the gutter BETWEEN the cards;
      // `cardListStyle` already supplies the outer one.
      columnWrapperStyle={{ gap: space[2] }}
      renderItem={({ item }) => (item.filler
        ? <View style={{ flex: 1 }} />
        : <HolidayCard ymd={item.date} holiday={item.raw} past={item.date < todayYMD()} />
      )}
      ListEmptyComponent={
        holidays.loading ? (
          <CardsSkeleton rows={4} height={104} />
        ) : (
          <EmptyState
            icon={icons.calendar}
            title="No holidays listed"
            message="Your organisation hasn’t published a holiday list yet."
          />
        )
      }
      contentContainerStyle={cardListStyle}
      refreshControl={refreshControl}
    />
  );
}

export default HolidaysTab;

