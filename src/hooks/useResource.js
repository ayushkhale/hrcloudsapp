// ─────────────────────────────────────────────────────────────────────────────
// hooks/useResource.js — a single-shot fetch with cancellation and retry.
//
// For everything that isn't a paginated list: a salary structure, a summary, a
// profile, a detail read inside a sheet.
//
// Every fetch in the app must be cancellable and must discard out-of-order
// responses. Doing it here once means no screen writes `let cancelled = false`
// again — and no screen forgets to.
//
// A FAILED RE-READ KEEPS WHAT WAS LOADED (2026-10-21). An error used to reset
// `data` to `initial`, so one dropped request during a pull — or during the
// quiet reload-on-return (hooks/useListRefresh.js) — swapped a loaded list
// for an error screen. Callers were already written for the other behaviour
// (`error && rows.length === 0` → ErrorState). Data from a DIFFERENT query
// (the deps changed: another year, another id) is still dropped on failure,
// because showing last year's figures under this year's label is worse.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unwrap } from '../lib/normalize';
import { readCache, writeCache } from '../lib/memoryCache';

/**
 * @param {() => Promise<any>} fetcher
 * @param {{
 *   deps?: any[],              // re-fetch when these change
 *   enabled?: boolean,         // false asks for nothing (a closed sheet)
 *   select?: (data:any)=>any,  // shape the payload once, here
 *   initial?: any,
 *   onError?: (e:any)=>void,   // for a non-fatal read (e.g. the profile name)
 *   cacheKey?: string,         // draw the last answer at once, refresh underneath
 *                              // (lib/memoryCache.js — this session only)
 * }} [options]
 */
export function useResource(fetcher, {
  deps = [], enabled = true, select, initial = null, onError, cacheKey,
} = {}) {
  // A cached answer is real data: no skeleton, and the read below refreshes it.
  const [state, setState] = useState(() => {
    const cached = enabled ? readCache(cacheKey) : undefined;
    return { data: cached !== undefined ? cached : initial, loading: enabled, error: null };
  });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const selectRef = useRef(select);
  selectRef.current = select;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const requestId = useRef(0);
  // Which query the data on screen came from — a new object whenever the deps
  // change. See the header: a failed re-read of the SAME query keeps its data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(() => ({}), [enabled, ...deps]);
  // A cached answer counts as this query's data, so a failed refresh keeps it.
  const dataQuery = useRef(enabled && readCache(cacheKey) !== undefined ? query : null);

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ data: initial, loading: false, error: null });
      return;
    }
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetcherRef.current();
      if (id !== requestId.current) return;
      const raw = unwrap(res);
      dataQuery.current = query;
      const data = selectRef.current ? selectRef.current(raw) : raw;
      writeCache(cacheKey, data);
      setState({ data, loading: false, error: null });
    } catch (error) {
      if (id !== requestId.current) return;
      const keep = dataQuery.current === query;
      setState((s) => ({ data: keep ? s.data : initial, loading: false, error }));
      onErrorRef.current?.(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => { load(); }, [load]);

  // Discard any in-flight response on unmount.
  useEffect(() => () => { requestId.current += 1; }, []);

  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: d })) };
}

export default useResource;
