// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/SelfRecordSheets.jsx — the record inspectors
// behind the four self-service lists on My Time: a correction, a flag, an
// overtime entry, an earned-leave day.
//
// Ported from the web's shared/attendance/SelfRecordDialogs.jsx, whose header
// is worth repeating because it records why these exist at all: the four lists
// used to be dead ends. The reason, the reviewer's remarks and the resolution
// note were squeezed into a table cell with `truncate` and a `title` tooltip —
// and a tooltip NEVER APPEARS ON A TOUCH DEVICE. The one sentence people came
// for ("why was this rejected?") was the part that got cut off.
//
// So the row is short and scannable, the row opens the record, and the record
// is a RecordSheet. On a phone the tooltip problem isn't a regression risk,
// it's the only behaviour there ever was — which makes these sheets the whole
// answer rather than an improvement on one.
//
// ── A SHEET, NEVER A ROUTE (§3) ──────────────────────────────────────────────
//
// Each is local state in the tab that owns the list, so the list stays mounted
// behind it. Mount them conditionally (`{selected && <CorrectionSheet …/>}`) —
// that is also what resets the scroll between two records.
//
// ── THE REVIEW TAIL IS ALWAYS DRAWN ──────────────────────────────────────────
//
// `ReviewSection` renders even with nothing in it, because "nobody has reviewed
// this yet" and "no note was left" are ANSWERS, and their absence is what sent
// people hunting for a tooltip in the first place. Same rule as the web file.
//
// ── NEVER THE ID (T-T4) ──────────────────────────────────────────────────────
//
// Not in a row, not in a sheet, not in a toast. The date and the reason
// identify a request to a human; a UUID identifies it to a database.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import {
  fmtDate, fmtDateTime, fmtHours, fmtMinutes, fmtTime, toLocalYMD, ymdOnly,
} from '../../../lib/dates';
import { documentsAPI, leaveAPI } from '../../../api';
import { openDocument } from '../../documents/openDoc';
import { useResource } from '../../../hooks/useResource';
import { anomalyStatusKey, anomalyTypeLabel, humanize, normalizeStatusKey } from '../../../lib/enums';
import { entityId } from '../../../lib/normalize';
import { formatDayCount } from '../../../lib/format';
import { color, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, InlineAlert, RecordSheet, SheetFooterNote, SheetGrid, SheetSection, SheetStats, SheetTimeline,
  SheetText, StatusBadge, showToast,
} from '../../../ui';

/* ── A LEAVE'S SUPPORTING DOCUMENT (10-api/02-endpoint-registry.md § Leave) ──
   `document_url` is one of two things. A link the applicant pasted opens in
   the browser. A portal document is stored as the RELATIVE path
   `/api/v1/documents/attachments/:id/view-url` — not a URL a client can
   follow — so it goes through the attachment bridge, which answers a short-
   lived signed link at the moment of the tap. */
// The web's `attachmentIdFromUrl` (shared/documents/attachmentBridge.js), verbatim.
const ATTACHMENT_PATH = /\/documents\/attachments\/([0-9a-f-]{16,})\/view-url\b/i;

