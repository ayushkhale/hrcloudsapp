// The traps the forward-view integration guide names (web ref docs, md_updates/
// 2026-10-22_frontend_my_schedule_forward_view_integration_guide.md and the v2
// enriched-agenda guide beside it), checked against their own example payloads
// — so the schedule screen reads the agenda the way the backend says it must.
//
// Several of these also pin this file to the web's `agendaMeta.js`, which it is
// a port of (CLAUDE.md §10): the day labels, the item wording and the summary
// figures are asserted in the WEB's words, because the whole point of the port
// is that the two products say the same thing about the same payload.

import {
  agendaRange, dayCardLabel, dayHeadline, dayReason, dayTitle, dueTime, employeeTargeting,
  failedLaneNames, flattenAgendaItems, itemDate, mergeAgendaItems, presentDay, presentItem,
  shiftWindow, summaryTiles, weekdayOffRow, weeklyOffPhrase, weeklyOffRule, weeksOf,
  weeklyOffRules, windowRange, worstLaneState,
} from '../src/features/schedules/scheduleMeta';
import { weeklyOffNames } from '../src/lib/policyRules';

const SHIFT = {
  id: 's1', name: 'General Day Shift', start_time: '09:30:00', end_time: '18:30:00',
  is_overnight: false, timezone: 'Asia/Kolkata', source: 'assignment',
};

describe('the window', () => {
  it('is the next 7 days, today included — the web’s one window', () => {
    const { from, to } = agendaRange();
    expect(windowRange(from, 7)).toEqual({ from, to });
  });
  it('is inclusive: 30 days from the 22nd ends on the 20th of next month', () => {
    expect(windowRange('2026-10-22', 30)).toEqual({ from: '2026-10-22', to: '2026-11-20' });
  });
  it('never asks for more than the 92-day cap', () => {
    expect(windowRange('2026-10-22', 400).to).toBe('2027-01-21');
  });
});

describe('a day', () => {
  it('working: the shift name, its window in the strip, and NO badge', () => {
    const p = presentDay({ date: '2026-10-22', day_kind: 'working', shift: SHIFT, items: [] });
    expect(p.title).toBe('General Day Shift');
    expect(p.meta).toEqual([{ label: 'Shift', value: '09:30 am – 06:30 pm' }]);
    // An ordinary working day is the baseline: badging all five is what makes
    // the two exceptions in a week invisible (DAY_KINDS).
    expect(p.badge).toBeNull();
  });

  it('the headline is the hours, the card label is the name', () => {
    const day = { day_kind: 'working', shift: SHIFT };
    expect(dayHeadline(day)).toBe('09:30 am – 06:30 pm');
    expect(dayCardLabel(day)).toBe('General Day Shift');
  });

  it('a rotation says it is rotating (§3.5 source)', () => {
    const p = presentDay({ day_kind: 'working', shift: { ...SHIFT, source: 'rotation' } });
    expect(p.meta.map((m) => m.value)).toContain('Rotating');
  });

  it('an overnight shift is marked +1, on its start day only', () => {
    expect(shiftWindow({ ...SHIFT, start_time: '21:00:00', end_time: '06:00:00', is_overnight: true }))
      .toBe('09:00 pm – 06:00 am (+1)');
  });

  it('half_day_leave keeps the shift AND the leave (§4.2)', () => {
    const p = presentDay({
      day_kind: 'half_day_leave',
      shift: SHIFT,
      leave: { leave_type_name: 'Sick Leave', portion: 'first_half' },
    });
    expect(p.title).toBe('Half day');
    expect(p.badge).toBe('Half day');
    expect(p.meta).toEqual([
      { label: 'Shift', value: '09:30 am – 06:30 pm' },
      { label: 'Leave', value: 'first half' },
    ]);
    expect(dayHeadline(p === null ? {} : {
      day_kind: 'half_day_leave', leave: { leave_type_name: 'Sick Leave' },
    })).toBe('Half day · Sick Leave');
  });

  it('a holiday with no holiday row is a "Non-working day" (§4.3)', () => {
    expect(presentDay({ day_kind: 'holiday', holiday: null, status_reason: 'exception_non_working' }).title)
      .toBe('Non-working day');
  });

  it('leave with no readable type is "On leave" (§3.5)', () => {
    expect(presentDay({ day_kind: 'leave', leave: { leave_type_name: null, portion: 'full' } }).title)
      .toBe('On leave');
  });

  it('a weekend inside a leave span stays a weekly off (§4.1)', () => {
    const p = presentDay({ day_kind: 'weekly_off', leave: null });
    expect(p.title).toBe('Weekly off');
    expect(p.badge).toBe('Weekly off');
  });

  it('a weekly off names the day its rule matched, when v2 sent one', () => {
    expect(dayCardLabel({ day_kind: 'weekly_off', weekly_off: { day_name: 'Saturday' } }))
      .toBe('Saturday off');
  });

  it('unassigned is neutral, and says which kind (§4.4)', () => {
    expect(presentDay({ day_kind: 'unassigned', status_reason: 'before_joining' }).title).toBe('Before you joined');
    expect(presentDay({ day_kind: 'unassigned', status_reason: 'upcoming' }).title).toBe('No shift');
  });

  it('an unknown kind degrades to N/A instead of crashing', () => {
    expect(presentDay({ day_kind: 'something_new' }).title).toBe('N/A');
  });

  it('awaiting_absent_cron is provisional, and never says "absent" (§3.5)', () => {
    const said = dayReason({ status_reason: 'awaiting_absent_cron' });
    expect(said).toBeTruthy();
    expect(said.toLowerCase()).not.toContain('absent');
  });

  it('today and tomorrow are named', () => {
    expect(dayTitle('2026-10-22', '2026-10-22')).toMatch(/^Today · /);
    expect(dayTitle('2026-10-23', '2026-10-22')).toMatch(/^Tomorrow · /);
  });
});

