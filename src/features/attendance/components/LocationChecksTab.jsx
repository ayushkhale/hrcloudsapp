// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/LocationChecksTab.jsx — My Time › Location checks.
//
// Spec: NativeRef/10-api/06-location-requests.md §5–§7. The employee's own
// audit trail of on-demand location requests: WHO asked, WHEN, and WHY — the
// GDPR Art. 15 / DPDP 2023 right to know. The asking and answering happen in
// features/attendance/liveLocation.js, with no taps; this section is where the
// person can see afterwards that it happened.
//
// ── THE REASON IS SHOWN AS WRITTEN ───────────────────────────────────────────
//
// `reason` is the requester's own words and is never replaced with a label.
// Where the org doesn't require one it is simply absent — no "No reason" line
// on the card, only in the sheet, where its absence is itself an answer.
//
// ── "NO LOCATION SENT", NEVER A FAILURE ──────────────────────────────────────
//
// `fix_returned: false` means the phone didn't answer in time — asleep under a
// battery manager, app swiped away on iOS, location off. None of that is the
// employee doing anything wrong, so it reads as a plain fact in slate, never
// in rose and never as "missed" or "failed".
//
// ── THE NOTICE SITS ON TOP UNTIL IT IS ACKNOWLEDGED ──────────────────────────
//
// The app cannot read the org's consent mode, so the notice shows either way
// (liveLocation.js header). It is the ONE action in this section and it is a
// write, so a failure is a toast (§3). Acknowledged once, it is gone for good
// on this phone for this person — the flag lives in AsyncStorage, per user.
// Hidden while that flag is being read, so it never flashes up and away.
//
// ── NO spoof_flagged ─────────────────────────────────────────────────────────
//
// The endpoint deliberately doesn't return it (the subject is never told which
// heuristic fired). Nothing here says "verified" either — the word is
// REPORTED, because the server can check plausibility, not truth.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { useAuth } from '../../../state/AuthContext';
import { usePagedList } from '../../../hooks/usePagedList';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { fmtDateTime } from '../../../lib/dates';
import { humanize } from '../../../lib/enums';
import { errorMessage } from '../../../lib/errors';
import { isUuid, personName } from '../../../lib/normalize';
import { TERMS } from '../../../config/dictionary';
import { card, color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, EmptyState, ErrorState, ListFooter, RecordSheet, SheetFooterNote, SheetSection, SheetStats,
  SheetText, showToast,
} from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import { acknowledgeNotice, noticeAcknowledged } from '../liveLocation';

const REPORTED = 'Reported';
const NOT_SENT = 'No location sent';

const requesterOf = (r) => {
  const req = r?.requested_by;
  if (typeof req === 'string' && req.trim() && !isUuid(req)) return req.trim();
  if (req && typeof req === 'object') {
    const name = personName(req, '');
    if (name && !isUuid(name)) return name;
    if (typeof req.name === 'string' && req.name.trim() && !isUuid(req.name)) return req.name.trim();
  }
  const byName = r?.requester_name || r?.requester?.name || r?.requested_by_name;
  if (typeof byName === 'string' && byName.trim() && !isUuid(byName)) return byName.trim();

  if (r?.requester_role) {
    const role = String(r.requester_role).toLowerCase();
    if (role === 'manager' || role === 'reporting_manager') return 'Your manager';
    if (role === 'hr' || role === 'admin') return 'HR';
    return humanize(r.requester_role);
  }

  return 'Your workplace';
};
const outcomeOf = (r) => (r?.fix_returned ? REPORTED : NOT_SENT);