function LeaveDocument({ url }) {
  const [busy, setBusy] = useState(false);
  const raw = String(url || '').trim();
  if (!raw) return null;
  const bridged = ATTACHMENT_PATH.exec(raw);
  const external = !bridged && /^https?:\/\//i.test(raw);
  if (!bridged && !external) return null;

  const open = async () => {
    setBusy(true);
    try {
      if (bridged) {
        // A 404 here is the server's flat "not found": the document was
        // removed or replaced after the leave was applied (the web shows the
        // same). Say that in words instead of the raw server sentence.
        await openDocument(async () => {
          try {
            return await documentsAPI.getAttachmentViewUrl(bridged[1]);
          } catch (err) {
            if (err?.status === 404) {
              throw new Error('This document isn’t available any more — it was removed or replaced after the leave was applied.');
            }
            throw err;
          }
        }, { title: 'Leave document' });
      } else {
        await Linking.openURL(raw);
      }
    } catch {
      showToast('Couldn’t open that link.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetSection icon={icons.attachment} title="Supporting document" collapsible={false}>
      <Button
        title={bridged ? 'Open the document' : 'Open the link'}
        variant="outline"
        size="sm"
        icon={bridged ? icons.document : icons.external}
        onPress={open}
        loading={busy}
      />
    </SheetSection>
  );
}

/* The attendance day, when the payload carries it. The self lists often don't
   — which is why every read of it is guarded rather than assumed. */
const recordOf = (item) => item?.record || item?.attendance_record || null;

/* Whatever the reviewer wrote, under any of the names the API has used, and
   when they wrote it. One accessor each, used everywhere (T-T6). */
const reviewerNote = (item) =>
  item?.remarks || item?.manager_remarks || item?.manager_note || item?.review_remarks || null;
const decidedAt = (item) => item?.approved_at || item?.reviewed_at || item?.actioned_at || null;

/** A requested time that landed on the NEXT calendar day says so. */
function timeWithDayHint(iso, date) {
  if (!iso) return null;
  const nextDay = date && toLocalYMD(iso) > ymdOnly(date);
  return nextDay ? `${fmtTime(iso)} (next day)` : fmtTime(iso);
}

/**
 * The shared tail: what the reviewer said, and when.
 *
 * ── IT ONLY ASKS FOR WHAT THE RECORD CAN ANSWER (2026-10-18) ────────────────
 *
 * This used to draw every row unconditionally, and the user caught the result:
 * "most of the screens show no data for things like N/A when bottom sheet is
 * opened". Two of those N/As were structural, not missing data:
 *
 *   • "Decided on" on a PENDING request. Nothing decided it; that is not an
 *     unknown value, it is a state, and the sheet now says the state.
 *   • "What the reviewer said" on a LEAVE request. The leave approve and
 *     reject endpoints take NO remarks field at all (md_leave §19/§20) — the
 *     only free text is `rejection_reason`, which LeaveSheet already gives its
 *     own section. So leave passes `note={false}` and the row is absent.
 *
 * Corrections (`review_remarks`), overtime and earned leave (`remarks`) do
 * carry one, so for them an empty note is a real answer and still prints.
 */
function ReviewSection({ item, pending, note: withNote = true }) {
  const note = reviewerNote(item);
  const when = decidedAt(item);
  // `created_at` on attendance records, `requested_at` in the leave_requests
  // table (md_leave development_phases.md).
  const submitted = item?.created_at || item?.requested_at;
  const status = normalizeStatusKey(item?.status) || 'pending';

  // The trail as a timeline (2026-10-20) — the reference "Status update":
  // what you did, then what happened to it, each with its time. The decision
  // step carries the reviewer's words, so they read as part of the story
  // rather than as a stray caption at the bottom of the sheet.
  const outcome = pending
    ? { title: 'Waiting for your manager', state: 'current', note: 'You’ll be told the moment they decide.' }
    : status === 'rejected'
      ? { title: 'Rejected', state: 'rejected' }
      : status === 'cancelled'
        ? { title: 'Cancelled', state: 'upcoming' }
        : { title: 'Approved', state: 'done' };

  return (
    <SheetSection icon={icons.people} title="Status" collapsible={false}>
      <SheetTimeline
        steps={[
          { title: 'You sent it', when: submitted ? fmtDateTime(submitted) : null, state: 'done' },
          {
            ...outcome,
            when: !pending && when ? fmtDateTime(when) : null,
            note: !pending && withNote ? (note || null) : outcome.note,
          },
        ]}
      />
    </SheetSection>
  );
}

/* ─── A correction ────────────────────────────────────────────────────────── */

/** @param {{ item: object, onClose: Function }} props */
export function CorrectionSheet({ item, onClose }) {
  const date = ymdOnly(item?.date);
  const record = recordOf(item);
  const status = String(item?.status || 'pending').toLowerCase();
  const pending = status === 'pending';

  // Only worth comparing when the day's recorded times came with the row.
  // Otherwise the requested times stand on their own, which is honest — the
  // alternative is a "was" column of N/A that reads like the day was empty.
  const hasComparison = !!record && (record.clock_in_time || record.clock_out_time);

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow="Attendance correction"
      icon={icons.edit}
      title={fmtDate(date, 'That day')}
      subtitle="A correction you asked for on this day"
      badge={<StatusBadge kind="regularization" status={item?.status || 'pending'} />}
    >
      <SheetStats
        cols={2}
        items={[
          { label: 'Clock in asked', icon: icons.clockIn, tone: 'emerald', value: timeWithDayHint(item?.requested_clock_in, date) },
          { label: 'Clock out asked', icon: icons.clockOut, tone: 'rose', value: timeWithDayHint(item?.requested_clock_out, date) },
          item?.work_mode ? { label: 'How you worked', icon: icons.office, tone: 'blue', value: humanize(item.work_mode) } : null,
        ]}
      />

      {hasComparison ? (
        <SheetSection icon={icons.edit} title="What changes" collapsible={false}>
          <SheetGrid
            cols={2}
            items={[
              ['Clock in — recorded', record.clock_in_time ? fmtTime(record.clock_in_time) : null],
              ['Clock in — you asked', timeWithDayHint(item?.requested_clock_in, date)],
              ['Clock out — recorded', record.clock_out_time ? fmtTime(record.clock_out_time) : null],
              ['Clock out — you asked', timeWithDayHint(item?.requested_clock_out, date)],
            ]}
          />
          <SheetFooterNote>
            {pending
              ? 'If this is approved, the times you asked for replace the ones recorded on the day.'
              : status === 'approved'
                ? 'The times you asked for were applied to your attendance for this day.'
                : 'Your attendance for this day was left as it was recorded.'}
          </SheetFooterNote>
        </SheetSection>
      ) : null}

      <SheetSection icon={icons.info} title="Why you asked" collapsible={false}>
        <SheetText empty="No reason was given.">{item?.reason}</SheetText>
      </SheetSection>

      <ReviewSection item={item} pending={pending} />
    </RecordSheet>
  );
}

/* ─── A flag ──────────────────────────────────────────────────────────────── */

/** @param {{ item: object, onClose: Function }} props */
export function FlagSheet({ item, onClose }) {
  const date = ymdOnly(item?.date || item?.record_date || item?.created_at);
  const resolved = anomalyStatusKey(item) === 'resolved';

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow="Attendance flag"
      icon={icons.warn}
      // The TYPE is the title and it is a sentence — never the enum, never
      // "Anomaly #4" (T-T7).
      title={anomalyTypeLabel(item?.type || item?.anomaly_type)}
      subtitle={fmtDate(date, '')}
      badge={<StatusBadge kind="anomaly" status={anomalyStatusKey(item)} />}
    >
      {/* THE ANOMALY PAYLOAD IS SHORT, AND ASKING IT FOR MORE PRINTS N/A
          (2026-10-18). It carries exactly: id · record_id · date · type ·
          severity · description · is_resolved · resolved_by · resolved_at ·
          resolution_notes (3_user_attendance_api.md §9). There is NO
          `created_at`, so the "Raised on" row that used to sit below was N/A
          on every flag ever shown; and the "Flag" row repeated the sheet's
          own title. Both are gone. The day is in the subtitle, so it is not a
          stat either. */}
      <SheetStats
        cols={2}
        items={[
          { label: 'How serious', value: item?.severity ? humanize(item.severity) : null },
          {
            label: 'Sorted out',
            value: resolved ? 'Yes' : 'Not yet',
            caption: item?.resolved_at ? fmtDateTime(item.resolved_at) : undefined,
          },
        ]}
      />

      <SheetSection icon={icons.flag} title="What was flagged" collapsible={false}>
        <SheetText empty="The system did not record any extra detail for this flag.">
          {item?.description}
        </SheetText>
      </SheetSection>

      {/* Flags carry `is_resolved` + `resolution_notes`, not a status string,
          and no reviewer/decided-at pair — so this REPLACES the shared review
          tail rather than using it (contract §2 C16). An OPEN flag has
          nothing here but the fact that it is open, so it does not draw a
          "Sorted out on" row to put N/A in. */}
      <SheetSection icon={icons.ok} title="How it was sorted out" collapsible={false}>
        {resolved ? (
          <>
            <SheetGrid
              items={[['Sorted out on', item?.resolved_at ? fmtDateTime(item.resolved_at) : null]]}
            />
            <SheetText empty="No note was left.">{item?.resolution_notes}</SheetText>
          </>
        ) : (
          <SheetText>Nothing yet — this flag is still open.</SheetText>
        )}
      </SheetSection>

      {/* The only route from "this day is wrong" to a form, which is why it is
          a note and not a button: a correction needs a reason (§6). */}
      {!resolved ? (
        <SheetFooterNote>
          A missing punch is put right by a correction request, which your manager reviews.
          Ask for one from the Corrections tab.
        </SheetFooterNote>
      ) : null}
    </RecordSheet>
  );
}

