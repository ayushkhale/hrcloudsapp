// ─────────────────────────────────────────────────────────────────────────────
// features/pay/components/BankTab.jsx — My Pay › Bank.
//
// Where the money goes. One record, so this section is one card and not a
// list — the only section of My Pay that is.
//
// ── THE NUMBER IS MASKED ────────────────────────────────────────────────────
//
// The server never returns the full number — `masked_account_number` is all
// there is (`bankNumberShown` in payMeta reads both spellings). Last four only. Somebody checking "is my salary going
// to the right account?" needs the last four and the bank's name; the full
// number on screen is a shoulder-surfing risk for no gain. The form shows the
// full value while it is being typed, which is the one place it is needed.
//
// ── EDITING IS A MODAL, NOT AN INLINE FORM ──────────────────────────────────
//
// A record being WRITTEN is a page (CLAUDE.md §4): `BankAccount` is a
// `presentation: 'modal'` route. This card only reads, and re-reads when the
// form emits ATTENDANCE_EVENTS.BANK_ACCOUNT on a save.
//
// ── VERIFIED IS A BOOLEAN ───────────────────────────────────────────────────
//
// `is_verified`, not a status string, and every save flips it back to false.
// So the badge is `kind="bank"` (lib/enums BANK_STATUS), never a claim badge.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { payrollAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { humanize } from '../../../lib/enums';
import { maskTail } from '../../../lib/format';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
// `isNotFound` is shared across domains — it reads the HTTP status, not a
// domain's error code — so it lives in the attendance mapper where it was
// first written rather than being copied per domain.
import { isNotFound } from '../../../lib/errors/attendanceErrors';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  Button, EmptyState, ErrorState, IconTile, StatusBadge,
} from '../../../ui';
import { CardsSkeleton, cardListStyle } from '../../../ui/ListCards';
import { bankNumberShown, bankVerified } from '../payMeta';

const Line = ({ label, value }) => (
  <View style={{ gap: 2 }}>
    <Text style={text.label}>{label}</Text>
    <Text style={text.body}>{value || 'Not set'}</Text>
  </View>
);

export function BankTab({ onEdit }) {
  const account = useResource(() => payrollAPI.getMyBankAccount());
  const reload = account.reload;
  useAttendanceChanged([ATTENDANCE_EVENTS.BANK_ACCOUNT], useCallback(() => reload(), [reload]));

  // A 404 here means "you haven't added one", not "something broke". Every
  // other failure is a real error with a retry.
  const missing = account.error && isNotFound(account.error);
  const data = account.data?.bank_account || account.data;

  if (account.error && !missing) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState
          error={account.error}
          domain="payroll"
          onRetry={account.reload}
          fallback="We couldn’t load your bank details."
        />
      </View>
    );
  }

  if (account.loading && !account.data) return <CardsSkeleton rows={1} height={190} />;

  if (missing || !data || !(data.bank_name || bankNumberShown(data))) {
    return (
      <ScrollView contentContainerStyle={cardListStyle}>
        <EmptyState
          icon={icons.bank}
          title="No bank account on file"
          message="Add the account your salary should reach. Your employer verifies it before the next pay run."
          action={<Button title="Add your account" icon={icons.add} onPress={onEdit} />}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={cardListStyle}>
      <View
        style={{
          backgroundColor: color.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: color.borderSubtle,
          padding: space[4],
          gap: space[4],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <IconTile icon={icons.bank} tone="purple" size="md" />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text numberOfLines={1} style={text.h3}>{data.bank_name || 'Your bank'}</Text>
            <Text style={[text.metric, { fontSize: 17, lineHeight: 22 }]}>
              {maskTail(bankNumberShown(data).replace(/[^0-9]/g, '')) || bankNumberShown(data)}
            </Text>
          </View>
          <StatusBadge kind="bank" status={bankVerified(data) ? 'verified' : 'unverified'} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
          <View style={{ flexGrow: 1, flexBasis: '44%' }}>
            <Line label="Name on the account" value={data.account_holder_name} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: '44%' }}>
            <Line label="IFSC" value={data.ifsc_code} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: '44%' }}>
            <Line label="Kind" value={humanize(data.account_type)} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: '44%' }}>
            <Line label="Branch" value={data.branch_name} />
          </View>
        </View>

        <Button title="Change these details" variant="outline" icon={icons.edit} onPress={onEdit} fullWidth />
      </View>

      <Text style={text.caption}>
        A change here reaches payroll straight away, but it only affects pay runs that
        haven’t been approved yet.
      </Text>
    </ScrollView>
  );
}

export default BankTab;
