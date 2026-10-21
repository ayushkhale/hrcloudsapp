// ─────────────────────────────────────────────────────────────────────────────
// features/attendance/components/LocationsTab.jsx — My Time › Work locations.
//
// Web ancestor: the sidebar's MY TIME → "My Work Locations". Where this person
// is allowed to clock in from: the office they are attached to, and any client
// sites assigned to them.
//
// ── READ-ONLY, AND THAT IS THE WHOLE SCREEN ─────────────────────────────────
//
// The web page says so in its own words: assigning a site is HR's and the
// manager's job, and an employee reaches the page to SEE where they may punch
// from. There is no employee-facing write endpoint, so there is no button
// here (§2: a capability we lack is absent, not broken).
//
// ── WHY IT MATTERS ENOUGH TO BE A SECTION ───────────────────────────────────
//
// "Why won't the app let me clock in?" is almost always this: the person is
// standing outside every geofence they are assigned to. The radius is on the
// card for exactly that conversation.
//
// ── ONE ENDPOINT, AND A FAILURE IS NOT AN ERROR SCREEN ──────────────────────
//
// `/attendance/my-field-assignments` → { work_mode, assigned_office, records }.
// A failed read is the same as no assignment, because that is what the punch
// card already assumes (it hides the work-mode toggle rather than crashing).
//
// ── "VIEW ON MAP" (user, 2026-10-21) ────────────────────────────────────────
//
// Every place with a GPS pin gets a View on map button that opens the phone's
// maps app — the web's link, the web's URL (lib/fieldPlanes.js `mapsUrl`).
// A site WITHOUT a pin gets no button: there is nothing to open, and a button
// that lands on an empty map is the broken control §2 forbids. The web says
// `assigned_office` carries no pin; the observed payload sometimes does, so
// the office gets the button exactly when its coordinates arrive.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { attendanceAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { useListRefresh } from '../../../hooks/useListRefresh';
import { fmtDate } from '../../../lib/dates';
import { humanize } from '../../../lib/enums';
import { coord, hasPin, mapsUrl } from '../../../lib/fieldPlanes';
import { listFrom } from '../../../lib/normalize';
import { space } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { Button, EmptyState, ErrorState, InlineAlert, showToast } from '../../../ui';
import { CardsSkeleton, RecordCard, StatCards, cardListStyle } from '../../../ui/ListCards';

const siteName = (r) => r?.field_location?.name || r?.location?.name || r?.name || 'A site';
const clientOf = (r) => r?.field_location?.client_name || r?.client_name || null;
const radiusOf = (r) => r?.field_location?.geofence_radius_meters ?? r?.geofence_radius_meters ?? null;
const isLive = (r) => r?.is_active !== false;
const placeOf = (r) => r?.field_location || r?.location || r;

function openMap(place) {
  Linking.openURL(mapsUrl(coord(place.latitude), coord(place.longitude)))
    .catch(() => showToast('We couldn’t open a maps app on this phone.', 'error'));
}

/** The card's action — only for a place that has a pin. */
function MapButton({ place }) {
  if (!hasPin(place)) return null;
  return <Button title="View on map" icon={icons.map} size="sm" variant="soft" onPress={() => openMap(place)} />;
}

export function LocationsTab() {
  const assignments = useResource(() => attendanceAPI.getMyFieldAssignments());
  const data = assignments.data;

  const sites = useMemo(() => listFrom(data, ['records', 'assignments']), [data]);
  const office = data?.assigned_office || null;

  const stats = useMemo(() => [
    {
      icon: icons.office,
      tone: 'purple',
      label: 'Work mode',
      // Normalised fail-secure by the server: a null comes back as "office".
      value: humanize(data?.work_mode || 'office'),
    },
    {
      icon: icons.location,
      tone: 'indigo',
      label: 'Sites',
      value: String(sites.filter(isLive).length),
    },
  ], [data?.work_mode, sites]);

  const { refreshControl } = useListRefresh(assignments.reload, assignments.loading);

  if (assignments.error) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState
          error={assignments.error}
          domain="attendance"
          onRetry={assignments.reload}
          fallback="We couldn’t load your work locations."
        />
      </View>
    );
  }

  if (assignments.loading && !data) {
    return <CardsSkeleton rows={3} height={110} />;
  }

  return (
    <ScrollView contentContainerStyle={cardListStyle} refreshControl={refreshControl}>
      <StatCards items={stats} />

      {office ? (
        <RecordCard
          icon={icons.office}
          tone="purple"
          title={office.name || 'Your office'}
          subtitle="Your assigned office. Clocking in from here always counts."
          action={hasPin(office) ? <MapButton place={office} /> : null}
        />
      ) : null}

      {sites.length > 0 ? (
        sites.map((record, i) => (
          <RecordCard
            key={String(record.id || i)}
            icon={icons.location}
            tone={isLive(record) ? 'indigo' : 'slate'}
            title={siteName(record)}
            subtitle={clientOf(record)}
            meta={[
              radiusOf(record) != null
                ? { label: 'Within', value: `${radiusOf(record)} m` }
                : null,
              record?.effective_from
                ? { label: 'From', value: fmtDate(record.effective_from, '') }
                : null,
            ].filter(Boolean)}
            action={hasPin(placeOf(record)) ? <MapButton place={placeOf(record)} /> : null}
          />
        ))
      ) : !office ? (
        <EmptyState
          icon={icons.location}
          title="No sites assigned"
          message="You clock in from your office. Your HR team assigns client sites when you need them."
        />
      ) : null}

      <InlineAlert tone="indigo">
        Your HR team sets these. If you can’t clock in from somewhere you work,
        ask them to add it.
      </InlineAlert>
    </ScrollView>
  );
}

export default LocationsTab;
