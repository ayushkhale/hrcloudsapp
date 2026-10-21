// ─────────────────────────────────────────────────────────────────────────────
// features/home/useMonthGraph.js — ONE read of /attendance/graph-data, shared.
//
// Home draws two cards off this month: "My month" (the headline numbers and
// the daily-hours bars) and "Attendance mix" (the donut). On the web they are
// two sections of ONE component reading ONE response, and they must stay that
// way here: two components each calling getGraphData would double the request
// on every month step and let the two cards disagree for the few hundred
// milliseconds between the responses landing.
//
// So the fetch lives on the screen and both cards take `graph` as a prop. The
// cards stay dumb, the request count stays at one, and the month stepper in
// "My month"'s header moves both cards at once because there is only one month.
//
// FAILURE IS SHARED TOO. §5's independent-failure rule is about the four
// SEPARATE calls Home makes — it isn't a licence to show half a month. One
// response, one error: both cards say they couldn't load it, and the punch
// card above them is untouched.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { attendanceAPI } from '../../api';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../lib/events';
import { unwrap } from '../../lib/normalize';

/**
 * @param {number} year
 * @param {number} month  1-12
 * @param {number} [reloadKey]  bumped by pull-to-refresh
 * @returns {{ data: object|null, loading: boolean, error: any, reload: Function }}
 */
export function useMonthGraph(year, month, reloadKey = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getGraphData(month, year);
      setState({ data: unwrap(res) || null, loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error });
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load, reloadKey]);

  // A punch or an approved correction rewrites a day in this very month.
  useAttendanceChanged([ATTENDANCE_EVENTS.PUNCH, ATTENDANCE_EVENTS.REGULARIZATION], load);

  return { ...state, reload: load };
}

export default useMonthGraph;
