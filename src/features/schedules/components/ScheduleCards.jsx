// ─────────────────────────────────────────────────────────────────────────────
// features/schedules/components/ScheduleCards.jsx — the pieces My Schedules is
// built from. Every one is a house shape, so the tab reads like My Time:
//
//   ScheduleHero   the soft gradient card every tab root opens on (MonthHero's
//                  surface): the next day off, the next holiday, four figures
//   AgendaDayCard  one day, as a RecordCard — the correction card's structure
//                  (user, 2026-10-22) — with the day's due items in its body
//   DueItemRow     one thing falling due, as a 44pt row inside a day card
//   WeekdayOffRow  seven chips, Sun→Sat, the off ones filled — the web's
//                  weekday grid at phone width
//   GradingLadder  the hours bands a day is graded into
//   RuleCard       one published rule: label, figure, and what it means
//   LaneNotice     "couldn't load your tasks" / "showing the first 500" — the
//                  per-lane honesty the agenda contract exists for (guide §6)
//
// WHAT EACH ONE SAYS lives in ../scheduleMeta.js and lib/policyRules.js, both
// ported from the web (§10); this file only draws it. The hero's figures are
// `summaryTiles()` — four tiles, the same four the web shows, including the
// "Falling due" count this screen used to drop while printing weekly offs and
// holidays as two separate figures the web had deliberately merged.
//
// THE LADDER IS THE ONE DRAWN FIGURE HERE, for the web's reason: "4h half ·
// 8h full" is the line people misread on this screen, because it doesn't say
// what happens BELOW the first threshold. As bands it does. Everything else is
// a label and a number, which is what §1 asks for.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { fmtDateShort, fmtMinutes } from '../../../lib/dates';
import { fullDayMinutes, halfDayMinutes, graceMinutes } from '../../../lib/policyRules';
import { color, radius, space, text, toneOf } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { InlineAlert, LinkButton, Pill, SkeletonBlock } from '../../../ui';
import { CardShell, RecordCard } from '../../../ui/ListCards';
import { dayTitle, presentDay, presentItem, summaryTiles } from '../scheduleMeta';

/* ─── ScheduleHero ─────────────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {object|null} props.summary  `data.summary` from the agenda
 * @param {boolean} props.loading      first load only — a skeleton figure
 */
export function ScheduleHero({ summary, loading = false }) {
  const nextOff = summary?.next_day_off;
  const nextHoliday = summary?.next_holiday;
  // Four tiles even before the payload lands, so the row doesn't reflow.
  const facts = summary ? summaryTiles(summary) : summaryTiles({});

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
            {nextOff ? fmtDateShort(nextOff, '') : 'None this week'}
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
          <React.Fragment key={f.key}>
            {i > 0 ? <View style={{ width: 1, backgroundColor: color.brandSoftBorder }} /> : null}
            <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 2 }}>
              <Text numberOfLines={1} style={[text.smallStrong, { fontSize: 14 }]}>{f.value}</Text>
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
      // An ordinary working day gets NO badge — badging every one of them is
      // what makes the exceptions invisible (scheduleMeta DAY_KINDS).
      badge={p.badge ? <Pill variant={p.off ? 'muted' : 'soft'}>{p.badge}</Pill> : null}
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

/* ─── WeekdayOffRow ────────────────────────────────────────────────────────── */

/**
 * The week as seven chips, the days off filled. The web draws a 7-column grid
 * with "Off"/"In" under each name; at 360pt the word doesn't fit under a chip,
 * so the fill carries it and the phrase above the row says it in words — the
 * figure is never read by colour alone either way.
 * @param {{key: string, short: string, off: boolean}[]} props.days
 */
