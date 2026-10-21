// ─────────────────────────────────────────────────────────────────────────────
// features/schedules/screens/SchedulesScreen.jsx — "My Schedules". The
// SchedulesTab root.
//
// User, 2026-10-22: "move My Docs to the sidebar and replace it with a new tab,
// My Schedules or Schedules — leave empty for now". The tab slot is claimed
// and the screen is a deliberate empty state: the greeting bar like every tab
// root, and one calm line. Nothing to fetch yet, so no skeleton (§2 applies
// to surfaces that fetch).
//
// When this is built, it starts from the person's shift and rotation —
// `attendanceAPI.getMyShift()` already returns { assignment, shift, rotation,
// weekly_offs } — and the weekly calendar (`getWeeklyCalendar`).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View } from 'react-native';
import { color } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { EmptyState } from '../../../ui';
import { AppTopBar } from '../../../navigation/AppTopBar';

export default function SchedulesScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <AppTopBar />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          icon={icons.schedule || icons.calendar}
          title="Your schedule"
          message="Your shifts and weekly offs will show here soon."
        />
      </View>
    </View>
  );
}

export { SchedulesScreen };
