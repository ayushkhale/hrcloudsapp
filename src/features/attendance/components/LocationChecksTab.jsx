// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/LocationChecksTab.jsx — My Time › Location checks.
//
// Spec: NativeRef/10-api/06-location-requests.md §5–§7. The employee's own
// audit trail of on-demand location requests: WHO asked, WHEN, and WHY — the
// GDPR Art. 15 / DPDP 2023 right to know. The asking and answering happen in
// features/attendance/liveLocation.js, with no taps; this section is where the
// person can see afterwards that it happened.
//
// ── REVERSE GEOCODING COORDINATES VIA GOOGLE MAPS ────────────────────────────
//
// When a location is reported, backend sends coordinates (latitude, longitude).
// Using Google Geocoding v4 (via lib/geocoding.js reverseGeocode with
// ENV.GOOGLE_MAPS_API_KEY), coordinates are converted into human-readable
// addresses displayed directly on each check card and in the detail sheet.
//
// ── FILTERS & STATUS VISUALS ─────────────────────────────────────────────────
//
// Segmented FilterTabs: "All", "Reported" (green), "Not sent" (amber/yellow).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { useAuth } from '../../../state/AuthContext';
import { usePagedList } from '../../../hooks/usePagedList';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { fmtDateShort, fmtDateTime, todayYMD, ymdOnly } from '../../../lib/dates';
import { humanize } from '../../../lib/enums';
import { errorMessage } from '../../../lib/errors';
import { isUuid, personName } from '../../../lib/normalize';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { reverseGeocode } from '../../../lib/geocoding';
import { mapsUrl } from '../../../lib/fieldPlanes';
import { TERMS } from '../../../config/dictionary';
import { card, color, radius, space, text, tone } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, DatePicker, EmptyState, ErrorState, FilterTabs, ListFooter, RecordSheet, SheetFooterNote, SheetSection, SheetStats,
  SheetText, showToast,
} from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import { acknowledgeNotice, noticeAcknowledged } from '../liveLocation';
import { GEO_STATUS, checkLocationPermission, requestLocationPermission } from '../../../lib/location';

const requesterOf = (r) => {
  if (!r || typeof r !== 'object') return 'Your workplace';
  const req = r.requested_by;
  if (typeof req === 'string' && req.trim() && !isUuid(req)) return req.trim();
  if (req && typeof req === 'object') {
    const name = personName(req, '');
    if (name && !isUuid(name)) return name;
    if (typeof req.name === 'string' && req.name.trim() && !isUuid(req.name)) return req.name.trim();
  }
  const byName = r.requester_name || r.requester?.name || r.requested_by_name;
  if (typeof byName === 'string' && byName.trim() && !isUuid(byName)) return byName.trim();

  if (r.requester_role) {
    const role = String(r.requester_role).toLowerCase();
    if (role === 'manager' || role === 'reporting_manager') return 'Your manager';
    if (role === 'hr' || role === 'admin') return 'HR';
    return humanize(r.requester_role);
  }

  return 'Your workplace';
};

const extractCoordinates = (r) => {
  if (!r || typeof r !== 'object') return null;
  const loc = r.location;
  const rawLat = loc?.latitude ?? loc?.lat ?? r.latitude ?? r.lat;
  const rawLng = loc?.longitude ?? loc?.lng ?? loc?.lon ?? r.longitude ?? r.lng ?? r.lon;
  if (rawLat == null || rawLng == null || rawLat === '' || rawLng === '') return null;
  const lat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat).trim());
  const lng = typeof rawLng === 'number' ? rawLng : parseFloat(String(rawLng).trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const rawAcc = loc?.accuracy_meters ?? r.accuracy_meters;
  const accuracy = rawAcc != null && !Number.isNaN(Number(rawAcc)) ? Math.round(Number(rawAcc)) : null;

  const capturedAt = loc?.captured_at || r.captured_at || r.responded_at || null;
  const inBounds = loc?.in_bounds ?? r.in_bounds ?? null;
  const distance = loc?.distance_meters ?? r.distance_meters ?? null;

  return {
    latitude: lat,
    longitude: lng,
    accuracy,
    capturedAt,
    inBounds,
    distance: distance != null && !Number.isNaN(Number(distance)) ? Math.round(Number(distance)) : null,
  };
};

