// ─────────────────────────────────────────────────────────────────────────────
// features/pay/components/ClaimsTab.jsx — My Pay › Claims.
//
// Expenses claimed back: what was raised, where each one is, and what it is
// still possible to claim.
//
// ── WRITING HAPPENS IN THE FORM ─────────────────────────────────────────────
//
// New claims and drafts open `ClaimForm` (a modal route), which takes the
// receipts — camera, photos or a PDF (ui/AttachmentPicker). This list reads,
// and refreshes on ATTENDANCE_EVENTS.CLAIM when the form saves or submits.
//
// ── THE CATEGORY IS NESTED ──────────────────────────────────────────────────
//
// `/me/reimbursements/categories` returns `{ category, consumed, remaining }`
// rows, not categories. Reading the row as the category is how every card once
// said "Category". `normalizeHeadroomRow` (payMeta, ported from the web).
//
// ── CANCEL IS THE ONLY WRITE THE LIST DOES ──────────────────────────────────
//
// And it asks first, through `useConfirm()` — the house alert, never
// `Alert.alert` (CLAUDE.md §4). It is reversible only by raising the claim
// again, which is a reason to confirm, not a reason to hide it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { payrollAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { fmtDate } from '../../../lib/dates';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../../../lib/events';
import { normalizeStatusKey } from '../../../lib/enums';
import { errorMessage } from '../../../lib/errors';
import { formatMoney } from '../../../lib/format';
import { toList } from '../../../lib/normalize';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  AttachmentChip, Button, EmptyState, ErrorState, FilterTabs, RecordSheet, SheetGrid, SheetSection,
  SheetStats, StatusBadge, showToast, useConfirm,
} from '../../../ui';
import { CardsSkeleton, RecordCard, cardListStyle } from '../../../ui/ListCards';
import {
  claimAmount, claimLimitText, claimStageLabel, claimTitle, normalizeClaimDetail,
  normalizeHeadroomRow, periodLimitText, receiptRuleText,
} from '../payMeta';

const VIEWS = [
  { value: 'claims', label: 'Your claims' },
  { value: 'categories', label: 'What you can claim' },
];

const CANCELLABLE = new Set(['draft', 'submitted', 'pending']);

/* ─── One claim ──────────────────────────────────────────────────────────── */

