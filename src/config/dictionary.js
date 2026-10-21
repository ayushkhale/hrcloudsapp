// ─────────────────────────────────────────────────────────────────────────────
// config/dictionary.js — the words this product uses for things the API names
// differently.
//
// Ported from the web's shared/config/dictionary.js, trimmed to the terms the
// employee app actually renders. The point is NOT abbreviation: it is that
// changing a term changes every screen at once. Typing "Earned Leave" into
// five components is how the web app once showed "comp-off", "Comp Off" and
// "compensatory off" on three screens of the same flow.
//
// Read it, never retype it:
//
//     import { TERMS } from '../../../config/dictionary';
//     <TabStrip tabs={[{ value: 'earned', label: TERMS.COMP_OFF }]} />
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Navigation words with one source — the web's `DICTIONARY.NAV`. "Directory"
 * is the people list everywhere; "Team" is a manager's word for their own
 * reports and never appears in the employee app.
 */
export const NAV = Object.freeze({
  DIRECTORY: 'Directory',
  EMPLOYEES: 'Team',
  REPORTS: 'Reports',
});

export const TERMS = Object.freeze({
  /**
   * A day credited for working an off day. A MASS NOUN — "Earned Leave" both
   * for one day and for many, never "Earned Leaves" — so count phrases say
   * "3 earned leave days". The API calls it `comp_off`; nobody sees that.
   */
  COMP_OFF: 'Earned Leave',

  /**
   * A request to fix a missed or wrong punch. Pluralises normally. The API
   * calls it `regularization`, which is also a word nobody sees.
   */
  REGULARIZATION: 'Attendance Correction',

  /**
   * Turning unused leave, or a day earned for working an off day, into money
   * on a payslip. "Encashment" is the API's word and a payroll word — the
   * action is "pay out", never "encash".
   */
  ENCASHMENT: 'Leave Payout',
});

export default { TERMS, NAV };