function LocationCheckSheet({ item, onClose }) {
  const reasonText = item?.reason && !isUuid(item.reason) ? item.reason : '';
  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow={TERMS.LOCATION_CHECK}
      icon={icons.locationCheck}
      title={requesterOf(item)}
      subtitle={fmtDateTime(item?.created_at)}
    >
      <SheetStats
        cols={2}
        items={[
          { label: 'Asked as', value: item?.requester_role ? humanize(item.requester_role) : null },
          {
            label: 'Your location',
            value: outcomeOf(item),
            tone: item?.fix_returned ? 'purple' : 'slate',
            caption: item?.fix_returned && item?.responded_at ? fmtDateTime(item.responded_at) : undefined,
          },
        ]}
      />

      <SheetSection icon={icons.info} title="Reason" collapsible={false}>
        <SheetText empty="No reason was given.">{reasonText}</SheetText>
      </SheetSection>

      <SheetFooterNote>
        Your phone sends one location when someone asks during a shift, and tells you each time.
        It is never tracked in between.
      </SheetFooterNote>
    </RecordSheet>
  );
}

function NoticeCard({ busy, onAcknowledge }) {
  const Icon = icons.locationCheck;
  return (
    <View style={[card, { padding: space[4], gap: space[3] }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.md,
            backgroundColor: color.brandChipBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={19} color={color.brandChipFg} />
        </View>
        <Text style={[text.bodyStrong, { flex: 1, color: color.ink }]}>About {TERMS.LOCATION_CHECKS.toLowerCase()}</Text>
      </View>
      <Text style={[text.small, { color: color.textSecondary }]}>
        During a shift, your workplace can ask where you are. Your phone sends one location and
        notifies you every time.
      </Text>
      <Button title="I acknowledge" size="sm" loading={busy} onPress={onAcknowledge} />
    </View>
  );
}

export function LocationChecksTab() {
  const { user } = useAuth();
  const userId = user?.id;
  const [selected, setSelected] = useState(null);
  // null = still reading the flag; the notice stays hidden until we know.
  const [acknowledged, setAcknowledged] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    noticeAcknowledged(userId).then((v) => { if (!cancelled) setAcknowledged(v); });
    return () => { cancelled = true; };
  }, [userId]);

  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getMyLocationRequests({ page, limit }),
    { limit: 20, keys: ['requests'], accumulate: true },
  );
  const { refreshControl } = useListRefresh(list.reload, list.loading);

  const acknowledge = async () => {
    setBusy(true);
    try {
      await acknowledgeNotice(userId);
      setAcknowledged(true);
      showToast('Thanks — noted.', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'attendance', 'We couldn’t save that. Try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const header = acknowledged === false ? (
    <View style={{ paddingBottom: space[1] }}>
      <NoticeCard busy={busy} onAcknowledge={acknowledge} />
    </View>
  ) : null;

  if (list.error && list.items.length === 0) {
    return (
      <View style={{ padding: space[4], gap: space[3] }}>
        {header}
        <ErrorState
          error={list.error}
          domain="attendance"
          onRetry={list.reload}
          fallback="We couldn’t load your location checks."
        />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={list.items}
        keyExtractor={(r, i) => String(r?.id || `${r?.created_at}-${i}`)}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <RecordCard
            icon={icons.locationCheck}
            tone={item?.fix_returned ? 'purple' : 'slate'}
            onPress={() => setSelected(item)}
            accessibilityLabel={`${TERMS.LOCATION_CHECK} by ${requesterOf(item)}`}
            title={requesterOf(item)}
            subtitle={item?.reason && !isUuid(item.reason) ? item.reason : undefined}
            meta={[
              { label: 'When', value: fmtDateTime(item?.created_at) },
              { label: 'Location', value: outcomeOf(item) },
            ]}
          />
        )}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          list.loading ? (
            <CardsSkeleton rows={4} height={96} />
          ) : (
            <EmptyState
              icon={icons.ok}
              title="No location checks"
              message="Nobody has asked for your location."
            />
          )
        }
        ListFooterComponent={
          list.items.length > 0 ? (
            <ListFooter
              page={list.page}
              totalPages={list.totalPages}
              total={list.total}
              loading={list.loading}
              noun="check"
            />
          ) : null
        }
        contentContainerStyle={cardListStyle}
        refreshControl={refreshControl}
      />

      {selected ? <LocationCheckSheet item={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

export default LocationChecksTab;
