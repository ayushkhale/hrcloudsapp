// ─────────────────────────────────────────────────────────────────────────────
// features/schedules/components/ScheduleCards.jsx — the pieces My Schedules is
// built from. Every one is a house shape, so the tab reads like My Time:
//
//   ScheduleHero  the soft gradient card every tab root opens on (MonthHero's
//                 surface): the next day off, the next holiday, four figures
//   AgendaDayCard one day, as a RecordCard — the correction card's structure
//                 (user, 2026-10-22) — with the day's due items in its body
//   DueItemRow    one thing falling due, as a 44pt row inside a day card
//   LaneNotice    "couldn't load your tasks" / "showing the first 500" — the
//                 per-lane honesty the agenda contract exists for (guide §6)
//
// What each day and item SAYS lives in ../scheduleMeta.js; this file only
// draws it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { fmtDateShort } from '../../../lib/dates';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { InlineAlert, LinkButton, Pill, SkeletonBlock } from '../../../ui';
import { RecordCard } from '../../../ui/ListCards';
import { dayFigure, dayTitle, presentDay, presentItem } from '../scheduleMeta';

/* ─── ScheduleHero ─────────────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {object|null} props.summary  `data.summary` from the agenda
 * @param {boolean} props.loading      first load only — a skeleton figure
 */
export function ScheduleHero({ summary, loading = false }) {
  const nextOff = summary?.next_day_off;
  const nextHoliday = summary?.next_holiday;
  const facts = [
    { label: 'Working', value: dayFigure(summary?.working_days) },
    { label: 'Days off', value: dayFigure(summary?.weekly_offs) },
    { label: 'Holidays', value: dayFigure(summary?.holidays) },
    { label: 'Leave', value: dayFigure(summary?.leave_days) },
  ];

  return (
    <LinearGradient
      colors={[color.heroSoftFrom, color.heroSoftVia, color.heroSoftTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.heroSoftBorder,
        padding: space[4],
        gap: space[4],
      }}
    >
      <View style={{ gap: 2 }}>
        <Text style={[text.label, { color: color.brandSoftFg }]}>Your next day off</Text>
        {loading ? (
          <SkeletonBlock height={30} width="55%" />
        ) : (
          <Text numberOfLines={1} style={[text.metricLg, { fontSize: 28, lineHeight: 34, color: color.ink }]}>
            {nextOff ? fmtDateShort(nextOff, '') : 'None in this window'}
          </Text>
        )}
        {nextHoliday?.name ? (
          <Text numberOfLines={1} style={text.small}>
            {`Next holiday · ${nextHoliday.name}, ${fmtDateShort(nextHoliday.date, '')}`}
          </Text>
        ) : null}
      </View>

      {/* Divided, not boxed — the same four-up row as My Time's hero. */}
      <View style={{ flexDirection: 'row', opacity: loading ? 0.5 : 1 }}>
        {facts.map((f, i) => (
          <React.Fragment key={f.label}>
            {i > 0 ? <View style={{ width: 1, backgroundColor: color.brandSoftBorder }} /> : null}
            <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 2 }}>
              <Text numberOfLines={1} style={[text.smallStrong, { fontSize: 16 }]}>{f.value}</Text>
              <Text numberOfLines={1} style={[text.label, { fontSize: 9, color: color.textMuted }]}>{f.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </LinearGradient>
  );
}

/* ─── DueItemRow ───────────────────────────────────────────────────────────── */

/**
 * One thing falling due. A row, not a card — it lives in a card's body.
 * @param {Function} [props.onOpen]  given the item's route key; absent = not pressable
 */
export function DueItemRow({ item, onOpen }) {
  const p = presentItem(item);
  const t = toneOf(p.tone);
  const Icon = p.icon;
  const Chevron = icons.chevronRight;
  const pressable = !!(onOpen && p.route);

  const body = (pressed) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: 44,
        paddingVertical: space[1],
        borderRadius: radius.md,
        backgroundColor: pressed ? color.brandSoftBg : 'transparent',
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.full,
          backgroundColor: t.chip,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Icon ? <Icon size={15} color={t.fg} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={text.smallStrong}>{p.title}</Text>
        {p.when ? (
          <Text numberOfLines={1} style={[text.caption, p.overdue ? { color: color.danger.fg } : null]}>
            {p.when}
          </Text>
        ) : null}
      </View>
      {pressable && Chevron ? <Chevron size={16} color={color.textMuted} /> : null}
    </View>
  );

  if (!pressable) return body(false);
  return (
    <Pressable
      onPress={() => onOpen(p.route, item)}
      accessibilityRole="button"
      accessibilityLabel={`${p.title}. ${p.when}`}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/* ─── AgendaDayCard ────────────────────────────────────────────────────────── */

/**
 * One day of the agenda.
 * @param {object} props.day     a `days[]` entry
 * @param {string} props.today   YYYY-MM-DD
 * @param {Function} [props.onOpenItem]
 */
export function AgendaDayCard({ day, today, onOpenItem }) {
  const p = presentDay(day);
  const items = Array.isArray(day?.items) ? day.items : [];

  return (
    <RecordCard
      icon={p.icon}
      tone={p.tone}
      title={dayTitle(day.date, today)}
      subtitle={p.subtitle ? `${p.title} · ${p.subtitle}` : p.title}
      // A word, not a status colour: these are kinds of day, not decisions.
      badge={<Pill variant={p.off || day.day_kind === 'unassigned' ? 'muted' : 'soft'}>{p.badge}</Pill>}
      meta={p.meta}
      accessibilityLabel={`${dayTitle(day.date, today)}, ${p.title}`}
    >
      {items.length ? (
        <View style={{ gap: 2 }}>
          {items.map((item, i) => (
            <DueItemRow key={`${item.kind}:${item.id || i}`} item={item} onOpen={onOpenItem} />
          ))}
        </View>
      ) : null}
    </RecordCard>
  );
}

/* ─── LaneNotice ───────────────────────────────────────────────────────────── */

/**
 * The lanes that need saying something about. `unavailable` must never read
 * as "nothing due" (guide §6) — so it is said, with a way to try again.
 * @param {{key: string, label: string, state: string}[]} props.lanes
 */
export function LaneNotice({ lanes, onRetry }) {
  const failed = lanes.filter((l) => l.state === 'unavailable');
  const capped = lanes.filter((l) => l.state === 'truncated');
  if (!failed.length && !capped.length) return null;

  const list = (ls) => ls.map((l) => l.label).join(', ').replace(/, ([^,]*)$/, ' and $1');

  return (
    <View style={{ gap: space[2] }}>
      {failed.length ? (
        <View style={{ gap: space[1] }}>
          <InlineAlert tone="rose">
            {`We couldn’t load your ${list(failed)}, so some due items may be missing.`}
          </InlineAlert>
          {/* Outside the alert: its body is a <Text>, and a button can't live in one. */}
          {onRetry ? <LinkButton title="Try again" onPress={onRetry} align="left" /> : null}
        </View>
      ) : null}
      {capped.length ? (
        <InlineAlert tone="indigo">
          {`Showing the first 500 ${list(capped)}. Pick a shorter window to see everything.`}
        </InlineAlert>
      ) : null}
    </View>
  );
}

export default { ScheduleHero, AgendaDayCard, DueItemRow, LaneNotice };