const statusOf = (r) => {
  if (!r || typeof r !== 'object') return 'not_sent';
  const s = String(r.status || '').toLowerCase().trim();
  if (s === 'reported' || r.fix_returned === true) return 'reported';
  if (s === 'not_sent' || s === 'no_location_sent' || r.fix_returned === false) return 'not_sent';
  return s || 'not_sent';
};

const coordString = (lat, lng) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '—';
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lng).toFixed(5)}° ${lngDir}`;
};

// In-memory address cache across re-renders for smooth scrolling
const ADDRESS_CACHE = new Map();

function useItemAddress(coords) {
  const lat = coords?.latitude;
  const lng = coords?.longitude;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const cacheKey = hasCoords ? `${lat.toFixed(5)},${lng.toFixed(5)}` : null;
  const [address, setAddress] = useState(() => (cacheKey ? ADDRESS_CACHE.get(cacheKey) || null : null));
  const [loading, setLoading] = useState(() => Boolean(hasCoords && !ADDRESS_CACHE.has(cacheKey)));

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setAddress(null);
      setLoading(false);
      return undefined;
    }

    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (ADDRESS_CACHE.has(key)) {
      setAddress(ADDRESS_CACHE.get(key));
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    reverseGeocode(lat, lng)
      .then((place) => {
        if (cancelled) return;
        const resolved = place?.address || `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
        ADDRESS_CACHE.set(key, resolved);
        setAddress(resolved);
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
          setAddress(fallback);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return { address, loading };
}