function ClaimSheet({ claim, onClose, onCancelled, onContinue }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const full = useResource(() => payrollAPI.getMyReimbursementClaim(claim.id), {
    deps: [claim.id],
    select: (data) => normalizeClaimDetail(data),
  });

  const d = full.data || claim;
  const items = full.data?.items || toList(d, ['items', 'claim_items']);
  const status = normalizeStatusKey(d.status);

  const cancel = useCallback(async () => {
    const ok = await confirm({
      title: 'Cancel this claim?',
      message: 'It stops here and will not be paid. You can raise it again later.',
      confirmText: 'Cancel the claim',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await payrollAPI.cancelMyReimbursementClaim(d.id);
      showToast('Claim cancelled.', 'success');
      onCancelled();
      onClose();
    } catch (err) {
      showToast(errorMessage(err, 'payroll', 'We couldn’t cancel this claim.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [confirm, d.id, onCancelled, onClose]);

  return (
    <RecordSheet
      visible
      onClose={onClose}
      eyebrow="Claim"
      icon={icons.claims}
      title={claimTitle(d)}
      subtitle={d.created_at ? `Raised ${fmtDate(d.created_at, '')}` : null}
      badge={<StatusBadge kind="claim" status={d.status} />}
      loading={full.loading && !full.data}
      footer={status === 'draft' ? (
        <>
          <View style={{ flex: 1 }}>
            <Button title="Discard" variant="outline" onPress={cancel} loading={busy} fullWidth />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              title="Continue this claim"
              icon={icons.edit}
              onPress={() => { onClose(); onContinue(d); }}
              fullWidth
            />
          </View>
        </>
      ) : CANCELLABLE.has(status) ? (
        <Button
          title="Withdraw this claim"
          variant="danger"
          onPress={cancel}
          loading={busy}
          fullWidth
        />
      ) : null}
    >
      <SheetStats
        items={[
          { icon: icons.rupee, label: 'Claimed', value: formatMoney(claimAmount(d)) },
          d.approved_amount != null
            ? { icon: icons.check, label: 'Approved', value: formatMoney(d.approved_amount) }
            : null,
        ].filter(Boolean)}
      />

      {items.length > 0 ? (
        <SheetSection icon={icons.document} title={`What is in it (${items.length})`}>
          {/* One row per expense with its receipts as tappable chips. No table —
              the receipts would not fit in a cell. */}
          <View style={{ gap: space[3] }}>
            {items.map((it, i) => (
              <View key={String(it.id || i)} style={{ gap: space[1] }}>
                <View style={{ flexDirection: 'row', gap: space[2] }}>
                  <Text style={[text.bodyStrong, { flex: 1 }]} numberOfLines={1}>
                    {it.category_name || it.description || 'Expense'}
                  </Text>
                  <Text style={[text.bodyStrong, { fontVariant: ['tabular-nums'] }]}>{formatMoney(it.amount)}</Text>
                </View>
                <Text style={text.caption}>
                  {[it.expense_date ? fmtDate(it.expense_date, '') : null, it.merchant || null].filter(Boolean).join(' · ') || 'No details'}
                </Text>
                {it.attachments?.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: 2 }}>
                    {it.attachments.map((att) => <AttachmentChip key={att.id} attachment={att} />)}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </SheetSection>
      ) : null}

      <SheetSection icon={icons.people} title="Where it is" collapsible={false}>
        <SheetGrid
          items={[
            ['Raised on', d.created_at ? fmtDate(d.created_at, null) : null],
            ['Decided on', d.decided_at || d.approved_at ? fmtDate(d.decided_at || d.approved_at, null) : null],
            ['Paid with', d.paid_period_month || null],
          ]}
        />
        {claimStageLabel(d) ? (
          <Text style={[text.small, { color: color.textSecondary }]}>{claimStageLabel(d)}</Text>
        ) : null}
        {d.rejection_reason ? (
          <View style={{ marginTop: space[2] }}>
            <Text style={[text.label, { marginBottom: 2 }]}>Why it was rejected</Text>
            <Text style={text.body}>{d.rejection_reason}</Text>
          </View>
        ) : null}
      </SheetSection>
    </RecordSheet>
  );
}

/* ─── What this organisation lets you claim ──────────────────────────────── */

function Categories({ categories, onClaim }) {
  if (categories.length === 0) {
    return (
      <EmptyState
        icon={icons.claims}
        title="Nothing set up to claim"
        message="Your organisation hasn’t published any reimbursement categories yet."
      />
    );
  }

  return categories.map((row, i) => {
    const c = row.category;
    return (
      <RecordCard
        key={String(c.id || i)}
        icon={icons.claims}
        tone="purple"
        title={c.name || 'Category'}
        subtitle={c.description || null}
        value={row.remaining != null ? formatMoney(row.remaining) : null}
        onPress={() => onClaim(c)}
        accessibilityLabel={`Claim ${c.name}.`}
        meta={[
          { label: 'Per claim', value: claimLimitText(c, formatMoney) },
          { label: 'Overall', value: periodLimitText(c, formatMoney) },
          { label: 'Receipt', value: receiptRuleText(c, formatMoney) },
        ]}
      />
    );
  });
}

/* ─── The section ────────────────────────────────────────────────────────── */

export function ClaimsTab({ onNewClaim, onOpenClaim }) {
  const [view, setView] = useState('claims');
  const [open, setOpen] = useState(null);

  const claims = useResource(() => payrollAPI.getMyReimbursementClaims(), {
    select: (data) => toList(data, ['claims', 'records']),
    initial: [],
  });
  const categories = useResource(() => payrollAPI.getMyReimbursementCategories(), {
    select: (data) => toList(data, ['categories', 'rows', 'records']).map(normalizeHeadroomRow),
    initial: [],
  });

  const reloadClaims = claims.reload;
  const reloadCategories = categories.reload;
  useAttendanceChanged([ATTENDANCE_EVENTS.CLAIM], useCallback(() => {
    reloadClaims();
    reloadCategories();
  }, [reloadClaims, reloadCategories]));

  const rows = claims.data || [];
  const cats = useMemo(
    () => (categories.data || []).filter((r) => r.category?.id && r.category.is_active !== false),
    [categories.data],
  );

  if (claims.error && rows.length === 0) {
    return (
      <View style={{ padding: space[4] }}>
        <ErrorState
          error={claims.error}
          domain="payroll"
          onRetry={claims.reload}
          fallback="We couldn’t load your claims."
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={cardListStyle}>
      <FilterTabs options={VIEWS} value={view} onChange={setView} />
      <Button title="New claim" icon={icons.add} onPress={() => onNewClaim()} fullWidth />

      {view === 'categories' ? (
        categories.loading && cats.length === 0
          ? <CardsSkeleton rows={3} height={110} />
          : <Categories categories={cats} onClaim={onNewClaim} />
      ) : claims.loading && rows.length === 0 ? (
        <CardsSkeleton rows={3} height={88} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={icons.claims}
          title="No claims yet"
          message="Spent something the company pays back? Snap the receipt and claim it."
          action={<Button title="See what you can claim" variant="outline" onPress={() => setView('categories')} />}
        />
      ) : (
        rows.map((claim, i) => (
          <RecordCard
            key={String(claim.id || i)}
            icon={icons.claims}
            tone="purple"
            title={claimTitle(claim)}
            subtitle={claim.created_at ? `Raised ${fmtDate(claim.created_at, '')}` : null}
            value={formatMoney(claimAmount(claim))}
            badge={<StatusBadge kind="claim" status={claim.status} />}
            onPress={claim.id ? () => setOpen(claim) : undefined}
            accessibilityLabel={`${claimTitle(claim)} claim. Open it.`}
          />
        ))
      )}

      {open ? (
        <ClaimSheet
          claim={open}
          onClose={() => setOpen(null)}
          onCancelled={claims.reload}
          onContinue={(c) => onOpenClaim(c.id)}
        />
      ) : null}
    </ScrollView>
  );
}

export default ClaimsTab;
