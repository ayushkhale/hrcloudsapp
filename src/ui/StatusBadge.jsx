// ─────────────────────────────────────────────────────────────────────────────
// ui/StatusBadge.jsx — ONE badge, app-wide.
//
// The web app grew eight divergent status badges before they were unified, and
// the same status rendered amber on one screen and grey on another. This is the
// only one. Don't write a second.
//
// THREE RULES IT ENFORCES:
//
//   1. COLOUR NEVER CARRIES THE STATUS ALONE. Every badge has a dot AND a word.
//      About 1 in 12 men can't separate the violet/fuchsia pair reliably, and a
//      purple-only palette makes that worse, not better.
//
//   2. AN UNKNOWN STATUS DEGRADES, NEVER CRASHES AND NEVER LEAKS. statusMeta()
//      falls back to humanize() plus a slate tone, so a status the backend adds
//      next month reads "Partially approved", not "PARTIALLY_APPROVED" and not
//      a blank. (CLAUDE.md §4 — no raw enum reaches the screen.)
//
//   3. THE TONE COMES FROM lib/enums.js, NOT FROM THE CALLER. A screen that
//      picks its own colour is how "pending" became three colours on the web.
//      Pass `kind` + `status`; that is the whole API.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { statusMeta } from '../lib/enums';
import { radius, space, text, toneOf } from '../theme/tokens';

/**
 * @param {object} props
 * @param {'record'|'regularization'|'compoff'|'overtime'|'anomaly'|'severity'|'leave'} props.kind
 * @param {string} props.status  the raw API value — pass it through unchanged
 * @param {boolean} [props.long] the longer label where there is room for it
 * @param {boolean} [props.dense] 10px, for inside a dense row
 * @param {string} [props.label] OVERRIDES THE WORD, never the tone. There is
 *   exactly one caller: an open break on the punch card, which the web card
 *   also draws as `status="late"` wearing the words "On break". A break is not
 *   a record status, so there is nothing in lib/enums.js to name it — and rule
 *   3 is about the COLOUR, which still comes from `status`. If you reach for
 *   this to rename a status the API does send, fix the entry in enums.js
 *   instead: that is the file the whole app reads.
 */
export function StatusBadge({ kind = 'record', status, long = false, dense = false, label: labelOverride, style }) {
  const meta = statusMeta(kind, status);
  const t = toneOf(meta.tone);
  const label = labelOverride || (long ? meta.longLabel : meta.label);

  return (
    <View
      // One label for the whole badge: a screen reader reading the dot as a
      // separate element announces "image, Approved", which is noise.
      accessible
      accessibilityLabel={`Status: ${label}`}
      style={[{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 5,
        paddingLeft: space[2] + 1,
        paddingRight: space[2] + 3,
        paddingVertical: dense ? 3 : 4,
        borderRadius: radius.full,
        // Fill, no hairline (2026-10-20): the reference pills, and §1's "fill
        // or border, not both". The 50-shade fill holds AA behind its own fg.
        backgroundColor: t.bg,
      }, style]}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.dot }} />
      <Text numberOfLines={1} style={[text.badge, { color: t.fg, fontSize: dense ? 10 : 11 }]}>
        {label}
      </Text>
    </View>
  );
}

export default StatusBadge;