function LocationStatusBadge({ status }) {
  const isReported = status === 'reported';
  const t = isReported ? tone.emerald : tone.amber;
  const label = isReported ? 'Reported' : 'Not sent';

  return (
    <View
      accessible
      accessibilityLabel={`Status: ${label}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 5,
        paddingLeft: space[2] + 1,
        paddingRight: space[2] + 3,
        paddingVertical: 3,
        borderRadius: radius.full,
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: t.border,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.dot }} />
      <Text numberOfLines={1} style={[text.badge, { color: t.fg, fontSize: 11, fontWeight: '700' }]}>
        {label}
      </Text>
    </View>
  );
}

function LocationCheckCard({ item, onPress }) {
  const statusKey = statusOf(item);
  const isReported = statusKey === 'reported';
  const coords = extractCoordinates(item);
  const { address, loading } = useItemAddress(coords);

  const meta = [
    { label: 'When', value: fmtDateTime(item?.created_at) },
  ];

  if (isReported && coords?.accuracy != null) {
    meta.push({ label: 'Accuracy', value: `±${coords.accuracy}m` });
  } else if (item?.responded_at) {
    meta.push({ label: 'Responded', value: fmtDateTime(item.responded_at) });
  }

  const reasonText = item?.reason && !isUuid(item.reason) ? item.reason : undefined;

  return (
    <RecordCard
      icon={icons.locationCheck}
      tone="purple"
      onPress={onPress}
      accessibilityLabel={`${TERMS.LOCATION_CHECK} by ${requesterOf(item)}, ${isReported ? 'Reported' : 'Not sent'}`}
      title={requesterOf(item)}
      subtitle={reasonText}
      badge={<LocationStatusBadge status={statusKey} />}
      meta={meta}
    >
      {isReported && (address || loading) ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space[2],
            backgroundColor: color.surfaceSubtle,
            borderRadius: radius.md,
            paddingHorizontal: space[2] + 2,
            paddingVertical: space[2],
            borderWidth: 1,
            borderColor: color.borderSubtle,
          }}
        >
          {icons.location ? <icons.location size={15} color={color.brand} style={{ marginTop: 2 }} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[text.label, { fontSize: 9, color: color.textMuted }]}>
              Fetched address
            </Text>
            <Text
              numberOfLines={2}
              style={[
                text.small,
                {
                  color: loading && !address ? color.textMuted : color.ink,
                  fontStyle: loading && !address ? 'italic' : 'normal',
                },
              ]}
            >
              {loading && !address ? 'Resolving address from Google Maps...' : address}
            </Text>
          </View>
        </View>
      ) : null}
    </RecordCard>
  );
}

function LocationCheckSheet({ item, onClose }) {
  const reasonText = item?.reason && !isUuid(item.reason) ? item.reason : '';
  const statusKey = statusOf(item);
  const isReported = statusKey === 'reported';
  const coords = extractCoordinates(item);
  const { address, loading } = useItemAddress(coords);

  const openInMaps = () => {
    if (!coords) return;
    const url = mapsUrl(coords.latitude, coords.longitude);
    Linking.openURL(url).catch(() => {
      showToast('We couldn’t open Google Maps on this phone.', 'error');
    });
  };

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow={TERMS.LOCATION_CHECK}
      icon={icons.locationCheck}
      title={requesterOf(item)}
      subtitle={fmtDateTime(item?.created_at)}
      badge={<LocationStatusBadge status={statusKey} />}
    >
      <SheetStats
        cols={2}
        items={[
          { label: 'Asked as', value: item?.requester_role ? humanize(item.requester_role) : null },
          {
            label: 'Status',
            value: isReported ? 'Reported' : 'Not sent',
            tone: isReported ? 'emerald' : 'amber',
            caption: isReported && item?.responded_at ? fmtDateTime(item.responded_at) : undefined,
          },
        ]}
      />

      {isReported && coords ? (
        <SheetSection icon={icons.location} title="Fetched location" collapsible={false}>
          <View style={{ gap: space[3] }}>
            <View
              style={{
                backgroundColor: color.surfaceSubtle,
                borderRadius: radius.md,
                padding: space[3],
                borderWidth: 1,
                borderColor: color.borderSubtle,
                gap: space[1],
              }}
            >
              <Text style={[text.label, { fontSize: 9, color: color.textMuted }]}>
                Address
              </Text>
              <Text style={[text.bodyStrong, { color: color.ink }]}>
                {loading && !address ? 'Resolving address from Google Maps...' : address || 'Coordinates recorded'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
              <View style={{ flex: 1, minWidth: 120 }}>
                <Text style={[text.label, { fontSize: 9, color: color.textMuted }]}>Coordinates</Text>
                <Text style={[text.smallStrong, { fontVariant: ['tabular-nums'], color: color.ink }]}>
                  {coordString(coords.latitude, coords.longitude)}
                </Text>
              </View>

              {coords.accuracy != null ? (
                <View style={{ minWidth: 80 }}>
                  <Text style={[text.label, { fontSize: 9, color: color.textMuted }]}>Accuracy</Text>
                  <Text style={[text.smallStrong, { fontVariant: ['tabular-nums'], color: color.ink }]}>
                    ±{coords.accuracy} m
                  </Text>
                </View>
              ) : null}

              {coords.distance != null ? (
                <View style={{ minWidth: 80 }}>
                  <Text style={[text.label, { fontSize: 9, color: color.textMuted }]}>Distance</Text>
                  <Text style={[text.smallStrong, { fontVariant: ['tabular-nums'], color: color.ink }]}>
                    {coords.distance} m
                  </Text>
                </View>
              ) : null}

              {coords.capturedAt ? (
                <View style={{ flex: 1, minWidth: 140 }}>
                  <Text style={[text.label, { fontSize: 9, color: color.textMuted }]}>GPS Captured</Text>
                  <Text style={[text.smallStrong, { color: color.ink }]}>
                    {fmtDateTime(coords.capturedAt)}
                  </Text>
                </View>
              ) : null}
            </View>

            <Button
              title="Open in Google Maps"
              icon={icons.map}
              size="sm"
              variant="outline"
              onPress={openInMaps}
            />
          </View>
        </SheetSection>
      ) : null}

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
  const [filter, setFilter] = useState('reported');
  const [selectedDate, setSelectedDate] = useState(() => todayYMD());
  const [pickingDate, setPickingDate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    noticeAcknowledged(userId).then((v) => { if (!cancelled) setAcknowledged(v); });
    return () => { cancelled = true; };
  }, [userId]);

  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getMyLocationRequests({ page, limit, date: selectedDate }),
    { limit: 20, keys: ['requests'], filterKey: selectedDate, accumulate: true },
  );
  const { refreshControl } = useListRefresh(list.reload, list.loading);

  useAttendanceChanged([ATTENDANCE_EVENTS.LOCATION_CHECK], () => {
    list.reload();
  });

  const acknowledge = async () => {
    setBusy(true);
    try {
      const locStatus = await checkLocationPermission();
      if (locStatus !== GEO_STATUS.GRANTED) {
        await requestLocationPermission();
      }
      await acknowledgeNotice(userId);
      setAcknowledged(true);
      showToast('Thanks — noted.', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'attendance', 'We couldn’t save that. Try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const filterOptions = useMemo(() => {
    const raw = Array.isArray(list?.items) ? list.items : [];
    const items = raw.filter(Boolean).filter((r) => {
      const itemDate = ymdOnly(r?.created_at || r?.captured_at || r?.responded_at);
      return !selectedDate || !itemDate || itemDate === selectedDate;
    });
    const reportedCount = items.filter((r) => statusOf(r) === 'reported').length;
    const notSentCount = items.filter((r) => statusOf(r) === 'not_sent').length;

    return [
      { value: 'reported', label: 'Reported', count: reportedCount },
      { value: 'not_sent', label: 'Not sent', count: notSentCount },
    ];
  }, [list?.items, selectedDate]);

  const visibleItems = useMemo(() => {
    const raw = Array.isArray(list?.items) ? list.items : [];
    const items = raw.filter(Boolean);
    return items.filter((r) => {
      if (statusOf(r) !== filter) return false;
      const itemDate = ymdOnly(r?.created_at || r?.captured_at || r?.responded_at);
      if (selectedDate && itemDate && itemDate !== selectedDate) return false;
      return true;
    });
  }, [list?.items, filter, selectedDate]);

  const dateLabel = selectedDate === todayYMD() ? 'Today' : fmtDateShort(selectedDate);

  const header = (
    <View style={{ gap: space[3], paddingBottom: space[2] }}>
      {acknowledged === false ? (
        <NoticeCard busy={busy} onAcknowledge={acknowledge} />
      ) : null}
      <FilterTabs options={filterOptions} value={filter} onChange={setFilter}>
        <Pressable
          onPress={() => setPickingDate(true)}
          accessibilityRole="button"
          accessibilityLabel={`Date filter: ${dateLabel}. Tap to pick a date.`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: space[3] + 2,
            paddingVertical: 8,
            borderRadius: radius.full,
            borderWidth: 1,
            minHeight: 38,
            justifyContent: 'center',
            backgroundColor: pressed ? color.brandSoftBg : color.surface,
            borderColor: selectedDate !== todayYMD() ? color.brand : color.borderSubtle,
          })}
        >
          {icons.calendar ? (
            <icons.calendar size={15} color={selectedDate !== todayYMD() ? color.brand : color.textSecondary} />
          ) : null}
          <Text
            style={[
              text.smallStrong,
              {
                color: selectedDate !== todayYMD() ? color.brand : color.textPrimary,
              },
            ]}
          >
            {dateLabel}
          </Text>
          {icons.chevronDown ? (
            <icons.chevronDown size={14} color={selectedDate !== todayYMD() ? color.brand : color.textMuted} />
          ) : null}
        </Pressable>
      </FilterTabs>
    </View>
  );

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
        data={visibleItems}
        keyExtractor={(r, i) => String(r?.id || r?.request_id || `${r?.created_at}-${i}`)}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <LocationCheckCard item={item} onPress={() => setSelected(item)} />
        )}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          list.loading ? (
            <CardsSkeleton rows={4} height={96} />
          ) : (
            <EmptyState
              icon={filter === 'reported' ? icons.location : icons.locationCheck}
              title={
                filter === 'reported'
                  ? 'No reported locations'
                  : 'No unsent checks'
              }
              message={
                filter === 'reported'
                  ? `None of your location checks have reported coordinates for ${selectedDate === todayYMD() ? 'today' : fmtDateShort(selectedDate)}.`
                  : `None of your location checks were unsent for ${selectedDate === todayYMD() ? 'today' : fmtDateShort(selectedDate)}.`
              }
            />
          )
        }
        ListFooterComponent={
          visibleItems.length > 0 ? (
            <ListFooter
              page={list.page}
              totalPages={list.totalPages}
              total={visibleItems.length}
              loading={list.loading}
              noun="check"
            />
          ) : null
        }
        contentContainerStyle={cardListStyle}
        refreshControl={refreshControl}
      />

      <DatePicker
        open={pickingDate}
        value={selectedDate}
        onChange={(d) => {
          setPickingDate(false);
          if (d) setSelectedDate(d);
        }}
        onClose={() => setPickingDate(false)}
        max={todayYMD()}
      />

      {selected ? <LocationCheckSheet item={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

export default LocationChecksTab;