/* ─── Overtime ────────────────────────────────────────────────────────────── */

/** @param {{ item: object, minutes: number|null, onClose: Function }} props */
export function OvertimeSheet({ item, minutes, onClose }) {
  const date = ymdOnly(item?.date || item?.record_date || recordOf(item)?.date);
  const record = recordOf(item);
  const status = String(item?.status || 'pending').toLowerCase();

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow="Overtime"
      icon={icons.overtime}
      title={fmtDate(date, 'Overtime')}
      subtitle="Extra hours recorded from your attendance"
      badge={<StatusBadge kind="overtime" status={item?.status || 'pending'} />}
    >
      <SheetStats
        cols={2}
        items={[
          // Minutes are the canonical unit; the caller has already converted
          // whatever spelling the row arrived in (T-T5).
          { label: 'Extra time', value: minutes != null ? fmtMinutes(minutes) : null, caption: 'beyond your shift' },
          { label: 'Day', value: fmtDate(date) },
        ]}
      />

      <SheetSection icon={icons.calendar} title="The day this came from" collapsible={false}>
        <SheetGrid
          items={[
            ['Clocked in', record?.clock_in_time ? fmtTime(record.clock_in_time) : null],
            ['Clocked out', record?.clock_out_time ? fmtTime(record.clock_out_time) : null],
          ]}
        />
        <SheetFooterNote>
          Overtime is worked out from your punches and your shift. It is not something you apply for.
        </SheetFooterNote>
      </SheetSection>

      {item?.reason ? (
        <SheetSection icon={icons.info} title="Why the extra hours" collapsible={false}>
          <SheetText>{item.reason}</SheetText>
        </SheetSection>
      ) : null}

      <ReviewSection item={item} pending={status === 'pending'} />
    </RecordSheet>
  );
}