export function WeekdayOffRow({ days }) {
  const t = toneOf('purple');
  return (
    <View style={{ flexDirection: 'row', gap: space[1] }}>
      {days.map((d) => (
        <View
          key={d.key}
          accessibilityLabel={`${d.short}, ${d.off ? 'day off' : 'working'}`}
          style={{
            flex: 1,
            minWidth: 0,
            paddingVertical: space[2],
            borderRadius: radius.md,
            alignItems: 'center',
            // Fill or border, not both (§5) — the off chips are the tint, the
            // working ones the plain surface behind them.
            backgroundColor: d.off ? t.chip : color.surfaceSubtle,
          }}
        >
          <Text
            numberOfLines={1}
            style={[text.label, { fontSize: 10, color: d.off ? t.fg : color.textMuted }]}
          >
            {d.short}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ─── GradingLadder ────────────────────────────────────────────────────────── */

/**
 * How many hours make how much of a day, as bands whose WIDTH is the hours
 * they cover — so "stop at three hours and the day counts for nothing" is
 * something you can see rather than infer from two numbers in a row.
 *
 * Hidden entirely when the policy publishes neither threshold: a missing
 * backend figure degrades to a hidden control, never a guess (§6).
 */
export function GradingLadder({ policy }) {
  const half = halfDayMinutes(policy);
  const full = fullDayMinutes(policy);
  if (half === null && full === null) return null;

  const t = toneOf('purple');
  // The axis runs two hours past the top threshold, so the last band has room
  // to be a band rather than a sliver at the end.
  const top = (full ?? half * 2) + 120;
  const bands = [];
  if (half !== null) {
    bands.push({ key: 'none', from: 0, to: half, label: 'No Attendance', bg: color.surfaceSubtle, fg: color.textMuted });
    if (full !== null) {
      bands.push({ key: 'half', from: half, to: full, label: 'Half Day', bg: t.chip, fg: t.fg });
    } else {
      bands.push({ key: 'half', from: half, to: top, label: 'Half Day +', bg: color.brand, fg: color.textOnBrand });
    }
  } else {
    bands.push({ key: 'none', from: 0, to: full, label: 'Below Full Day', bg: color.surfaceSubtle, fg: color.textMuted });
  }
  if (full !== null) {
    bands.push({ key: 'full', from: full, to: top, label: 'Full Day', bg: color.brand, fg: color.textOnBrand });
  }

  return (
    <View style={{ gap: space[2] }}>
      {/* Visual threshold bands */}
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {bands.map((b) => (
          <View
            key={b.key}
            style={{
              width: `${((b.to - b.from) / top) * 100}%`,
              height: 36,
              borderRadius: radius.md,
              backgroundColor: b.bg,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              paddingHorizontal: 2,
            }}
          >
            <Text numberOfLines={1} style={[text.label, { fontSize: 9.5, color: b.fg, fontWeight: '700' }]}>{b.label}</Text>
          </View>
        ))}
      </View>

      {/* Boundary time markers */}
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {bands.map((b) => (
          <View key={b.key} style={{ width: `${((b.to - b.from) / top) * 100}%` }}>
            <Text numberOfLines={1} style={[text.caption, { textAlign: 'right', fontSize: 10.5, color: color.textSecondary, fontWeight: '600' }]}>
              {b.to === top ? '' : fmtMinutes(b.to)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ─── PolicyHeroCard ──────────────────────────────────────────────────────── */

export function PolicyHeroCard({ policy, targeting, ladderShown }) {
  const half = halfDayMinutes(policy);
  const full = fullDayMinutes(policy);
  const grace = graceMinutes(policy);

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
        gap: space[3.5],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2.5], flex: 1, minWidth: 0 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: color.brandSoftBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icons.rules ? <icons.rules size={20} color={color.brand} /> : null}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[text.h2, { fontSize: 18, lineHeight: 22, color: color.ink }]}>
              {policy.name || 'Attendance Policy'}
            </Text>
            <Text numberOfLines={1} style={[text.caption, { color: color.textMuted }]}>
              {targeting || (policy.is_default ? 'Organisation Standard Rules' : 'Assigned Rule Set')}
            </Text>
          </View>
        </View>
        <Pill variant="soft" tone="purple">
          {policy.is_default ? 'Default' : 'Assigned'}
        </Pill>
      </View>

      {/* Quick Threshold Highlights Row */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: color.surface,
          borderRadius: radius.lg,
          paddingVertical: space[2.5],
          paddingHorizontal: space[3],
          borderWidth: 1,
          borderColor: color.borderSubtle,
        }}
      >
        <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <Text numberOfLines={1} style={[text.smallStrong, { fontSize: 13, color: color.ink }]}>
            {full !== null ? fmtMinutes(full) : '—'}
          </Text>
          <Text numberOfLines={1} style={[text.label, { fontSize: 9, color: color.textMuted }]}>
            FULL DAY
          </Text>
        </View>
        <View style={{ width: 1, backgroundColor: color.borderSubtle }} />
        <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <Text numberOfLines={1} style={[text.smallStrong, { fontSize: 13, color: color.ink }]}>
            {half !== null ? fmtMinutes(half) : '—'}
          </Text>
          <Text numberOfLines={1} style={[text.label, { fontSize: 9, color: color.textMuted }]}>
            HALF DAY
          </Text>
        </View>
        <View style={{ width: 1, backgroundColor: color.borderSubtle }} />
        <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <Text numberOfLines={1} style={[text.smallStrong, { fontSize: 13, color: color.ink }]}>
            {grace !== null ? (grace === 0 ? '0m' : fmtMinutes(grace)) : '—'}
          </Text>
          <Text numberOfLines={1} style={[text.label, { fontSize: 9, color: color.textMuted }]}>
            GRACE TIME
          </Text>
        </View>
      </View>

      {/* Visual Ladder */}
      {ladderShown ? (
        <View style={{ gap: space[2], marginTop: space[1] }}>
          <Text style={[text.label, { fontSize: 10, color: color.brandSoftFg, letterSpacing: 0.5 }]}>
            WORK HOURS GRADING LADDER
          </Text>
          <GradingLadder policy={policy} />
        </View>
      ) : null}
    </LinearGradient>
  );
}

/* ─── RuleCard ─────────────────────────────────────────────────────────────── */

const RULE_CONFIGS = {
  grace_minutes: {
    icon: icons.clock,
    tone: 'amber',
    category: 'Punctuality',
  },
  full_day_min_hours: {
    icon: icons.rules,
    tone: 'purple',
    category: 'Day Grading',
  },
  max_break_duration_minutes: {
    icon: icons.pause,
    tone: 'blue',
    category: 'Breaks',
  },
  regularization_window_days: {
    icon: icons.clipboardCheck,
    tone: 'indigo',
    category: 'Corrections',
  },
  overtime_enabled: {
    icon: icons.overtime,
    tone: 'fuchsia',
    category: 'Overtime',
  },
  auto_clock_out_enabled: {
    icon: icons.clockOut,
    tone: 'rose',
    category: 'Auto Close',
  },
};

/**
 * One published rule: rendered as a modern, distinct Card with a semantic icon chip,
 * category badge, prominent value pill, and a clear consequence callout.
 */
export function RuleCard({ rule }) {
  const config = RULE_CONFIGS[rule.key] || {
    icon: icons.info,
    tone: 'slate',
    category: 'Policy Rule',
  };
  const t = toneOf(config.tone);
  const Icon = config.icon;

  return (
    <CardShell style={{ padding: space[3.5], gap: space[2.5] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: radius.md,
            backgroundColor: t.chip,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {Icon ? <Icon size={21} color={t.fg} /> : null}
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={[text.label, { fontSize: 9.5, color: color.textMuted, letterSpacing: 0.5 }]}>
            {config.category.toUpperCase()}
          </Text>
          <Text numberOfLines={1} style={[text.bodyStrong, { fontSize: 15, color: color.ink }]}>
            {rule.label}
          </Text>
        </View>

        <View style={{ alignSelf: 'center' }}>
          <Pill variant="soft" tone={config.tone}>
            {rule.value}
          </Pill>
        </View>
      </View>

      {/* Explanation callout */}
      {rule.note ? (
        <View
          style={{
            backgroundColor: color.surfaceSubtle,
            borderRadius: radius.md,
            paddingHorizontal: space[3],
            paddingVertical: space[2],
            borderLeftWidth: 3,
            borderLeftColor: t.fg,
          }}
        >
          <Text style={[text.small, { color: color.textSecondary, lineHeight: 18 }]}>
            {rule.note}
          </Text>
        </View>
      ) : null}
    </CardShell>
  );
}

/* ─── LaneNotice ───────────────────────────────────────────────────────────── */

export function LaneNotice({ failed = [], capped = [], onRetry }) {
  if (!failed.length && !capped.length) return null;

  const list = (ls) => ls.join(', ').replace(/, ([^,]*)$/, ' and $1');

  return (
    <View style={{ gap: space[2] }}>
      {failed.length ? (
        <View style={{ gap: space[1] }}>
          <InlineAlert tone="rose">
            {`We couldn’t load your ${list(failed)}, so some due items may be missing.`}
          </InlineAlert>
          {onRetry ? <LinkButton title="Try again" onPress={onRetry} align="left" /> : null}
        </View>
      ) : null}
      {capped.length ? (
        <InlineAlert tone="indigo">
          {`Showing the first 500 ${list(capped)}, so a few may be missing.`}
        </InlineAlert>
      ) : null}
    </View>
  );
}

export default {
  ScheduleHero, AgendaDayCard, DueItemRow, WeekdayOffRow, GradingLadder, PolicyHeroCard, RuleCard, LaneNotice,
};