describe('items', () => {
  it('only task_due has a time, read off its own offset (§5.1)', () => {
    expect(dueTime('2026-10-22T18:00:00+05:30')).toBe('06:00 pm');
    expect(presentItem({ kind: 'task_due', title: 'Q3 report', due_at: '2026-10-22T18:00:00+05:30' }).when)
      .toBe('Due 06:00 pm');
  });

  it('date-only kinds never print a time', () => {
    const p = presentItem({ kind: 'document_expiry', document_name: 'PAN card', due_date: '2026-11-14' });
    expect(p.title).toBe('PAN card runs out');
    expect(p.when).not.toMatch(/am|pm/);
  });

  it('an earned day is never called comp-off', () => {
    const p = presentItem({ kind: 'comp_off_expiry', days: 1, due_date: '2026-11-01' });
    expect(p.title).toBe('A day off you earned runs out');
    expect(p.title.toLowerCase()).not.toContain('comp-off');
  });

  it('a rotation change names the pattern as a rotation (§5.2)', () => {
    expect(presentItem({ kind: 'shift_change', shift_name: 'Day/Night 4-day', is_rotation: true }).title)
      .toBe('You move onto Day/Night 4-day');
  });

  it('only an overdue task is rose; priority is not a tone', () => {
    expect(presentItem({ kind: 'task_due', priority: 'high', is_overdue: false }).tone).toBe('purple');
    expect(presentItem({ kind: 'task_due', priority: 'low', is_overdue: true }).tone).toBe('rose');
  });

  it('itemDate reads due_at for tasks and due_date for the rest', () => {
    expect(itemDate({ kind: 'task_due', due_at: '2026-10-22T18:00:00+05:30' })).toBe('2026-10-22');
    expect(itemDate({ kind: 'document_request_due', due_date: '2026-10-30' })).toBe('2026-10-30');
  });

  it('flattens in the order the server sent, carrying each item’s date', () => {
    const days = [
      { date: '2026-10-22', day_kind: 'working', items: [{ kind: 'task_due', id: 'a' }] },
      { date: '2026-10-23', day_kind: 'working', items: [] },
      { date: '2026-10-24', day_kind: 'working', items: [{ kind: 'document_expiry', id: 'b' }] },
    ];
    expect(flattenAgendaItems(days).map((i) => [i.id, i.date]))
      .toEqual([['a', '2026-10-22'], ['b', '2026-10-24']]);
  });

  it('a recovered lane merges by date, not onto the end, and never twice', () => {
    const base = [
      { kind: 'task_due', id: 'a', date: '2026-10-22' },
      { kind: 'document_expiry', id: 'b', date: '2026-10-24' },
    ];
    const recovered = [
      { kind: 'task_due', id: 'c', date: '2026-10-23' },
      { kind: 'task_due', id: 'a', date: '2026-10-22' }, // already held
    ];
    expect(mergeAgendaItems(base, recovered).map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('lanes', () => {
  it('a failed lane beats a capped one, and is named for the reader', () => {
    const lanes = { tasks: 'unavailable', documents: 'truncated', comp_offs: 'ok', shift_changes: 'ok' };
    expect(worstLaneState(lanes)).toBe('unavailable');
    expect(failedLaneNames(lanes)).toEqual(['task deadlines']);
  });

  it('a recovered tasks lane is not reckoned — the deadlines are on screen', () => {
    const lanes = { tasks: 'unavailable', documents: 'ok', comp_offs: 'ok', shift_changes: 'ok' };
    const reckoned = ['documents', 'comp_offs', 'shift_changes'];
    expect(worstLaneState(lanes, reckoned)).toBe('ok');
    expect(failedLaneNames(lanes, reckoned)).toEqual([]);
  });

  it('excluded only survives when every lane was excluded', () => {
    expect(worstLaneState({ tasks: 'excluded', documents: 'ok', comp_offs: 'ok', shift_changes: 'ok' })).toBe('ok');
    expect(worstLaneState({ tasks: 'excluded', documents: 'excluded', comp_offs: 'excluded', shift_changes: 'excluded' }))
      .toBe('excluded');
  });
});

describe('the summary', () => {
  it('prints through formatDayCount, the way the web does (§10)', () => {
    const tiles = summaryTiles({ working_days: 20.5, weekly_offs: 8, holidays: 1, leave_days: 1.5, items_due: 4 });
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ['Working', '20d and 1/2 d'],
      // Weekly offs and holidays are ONE "off" figure — two tiles reading
      // "8d" and "1d" said less than one reading "9d".
      ['Off', '9d'],
      ['On leave', '1d and 1/2 d'],
      // A count of THINGS, not of days, so it stays a plain number.
      ['Falling due', '4'],
    ]);
  });

  it('an empty summary still draws four tiles rather than reflowing', () => {
    expect(summaryTiles({}).map((t) => t.value)).toEqual(['0d', '0d', '0d', '0']);
  });
});

describe('the rest', () => {
  it('weeks group from Monday, named this/next week', () => {
    const days = ['2026-10-22', '2026-10-25', '2026-10-26', '2026-11-02'].map((date) => ({ date }));
    const weeks = weeksOf(days, '2026-10-22');
    expect(weeks.map((w) => [w.title, w.data.length])).toEqual([
      ['This week', 2], ['Next week', 1], ['Week of 2 Nov', 1],
    ]);
  });

  it('weekly offs read Monday-first in words, off the shared helper’s names', () => {
    const names = weeklyOffNames([{ days_of_week: [0, 6] }]);
    expect(names).toEqual(['Sunday', 'Saturday']); // the payload's own order, 0 = Sunday
    expect(weeklyOffPhrase(names)).toBe('Saturday & Sunday');
    expect(weeklyOffPhrase([])).toBeNull();
  });

  it('the weekday row is seven chips, Sunday first, the off ones filled', () => {
    const row = weekdayOffRow(['Sunday', 'Saturday']);
    expect(row.map((d) => d.short)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(row.filter((d) => d.off).map((d) => d.short)).toEqual(['Sun', 'Sat']);
  });

  it('the weekly-off rule is said as a group, never as its raw matched_by (§4)', () => {
    const rule = weeklyOffRule({
      rule_name: 'Tech & Product 5-Day Work Week',
      days_of_week: [0, 6],
      matched_by: 'department',
      matched_entity_name: 'Engineering',
      priority: 10,
    });
    expect(rule.name).toBe('Tech & Product 5-Day Work Week');
    expect(rule.audience).toBe('Everyone in Engineering has these days off.');
    expect(JSON.stringify(rule)).not.toContain('department');
    expect(JSON.stringify(rule)).not.toContain('10');
  });

  it('no weekly-off rule is absent, not an empty box', () => {
    expect(weeklyOffRule(null)).toBeNull();
    expect(weeklyOffRule({})).toBeNull();
  });

  it('a trimmed employee reads as a shorter sentence, never "null terms"', () => {
    expect(employeeTargeting({ designation: 'Senior Engineer', department: 'Engineering', employment_type: 'full_time' }))
      .toBe('You’re set up as Senior Engineer in Engineering, on full time terms — that’s what decides which shift, days off and rules apply to you.');
    expect(employeeTargeting({ department: 'Engineering' }))
      .toBe('You’re set up as part of Engineering — that’s what decides which shift, days off and rules apply to you.');
    expect(employeeTargeting({})).toBe('');
    expect(employeeTargeting(null)).toBe('');
  });

  it('the location id never reaches the screen (§4)', () => {
    expect(employeeTargeting({ designation: 'Engineer', location_id: 'loc-303' })).not.toContain('loc-303');
  });
});

describe('weekly_offs arrives in two shapes', () => {
  // NativeRef documents a flat [0, 6]; the web reads a list of rules. Handed
  // the flat form, the shared helper answers [] — "no day off" for someone
  // with two. weeklyOffRules() is what stops that, at the call site.
  it('a flat list of day indices still names the days', () => {
    expect(weeklyOffNames(weeklyOffRules([0, 6]))).toEqual(['Sunday', 'Saturday']);
  });

  it('a list of rules is passed through untouched', () => {
    expect(weeklyOffNames(weeklyOffRules([{ days_of_week: [0, 6] }]))).toEqual(['Sunday', 'Saturday']);
  });

  it('the two mixed together are merged, not dropped', () => {
    expect(weeklyOffNames(weeklyOffRules([{ days_of_week: [0] }, 6]))).toEqual(['Sunday', 'Saturday']);
  });

  it('nothing set stays nothing set', () => {
    expect(weeklyOffRules(null)).toEqual([]);
    expect(weeklyOffNames(weeklyOffRules([]))).toEqual([]);
  });
});