/* ─── An earned day ───────────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {object} props.item
 * @param {string} props.term            the org's own word for it
 * @param {string|null} props.workedOn
 * @param {number|string|null} props.credit
 * @param {string|null} props.expiresOn
 * @param {boolean} props.expiringSoon
 * @param {Function} props.onClose
 */
export function EarnedLeaveSheet({ item, term, workedOn, credit, expiresOn, expiringSoon, onClose }) {
  const status = String(item?.status || 'earned').toLowerCase();
  // formatDayCount only — a day is whole or half, and eight hand-rolled copies
  // of that logic once disagreed with each other on the web (T-T9).
  const creditLabel = credit != null ? `+${formatDayCount(credit, { lower: true })}` : null;

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow={term}
      icon={icons.earnedLeave}
      title={workedOn ? fmtDate(workedOn) : term}
      subtitle="A day you worked when you did not have to"
      badge={<StatusBadge kind="compoff" status={item?.status || 'earned'} />}
    >
      <SheetStats
        cols={2}
        items={[
          { label: 'Days credited', value: creditLabel },
          { label: 'Hours you worked', value: item?.worked_hours != null ? fmtHours(item.worked_hours) : null },
          {
            label: 'Use it before',
            value: expiresOn ? fmtDate(expiresOn) : null,
            caption: expiringSoon ? 'expiring soon' : undefined,
          },
        ]}
      />

      {/* Fuchsia, never amber and never rose: an expiring day is a warning,
          not an error, and this palette has no amber (§5). */}
      {expiringSoon ? (
        <View>
          <InlineAlert tone="amber">
            This expires within the next two weeks. Apply for it from your leave before then, or you lose the day.
          </InlineAlert>
        </View>
      ) : null}

      <SheetSection icon={icons.earnedLeave} title="How you earned it" collapsible={false}>
        <SheetGrid
          items={[
            ['Day you worked', workedOn ? fmtDate(workedOn) : null],
            ['Days credited', creditLabel],
          ]}
        />
        <SheetFooterNote>
          {status === 'approved'
            ? 'These days are on your leave balance. Apply for them from your leave.'
            : status === 'earned' || status === 'pending'
              ? 'Once this is approved the days go onto your leave balance.'
              : 'These days are no longer available.'}
        </SheetFooterNote>
      </SheetSection>

      <ReviewSection item={item} pending={status === 'earned' || status === 'pending'} />
    </RecordSheet>
  );
}


