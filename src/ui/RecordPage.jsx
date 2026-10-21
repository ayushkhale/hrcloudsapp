// ─────────────────────────────────────────────────────────────────────────────
// ui/RecordPage.jsx — a record, read on a full page instead of a sheet.
//
// User, 2026-10-22: "payslip, claims, salary — everywhere the content is too
// much, change from bottom sheet to stack screen, because it's hiding the
// content… based on your analysis, see what shows more data." A 75% sheet
// is right for a short record and wrong for a payslip's two money tables or
// a loan's repayment schedule: the person scrolls a window inside a window,
// and the bottom of the record hides behind the footer.
//
// ── ONE COMPONENT, TWO PRESENTATIONS ────────────────────────────────────────
//
// A record that moved to a page did NOT get rewritten. Its component still
// renders `<RecordSheet …>` with the same props and the same SheetParts; the
// route that shows it wraps it in `<RecordPageScope>`, and RecordSheet, seeing
// the scope, draws itself as THIS instead of a sheet. One record, one body,
// whichever way it is shown — the two can't drift.
//
// What changes on a page:
//   • the native stack header carries the KIND ("Payslip") and the back
//     chevron, so the page's own header block drops the eyebrow and shows
//     the icon, the title, the subtitle and the badge
//   • the body is the page's own scroll — no height ceiling, no fitting
//   • the footer (the record's actions) is pinned to the bottom, clear of
//     the home indicator, exactly where a sheet's was
//   • `onClose` is the route's goBack — the record's own "close and go do X"
//     actions keep working unchanged
//
// Which records are pages and why: tabs.employee.js and the route wrappers
// (features/*/screens/*RecordScreens.jsx).
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { displayValue } from '../lib/format';
import { color, gutter, iconSize, radius, space, text } from '../theme/tokens';
import { Skeleton } from './Skeleton';

const RecordPageContext = createContext(false);

/** Wrap a record component in this and its RecordSheet renders as a page. */
export function RecordPageScope({ children }) {
  return <RecordPageContext.Provider value>{children}</RecordPageContext.Provider>;
}

/** True inside a RecordPageScope. */
export const useRecordPage = () => useContext(RecordPageContext);

/**
 * Same props as RecordSheet. `eyebrow` is ignored — the native header says it.
 */
export function RecordPage({ icon: Icon, title, subtitle, badge, loading = false, footer, children }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: space[4],
          paddingBottom: footer ? space[6] : space[6] + insets.bottom,
          gap: space[4],
        }}
        overScrollMode="never"
      >
        {/* The record's own header: what it is, big, and its state. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {Icon ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 52,
                height: 52,
                borderRadius: radius.md + 2,
                backgroundColor: color.brandChipBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={iconSize.lg - 2} color={color.brandChipFg} />
            </View>
          ) : null}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text accessibilityRole="header" style={[text.h1, { fontSize: 22, lineHeight: 28, color: color.ink }]}>
              {displayValue(title)}
            </Text>
            {subtitle ? <Text style={text.small}>{subtitle}</Text> : null}
          </View>
          {badge ? <View style={{ alignSelf: 'flex-start', marginTop: space[1] }}>{badge}</View> : null}
        </View>

        {loading ? <Skeleton type="sheet" /> : children}
      </ScrollView>

      {footer ? (
        <View
          style={{
            paddingHorizontal: gutter,
            paddingTop: space[3],
            paddingBottom: space[3] + Math.max(insets.bottom, space[2]),
            borderTopWidth: 1,
            borderTopColor: color.borderSubtle,
            backgroundColor: color.surface,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export default RecordPage;
