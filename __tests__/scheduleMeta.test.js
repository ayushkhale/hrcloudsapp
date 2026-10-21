// The traps the forward-view integration guide names (web ref docs, md_updates/
// 2026-10-22_frontend_my_schedule_forward_view_integration_guide.md), checked
// against its own example payload — so the schedule screen reads the agenda
// the way the backend says it must, before that API is deployed.

import {
  dayFigure, dayTitle, dueTime, itemDate, presentDay, presentItem, shiftWindow,
  weeklyOffLabel, weeksOf, windowRange,
} from '../src/features/schedules/scheduleMeta';

const SHIFT = {
  id: 's1', name: 'General Day Shift', start_time: '09:30:00', end_time: '18:30:00',
  is_overnight: false, timezone: 'Asia/Kolkata', source: 'assignment',
};

describe('the window', () => {
  it('is inclusive: 30 days from the 22nd ends on the 20th of next month', () => {
    expect(windowRange('2026-10-22', 30)).toEqual({ from: '2026-10-22', to: '2026-11-20' });
  });
  it('never asks for more than the 92-day cap', () => {
    expect(windowRange('2026-10-22', 400).to).toBe('2027-01-21');
  });
});

describe('a day', () => {
  it('working: the shift name, its window in the strip', () => {
    const p = presentDay({ date: '2026-10-22', day_kind: 'working', shift: SHIFT, items: [] });
    expect(p.title).toBe('General Day Shift');
    expect(p.meta).toEqual([{ label: 'Shift', value: '09:30 am – 06:30 pm' }]);
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
    expect(p.title).toBe('½ day · Sick Leave');
    expect(p.meta).toEqual([
      { label: 'Shift', value: '09:30 am – 06:30 pm' },
      { label: 'Leave', value: 'first half' },
    ]);
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
    expect(p.badge).toBe('Day off');
  });

  it('unassigned is neutral, and says which kind (§4.4)', () => {
    expect(presentDay({ day_kind: 'unassigned', status_reason: 'before_joining' }).title).toBe('Before you join');
    expect(presentDay({ day_kind: 'unassigned', status_reason: 'upcoming' }).title).toBe('No shift assigned');
  });

  it('an unknown kind degrades instead of crashing', () => {
    expect(presentDay({ day_kind: 'something_new' }).title).toBe('No shift assigned');
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
    expect(p.title).toBe('PAN card expires');
    expect(p.when).not.toMatch(/am|pm/);
  });

  it('an earned day is Earned Leave, never comp-off', () => {
    expect(presentItem({ kind: 'comp_off_expiry', days: 1, due_date: '2026-11-01' }).title).toBe('Earned Leave expires');
  });

  it('a rotation change names the pattern as a rotation (§5.2)', () => {
    expect(presentItem({ kind: 'shift_change', shift_name: 'Day/Night 4-day', is_rotation: true }).title)
      .toBe('Moves to rotation: Day/Night 4-day');
  });

  it('itemDate reads due_at for tasks and due_date for the rest', () => {
    expect(itemDate({ kind: 'task_due', due_at: '2026-10-22T18:00:00+05:30' })).toBe('2026-10-22');
    expect(itemDate({ kind: 'document_request_due', due_date: '2026-10-30' })).toBe('2026-10-30');
  });
});

describe('the rest', () => {
  it('fractional days read as halves (§4.2)', () => {
    expect(dayFigure(20.5)).toBe('20½');
    expect(dayFigure(0.5)).toBe('½');
    expect(dayFigure(8)).toBe('8');
    expect(dayFigure(undefined)).toBe('0');
  });

  it('weeks group from Monday, named this/next week', () => {
    const days = ['2026-10-22', '2026-10-25', '2026-10-26', '2026-11-02'].map((date) => ({ date }));
    const weeks = weeksOf(days, '2026-10-22');
    expect(weeks.map((w) => [w.title, w.data.length])).toEqual([
      ['This week', 2], ['Next week', 1], ['Week of 2 Nov', 1],
    ]);
  });

  it('weekly offs read Monday-first, in words', () => {
    expect(weeklyOffLabel([{ days_of_week: [0, 6] }])).toBe('Saturday & Sunday');
    expect(weeklyOffLabel([])).toBeNull();
  });
});