/* ─── A leave request ─────────────────────────────────────────────────────────

   The one sheet here that FETCHES. The other four are opened from a list row
   that already carries everything worth reading; `/leaves/my-requests` does
   not — the day-by-day breakdown, the approver and the rejection reason live
   only on `/leaves/requests/:id`, and "why was this rejected?" is the single
   most common reason somebody opens a leave at all.

   So the row is shown IMMEDIATELY from what the list had, and the detail
   fills in underneath when it arrives. A spinner over facts we already hold
   would be a slower sheet that says less. */

/** @param {{ item: object, onClose: Function }} props */
export function LeaveSheet({ item, onClose }) {
  const id = entityId(item);
  const detail = useResource(() => leaveAPI.getLeaveRequest(id), {
    enabled: !!id,
    deps: [id],
    // A failed detail read is NOT an error state: the sheet still has the
    // row. It just shows less, which is what `empty` copy is for.
    onError: () => {},
  });

  // The row first, the fetched record on top of it — never the other way
  // round, or a field the list had goes blank while the request is in flight.
  const full = { ...(item || {}), ...(detail.data?.leaveRequest || detail.data || {}) };

  const status = normalizeStatusKey(full?.status) || 'pending';
  const pending = status === 'pending' || status === 'cancellation_pending';
  const from = ymdOnly(full?.start_date || full?.from_date);
  const to = ymdOnly(full?.end_date || full?.to_date) || from;
  const name = full?.leave_type?.name || full?.leave_type_name || 'Leave';
  const half = full?.is_half_day === true;
  const unpaid = Number(full?.unpaid_days) || 0;

  /* The day-by-day breakdown the backend computed. It is the ANSWER to "I
     asked for five days, why did it take four?" — a weekend, a holiday or
     the sandwich rule, named per day in the server's own words. */
  const breakdown = Array.isArray(detail.data?.breakdown) ? detail.data.breakdown : [];

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow="Leave request"
      icon={icons.leave}
      title={name}
      subtitle={
        from && to && from !== to
          ? `${fmtDate(from, '')} to ${fmtDate(to, '')}`
          : fmtDate(from, 'A day off')
      }
      badge={<StatusBadge kind="leave" status={full?.status || 'pending'} />}
      height="tall"
    >
      <SheetStats
        cols={2}
        items={[
          { label: 'Days', value: full?.total_days != null ? formatDayCount(full.total_days) : null },
          { label: 'Paid', value: full?.paid_days != null ? formatDayCount(full.paid_days) : null },
          // Only when there are any. A zero here reads as a warning about a
          // leave that is entirely fine.
          unpaid > 0 ? { label: 'Unpaid', value: formatDayCount(unpaid) } : null,
          half ? { label: 'Half day', value: full?.half_day_type === 'second_half' ? 'Second half' : 'First half' } : null,
        ].filter(Boolean)}
      />

      {/* A cancellation already in front of a manager is the single most
          misread state on this screen: the leave is STILL BOOKED. Say so. */}
      {status === 'cancellation_pending' ? (
        <View>
          <InlineAlert tone="amber">
            You asked to cancel this. Until your manager approves it the leave still stands and the days stay deducted.
          </InlineAlert>
        </View>
      ) : null}

      {breakdown.length > 0 ? (
        <SheetSection icon={icons.calendar} title="Day by day" collapsible>
          <SheetGrid
            cols={1}
            items={breakdown.map((d) => [
              fmtDate(ymdOnly(d?.date), 'That day'),
              d?.reason || (d?.is_working_day ? 'Counted as leave' : 'Not counted'),
            ])}
          />
          <SheetFooterNote>
            Weekends, holidays and days outside your policy aren’t deducted — your organisation’s rules decide, not the dates you picked.
          </SheetFooterNote>
        </SheetSection>
      ) : null}

      <SheetSection icon={icons.info} title="Why you applied" collapsible={false}>
        <SheetText empty="No reason was given.">{full?.reason}</SheetText>
      </SheetSection>

      <LeaveDocument url={full?.document_url} />

      {full?.rejection_reason ? (
        <SheetSection icon={icons.reject} title="Why it was rejected" collapsible={false}>
          <SheetText empty="No reason was given.">{full.rejection_reason}</SheetText>
        </SheetSection>
      ) : null}

      {/* `note={false}`: leave has no remarks field — see ReviewSection. */}
      <ReviewSection item={full} pending={pending} note={false} />
    </RecordSheet>
  );
}
