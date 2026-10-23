// lib/policyRules.js is a port of the web's attendance/policyRules.js (§10).
// These tests pin the three things the port exists to fix — the policy
// arriving in three different places, the thresholds arriving in two different
// spellings, and the rules being said in the WEB's words rather than a second
// vocabulary invented on this side.

import {
  CORRECTIONS_OFF, correctionDateProblem, correctionWindow, fullDayMinutes, graceEndsAt,
  halfDayMinutes, policyOf, ruleLines, shiftOf, weeklyOffNames,
} from '../src/lib/policyRules';

const SHIFT = { id: 's1', name: 'General', start_time: '09:30:00', end_time: '18:30:00' };
const POLICY = {
  name: 'Engineering Standard', grace_minutes: 15,
  half_day_min_hours: 4, full_day_min_hours: 8,
  max_breaks_per_day: 3, max_break_duration_minutes: 60,
  regularization_allowed: true, regularization_window_days: 7,
  overtime_enabled: true, overtime_min_minutes: 60,
  auto_clock_out_enabled: true, auto_clock_out_after_hours: 12,
};

describe('where the policy lives', () => {
  // The bug this port fixed: My Schedules read `data.policy` alone, so the
  // whole rules section vanished whenever the server nested it under `shift`
  // — which is how NativeRef documents the wrapper.
  it('is found beside the shift, nested inside it, or as a snapshot', () => {
    expect(policyOf({ policy: POLICY })).toBe(POLICY);
    expect(policyOf({ shift: { ...SHIFT, policy: POLICY } })).toBe(POLICY);
    expect(policyOf({ policy_snapshot: POLICY, policy: { name: 'today’s' } })).toBe(POLICY);
  });

  it('is null when nothing published one — which hides the section, not crashes it', () => {
    expect(policyOf(null)).toBeNull();
    expect(policyOf({ shift: SHIFT })).toBeNull();
    expect(ruleLines(SHIFT, null)).toEqual([]);
  });

  it('finds the shift in a wrapper, a snapshot, or bare', () => {
    expect(shiftOf({ shift: SHIFT })).toBe(SHIFT);
    expect(shiftOf({ shift_snapshot: SHIFT, shift: null })).toBe(SHIFT);
    expect(shiftOf(SHIFT)).toBe(SHIFT);
    expect(shiftOf({ assignment: {} })).toBeNull();
  });
});

describe('the thresholds', () => {
  // The spec said minutes, the live payload sends decimal hours as strings.
  // Believing either one alone is what left the web's progress ring undrawn.
  it('accept decimal hours, strings included', () => {
    expect(fullDayMinutes({ full_day_min_hours: 8 })).toBe(480);
    expect(fullDayMinutes({ full_day_min_hours: '8.00' })).toBe(480);
    expect(halfDayMinutes({ half_day_min_hours: '4.5' })).toBe(270);
  });

  it('accept the minutes spelling NativeRef documented', () => {
    expect(fullDayMinutes({ full_day_threshold_minutes: 480 })).toBe(480);
    expect(halfDayMinutes({ half_day_threshold_minutes: 240 })).toBe(240);
  });

  it('answer null rather than 0 when the policy says nothing', () => {
    expect(fullDayMinutes({})).toBeNull();
    expect(halfDayMinutes(null)).toBeNull();
  });
});

describe('the rules, in the web’s words', () => {
  const lines = ruleLines(SHIFT, POLICY);
  const by = (key) => lines.find((l) => l.key === key);

  it('names the consequence, not the mechanism', () => {
    expect(by('grace_minutes').label).toBe('Arriving late');
    expect(by('grace_minutes').note).toBe('Clock in by 09:45 am and you won’t be marked late.');
    expect(by('full_day_min_hours').label).toBe('Hours that count as a day');
    expect(by('auto_clock_out_enabled').label).toBe('Forgotten clock-out');
  });

  it('says corrections by the dictionary term, never "regularization"', () => {
    const line = by('regularization_window_days');
    expect(line.label).toBe('Attendance Corrections');
    expect(line.value).toBe('7 days back');
  });

  it('zero grace is a real answer, not a missing one', () => {
    const line = ruleLines(SHIFT, { ...POLICY, grace_minutes: 0 }).find((l) => l.key === 'grace_minutes');
    expect(line.value).toBe('No grace time');
  });

  it('drops the lines the policy is silent about', () => {
    const thin = ruleLines(SHIFT, { regularization_allowed: true });
    // Only the corrections line, which is always said: silence there means
    // "no limit", which is itself worth stating.
    expect(thin.map((l) => l.key)).toEqual(['regularization_window_days']);
  });

  it('a cutoff needs a shift: no hours, no "clock in by" promise', () => {
    expect(graceEndsAt(null, POLICY)).toBeNull();
    const line = ruleLines(null, POLICY).find((l) => l.key === 'grace_minutes');
    expect(line.note).not.toContain('Clock in by');
  });
});

describe('the correction window', () => {
  it('switched off is ABSENT, and says who to ask', () => {
    const { allowed } = correctionWindow({ regularization_allowed: false });
    expect(allowed).toBe(false);
    expect(correctionDateProblem('2026-10-20', { regularization_allowed: false })).toBe(CORRECTIONS_OFF);
    expect(CORRECTIONS_OFF).toContain('Ask HR');
  });

  it('bounds the picker so it cannot offer a day the server refuses', () => {
    const w = correctionWindow({ regularization_window_days: 7 }, '2026-10-22');
    expect(w.minDate).toBe('2026-10-15');
    expect(w.maxDate).toBe('2026-10-21'); // yesterday — a correction is for a past day
  });

  it('no policy means no limit beyond "in the past"', () => {
    expect(correctionWindow(null, '2026-10-22')).toMatchObject({ allowed: true, days: null, minDate: '' });
    expect(correctionDateProblem('2020-01-01', null)).toBeNull();
  });

  it('a date before the window says so in one sentence', () => {
    const said = correctionDateProblem('2026-10-01', { regularization_window_days: 7 }, '2026-10-22');
    expect(said).toContain('only go back 7 days');
  });
});

describe('weekly offs', () => {
  it('de-duplicate across overlapping rules, 0 = Sunday', () => {
    expect(weeklyOffNames([{ days_of_week: [0, 6] }, { days_of_week: [6] }]))
      .toEqual(['Sunday', 'Saturday']);
  });

  it('an empty list is "none set", never "works every day"', () => {
    expect(weeklyOffNames([])).toEqual([]);
    expect(weeklyOffNames(null)).toEqual([]);
  });

  it('ignores a day index the payload shouldn’t have sent', () => {
    expect(weeklyOffNames([{ days_of_week: [7, -1, 'x', 3] }])).toEqual(['Wednesday']);
  });
});
