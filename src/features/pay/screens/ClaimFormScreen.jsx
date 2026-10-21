// ─────────────────────────────────────────────────────────────────────────────
// features/pay/screens/ClaimFormScreen.jsx — "Make a claim" / "Edit claim".
// The `ClaimForm` modal route of PayTab.
//
// Web ancestor: ClaimEditorDialog in MyReimbursementsPage. The same contract,
// the same checks (`validateClaim` in lib/validation.js) and the same
// sentences; a different FLOW, because a phone is where the receipt is.
//
//   params: { claimId? }      continue a draft
//           { categoryId? }   start a new claim on this category
//
// ── RECEIPTS BEFORE THE DRAFT EXISTS ────────────────────────────────────────
//
// The API attaches a receipt to a saved ITEM (`…/claims/:id/items/:itemId/
// attachments`), so a new line has nowhere to put a file. The web solves it by
// making you "Save the draft to attach receipts". Here a picked file is HELD
// on the line (`pending`) and uploaded straight after the save, matched back
// to its saved item by position (`display_order`). One tap, receipt in hand.
//
// A file that fails to upload stays pending on its line with the reason, and
// the next save or submit tries it again — nothing picked is silently lost.
//
// ── SAVING A CHANGED DRAFT DROPS ITS RECEIPTS (web G5-3) ────────────────────
//
// `PUT …/claims/:id` replaces every item, and the server deletes receipts on
// replaced items. So a save that changes the lines of a draft that already
// has receipts ASKS first, in the web's words. Unchanged lines are not
// re-sent: pending receipts on an unchanged draft upload without a replace.
//
// ── SUBMIT = SAVE, UPLOAD, CHECK RECEIPTS, CONFIRM, SEND ────────────────────
//
// `receiptNeeded()` runs on the SAVED state, after uploads, so a receipt that
// just went up counts. The confirm says the total and that it can be
// withdrawn until HR's final approval — the web's sentence.
//
// RECEIPT_REQUIRED and CATEGORY_LIMIT_EXCEEDED from the server land under the
// line they are about where the server says which (`receiptProblem`), and in
// the alert at the top otherwise. CLAIM_NOT_DRAFT closes the form: somebody
// submitted it from the web while this was open.
//
// ── ONE ⓘ ───────────────────────────────────────────────────────────────────
//
// `payroll.reimbursement_claim` → `category_id`, on the first line only. Every
// line repeating it is wallpaper (CLAUDE.md §7).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { payrollAPI } from '../../../api';
import { useFormFocus } from '../../../hooks/useFormFocus';
import { uploadErrorMessage, uploadFile } from '../../../lib/attachments';
import { todayYMD } from '../../../lib/dates';
import { errorMessage } from '../../../lib/errors';
import { limitViolationLines, payrollErrorCode } from '../../../lib/errors/payrollErrors';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../../lib/events';
import { revealer, submitState } from '../../../lib/formGuard';
import { formatMoney } from '../../../lib/format';
import { toList } from '../../../lib/normalize';
import {
  CLAIM_DESCRIPTION_MAX, CLAIM_MERCHANT_MAX, CLAIM_TITLE_MAX, validateClaim,
} from '../../../lib/validation';
import { icons } from '../../../theme/icons';
import { color, iconSize, radius, space, text } from '../../../theme/tokens';
import {
  AttachmentChip, AttachmentPicker, Button, DateField, EmptyState, Field, FieldError, FormGrid,
  FormSheet, InlineAlert, Select, SkeletonBlock, TextField, showToast, useConfirm,
} from '../../../ui';
import {
  claimLimitText, normalizeClaimDetail, normalizeHeadroomRow, receiptNeeded, receiptProblem,
  receiptRuleText,
} from '../payMeta';

let seq = 0;
const newKey = () => `l${Date.now().toString(36)}${(seq += 1)}`;

const newItem = (categoryId = '') => ({
  key: newKey(),
  id: null,
  category_id: categoryId,
  expense_date: todayYMD(),
  merchant: '',
  description: '',
  amount: '',
  attachments: [],
  pending: [],
  uploadError: '',
});

function itemsFromClaim(detail) {
  const items = detail?.items || [];
  if (items.length === 0) return [newItem()];
  return items.map((it) => ({
    key: it.id || newKey(),
    id: it.id || null,
    category_id: it.category_id || '',
    expense_date: it.expense_date ? String(it.expense_date).slice(0, 10) : todayYMD(),
    merchant: it.merchant || '',
    description: it.description || '',
    amount: it.amount != null ? String(it.amount) : '',
    attachments: it.attachments || [],
    pending: [],
    uploadError: '',
  }));
}

/** What the server would store. Receipts and pending files are not part of it. */
const signature = (title, items) => JSON.stringify({
  t: title.trim(),
  i: items.map((it) => [it.category_id, it.expense_date, String(it.amount ?? ''), it.merchant.trim(), it.description.trim()]),
});

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function ClaimFormScreen({ navigation, route }) {
  const scroller = useRef(null);
  const focus = useFormFocus(scroller);
  const confirm = useConfirm();

  const initialClaimId = route?.params?.claimId || null;
  const initialCategory = route?.params?.categoryId || '';

  const [claimId, setClaimId] = useState(initialClaimId);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState(() => [newItem(initialCategory)]);
  const [savedSig, setSavedSig] = useState(null);
  const [categories, setCategories] = useState({ rows: [], status: 'loading' });
  const [loadingClaim, setLoadingClaim] = useState(!!initialClaimId);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(''); // '' | 'save' | 'submit'
  const [failure, setFailure] = useState('');
  const [flagged, setFlagged] = useState(''); // an item id the server pointed at
  const busyRef = useRef(false);

  /* ── Load: categories always, the claim when continuing one ─────────────── */

  const loadCategories = useCallback(async () => {
    setCategories((c) => ({ ...c, status: 'loading' }));
    try {
      const res = await payrollAPI.getMyReimbursementCategories();
      const rows = toList(res?.data ?? res, ['categories', 'rows', 'records']).map(normalizeHeadroomRow)
        .filter((r) => r.category?.id && r.category.is_active !== false);
      setCategories({ rows, status: 'ready' });
    } catch {
      setCategories((c) => ({ ...c, status: 'error' }));
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  useEffect(() => {
    if (!initialClaimId) return undefined;
    let cancelled = false;
    payrollAPI.getMyReimbursementClaim(initialClaimId)
      .then((res) => {
        if (cancelled) return;
        const detail = normalizeClaimDetail(res?.data ?? res);
        const seeded = itemsFromClaim(detail);
        setTitle(detail.title || '');
        setItems(seeded);
        setSavedSig(signature(detail.title || '', seeded));
      })
      .catch((err) => {
        if (!cancelled) setFailure(errorMessage(err, 'payroll', 'We couldn’t open this claim.'));
      })
      .finally(() => { if (!cancelled) setLoadingClaim(false); });
    return () => { cancelled = true; };
  }, [initialClaimId]);

  const byId = useMemo(() => {
    const map = new Map();
    categories.rows.forEach((r) => map.set(r.category.id, r));
    return map;
  }, [categories.rows]);

  const categoryOptions = useMemo(() => categories.rows.map((r) => ({
    value: r.category.id,
    label: r.category.name || 'Category',
    caption: [
      r.category.max_amount_per_claim ? `Up to ${claimLimitText(r.category, formatMoney)} a claim` : null,
      receiptRuleText(r.category, formatMoney) !== 'Not needed'
        ? `Receipt ${receiptRuleText(r.category, formatMoney).toLowerCase()}` : null,
    ].filter(Boolean).join(' · ') || null,
  })), [categories.rows]);

  /* ── Editing ────────────────────────────────────────────────────────────── */

  const isNew = !claimId;
  const dirty = isNew || signature(title, items) !== savedSig;
  const { errors: problems, payload } = useMemo(
    () => validateClaim({ title, items }),
    [title, items],
  );
  const show = revealer(attempted);
  const total = items.reduce((t, it) => t + (Number.parseFloat(it.amount) || 0), 0);

  const setItem = useCallback((key, patch) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
    setFailure('');
  }, []);
  const addItem = () => setItems((list) => [...list, newItem()]);
  const removeItem = async (it) => {
    if (it.attachments.length > 0) {
      const ok = await confirm({
        title: 'Remove this expense?',
        message: `Its ${plural(it.attachments.length, 'receipt')} go with it.`,
        confirmText: 'Remove',
        destructive: true,
      });
      if (!ok) return;
    }
    setItems((list) => (list.length > 1 ? list.filter((x) => x.key !== it.key) : list));
  };

  const removeAttachment = async (it, att) => {
    const ok = await confirm({
      title: `Remove ${att.file_name}?`,
      message: 'The receipt is deleted from this claim.',
      confirmText: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await payrollAPI.deleteMyAttachment(att.id);
      setItem(it.key, { attachments: it.attachments.filter((a) => a.id !== att.id) });
    } catch (err) {
      showToast(errorMessage(err, 'payroll', 'Couldn’t remove this receipt.'), 'error');
    }
  };

  /* ── Save → upload → (submit) ───────────────────────────────────────────── */

  // Saves the lines when they changed, then uploads every held file. Returns
  // the items as they now stand, or null when the save did not happen.
  const persist = useCallback(async () => {
    let id = claimId;
    let working = items;

    if (dirty) {
      if (!isNew) {
        const withReceipts = items.reduce((n, it) => n + it.attachments.length, 0);
        if (withReceipts > 0) {
          const ok = await confirm({
            title: 'Save these changes?',
            message: `Saving these changes removes the ${plural(withReceipts, 'receipt')} already attached, because every item is saved again. Continue?`,
            confirmText: 'Save anyway',
          });
          if (!ok) return null;
        }
      }
      const res = isNew
        ? await payrollAPI.createMyReimbursementClaim(payload)
        : await payrollAPI.replaceMyReimbursementClaim(id, payload);
      let detail = normalizeClaimDetail(res?.data ?? res);
      id = detail.id || id;
      // Some replies carry only the header. The item ids are what the receipts
      // attach to, so read the claim back rather than guess them.
      if (detail.items.length !== items.length && id) {
        detail = normalizeClaimDetail((await payrollAPI.getMyReimbursementClaim(id))?.data);
      }
      const saved = itemsFromClaim(detail);
      // Saved items come back in `display_order`, which is the form's order.
      // Carry each line's held files across to its new id.
      working = saved.map((s, i) => ({
        ...s,
        pending: items[i]?.pending || [],
        // Replaced items lost their receipts on the server; the reply says so.
      }));
      setClaimId(id);
      setSavedSig(signature(title, working));
    }

    // Upload what is held, line by line. A failure stays on its line.
    const after = [];
    for (const it of working) {
      if (!it.pending.length || !it.id) {
        after.push(it);
        continue;
      }
      const attachments = [...it.attachments];
      const stillPending = [];
      let uploadError = '';
      for (const file of it.pending) {
        try {
          const att = await uploadFile({
            issue: (meta) => payrollAPI.requestClaimReceiptUpload(id, it.id, meta),
            confirm: (attId) => payrollAPI.confirmMyAttachment(attId),
            file,
          });
          attachments.push(att);
        } catch (err) {
          stillPending.push(file);
          uploadError = uploadErrorMessage(err);
        }
      }
      after.push({ ...it, attachments, pending: stillPending, uploadError });
    }
    setItems(after);
    return { id, items: after };
  }, [claimId, items, dirty, isNew, confirm, payload, title]);

  const handleFailure = useCallback((err, fallback) => {
    const code = payrollErrorCode(err);
    if (code === 'CLAIM_NOT_DRAFT') {
      showToast(errorMessage(err, 'payroll', fallback), 'error');
      emitAttendanceChanged(ATTENDANCE_EVENTS.CLAIM, { action: 'stale' });
      navigation.goBack();
      return;
    }
    if (code === 'RECEIPT_REQUIRED') setFlagged(receiptProblem(err));
    const lines = limitViolationLines(err).map((v) => (typeof v === 'string' ? v : v.message || '')).filter(Boolean);
    setFailure([errorMessage(err, 'payroll', fallback), ...lines].join(' '));
    scroller.current?.scrollTo?.({ y: 0, animated: true });
  }, [navigation]);

  const guard = () => {
    if (focus.focusFirstProblem(problems)) {
      setAttempted(true);
      return false;
    }
    return true;
  };

  const saveDraft = useCallback(async () => {
    if (busyRef.current || !guard()) return;
    busyRef.current = true;
    setBusy('save');
    setFailure('');
    try {
      const done = await persist();
      if (!done) return;
      emitAttendanceChanged(ATTENDANCE_EVENTS.CLAIM, { action: 'draft' });
      const stuck = done.items.some((it) => it.pending.length);
      if (stuck) {
        setFailure('The draft is saved, but some receipts didn’t upload. They’re still on their expense — save again to retry.');
        return;
      }
      showToast('Draft saved. Finish it from Claims any time.', 'success');
      navigation.goBack();
    } catch (err) {
      handleFailure(err, 'Couldn’t save this draft.');
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, handleFailure, navigation, problems]);

  const submit = useCallback(async () => {
    if (busyRef.current || !guard()) return;
    busyRef.current = true;
    setBusy('submit');
    setFailure('');
    setFlagged('');
    try {
      const done = await persist();
      if (!done) return;
      if (done.items.some((it) => it.pending.length)) {
        setFailure('Some receipts didn’t upload, so the claim wasn’t sent. They’re still on their expense — try again.');
        return;
      }
      const missing = done.items.filter((it) => receiptNeeded(byId.get(it.category_id)?.category, it.amount)
        && it.attachments.length === 0);
      if (missing.length > 0) {
        const names = missing.map((it) => byId.get(it.category_id)?.category?.name || 'an expense').join(', ');
        setFailure(`Attach a receipt for: ${names}.`);
        setFlagged(missing[0].id || '');
        scroller.current?.scrollTo?.({ y: 0, animated: true });
        return;
      }
      const sum = done.items.reduce((t, it) => t + (Number.parseFloat(it.amount) || 0), 0);
      const ok = await confirm({
        title: `Submit ${formatMoney(sum)}?`,
        message: 'You can’t edit it after this, but you can withdraw it until HR gives final approval.',
        confirmText: 'Submit',
      });
      if (!ok) {
        emitAttendanceChanged(ATTENDANCE_EVENTS.CLAIM, { action: 'draft' });
        return;
      }
      await payrollAPI.submitMyReimbursementClaim(done.id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CLAIM, { action: 'submit' });
      showToast('Claim sent for approval.', 'success');
      navigation.goBack();
    } catch (err) {
      handleFailure(err, 'Couldn’t submit this claim.');
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, byId, confirm, handleFailure, navigation, problems]);

  const close = useCallback(() => {
    if (!busyRef.current) navigation.goBack();
  }, [navigation]);

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const { disabled, disabledReason } = submitState({ busy: !!busy });
  const loading = loadingClaim || categories.status === 'loading';
  const noCategories = categories.status === 'ready' && categories.rows.length === 0;
  const canEdit = !loading && categories.status === 'ready' && !noCategories;
  const Trash = icons.delete;
  const Plus = icons.add;

  return (
    <FormSheet
      title={initialClaimId ? 'Edit claim' : 'Make a claim'}
      subtitle="Add each expense with its receipt, then submit it for approval."
      onClose={close}
      scrollRef={scroller}
      footer={canEdit ? (
        <>
          <View style={{ flex: 1 }}>
            <Button
              title="Save draft"
              variant="outline"
              onPress={saveDraft}
              loading={busy === 'save'}
              disabled={disabled}
              disabledReason={disabledReason}
              fullWidth
            />
          </View>
          <View style={{ flex: 1.3 }}>
            <Button
              title={total > 0 ? `Submit ${formatMoney(total)}` : 'Submit'}
              onPress={submit}
              loading={busy === 'submit'}
              disabled={disabled}
              disabledReason={disabledReason}
              fullWidth
            />
          </View>
        </>
      ) : (
        <View style={{ flex: 1 }}>
          <Button title="Close" variant="outline" onPress={close} fullWidth />
        </View>
      )}
    >
      {failure ? <InlineAlert tone="rose">{failure}</InlineAlert> : null}

      {loading ? (
        <View style={{ gap: space[3] }}>
          <SkeletonBlock height={64} />
          <SkeletonBlock height={220} radius={radius.lg} />
        </View>
      ) : categories.status === 'error' ? (
        <EmptyState
          icon={icons.claims}
          title="Couldn’t load what you can claim"
          message="Check your connection and try again."
          action={<Button title="Try again" variant="outline" onPress={loadCategories} />}
        />
      ) : noCategories ? (
        <EmptyState
          icon={icons.claims}
          title="Nothing set up to claim"
          message="Your organisation hasn’t added any expense categories yet. Ask HR to set them up."
        />
      ) : (
        <>
          <Field
            required
            wide
            label="What is this claim for"
            error={show(problems.title)}
            register={focus.register('title')}
          >
            <TextField
              value={title}
              onChangeText={(v) => { setTitle(v); setFailure(''); }}
              placeholder="e.g. Client visit, Mumbai"
              maxLength={CLAIM_TITLE_MAX}
            />
          </Field>

          {items.map((it, idx) => {
            const row = byId.get(it.category_id);
            const cat = row?.category;
            const needs = receiptNeeded(cat, it.amount) && it.attachments.length === 0 && it.pending.length === 0;
            const lineError = show(problems[`item:${it.key}`]);
            const pointedAt = flagged && it.id === flagged;
            const rules = cat ? [
              row?.remaining != null ? `${formatMoney(row.remaining)} left this period` : null,
              cat.max_amount_per_claim ? `up to ${claimLimitText(cat, formatMoney)} a claim` : null,
            ].filter(Boolean).join(' · ') : '';

            return (
              // A LABELLED GROUP, not a card: the form is already the panel
              // (CLAUDE.md §1, one level of enclosure). A hairline above each
              // line after the first is the only separation.
              <View
                key={it.key}
                onLayout={focus.register(`item:${it.key}`).onLayout}
                style={{
                  gap: space[3],
                  paddingTop: idx > 0 ? space[4] : 0,
                  borderTopWidth: idx > 0 ? 1 : 0,
                  borderTopColor: color.borderSubtle,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <View
                    style={{
                      width: 26, height: 26, borderRadius: radius.full, alignItems: 'center',
                      justifyContent: 'center', backgroundColor: pointedAt ? color.danger.bg : color.brandChipBg,
                    }}
                  >
                    <Text style={[text.smallStrong, { color: pointedAt ? color.danger.fg : color.brandChipFg }]}>
                      {idx + 1}
                    </Text>
                  </View>
                  <Text style={[text.bodyStrong, { flex: 1 }]}>
                    {cat?.name || `Expense ${idx + 1}`}
                  </Text>
                  {items.length > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove expense ${idx + 1}`}
                      onPress={() => removeItem(it)}
                      hitSlop={10}
                      style={{ padding: space[1] }}
                    >
                      {Trash ? <Trash size={iconSize.md} color={color.textMuted} /> : null}
                    </Pressable>
                  ) : null}
                </View>

                <FormGrid>
                  <Field
                    wide
                    required
                    label="Category"
                    help={idx === 0 ? { surface: 'payroll.reimbursement_claim', field: 'category_id' } : undefined}
                  >
                    <Select
                      title="Category"
                      options={categoryOptions}
                      value={it.category_id}
                      onChange={(v) => setItem(it.key, { category_id: v })}
                      placeholder="Choose a category"
                      invalid={!!lineError && !it.category_id}
                    />
                  </Field>
                  <Field required label="Date paid">
                    <DateField
                      value={it.expense_date}
                      onChange={(v) => setItem(it.key, { expense_date: v })}
                      max={todayYMD()}
                    />
                  </Field>
                  <Field required label="Amount">
                    <TextField
                      kind="amount"
                      value={it.amount}
                      onChangeText={(v) => setItem(it.key, { amount: v.replace(/[^0-9.]/g, '') })}
                      placeholder="0.00"
                      invalid={!!lineError && !!it.category_id}
                      left={<Text style={[text.bodyStrong, { color: color.textMuted }]}>₹</Text>}
                    />
                  </Field>
                  <Field label="Paid to">
                    <TextField
                      value={it.merchant}
                      onChangeText={(v) => setItem(it.key, { merchant: v })}
                      placeholder="Optional"
                      maxLength={CLAIM_MERCHANT_MAX}
                    />
                  </Field>
                  <Field label="Note">
                    <TextField
                      value={it.description}
                      onChangeText={(v) => setItem(it.key, { description: v })}
                      placeholder="Optional"
                      maxLength={CLAIM_DESCRIPTION_MAX}
                    />
                  </Field>
                </FormGrid>

                {lineError ? <FieldError>{lineError}</FieldError> : null}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'flex-start' }}>
                  {it.attachments.map((att) => (
                    <AttachmentChip key={att.id} attachment={att} onRemove={() => removeAttachment(it, att)} />
                  ))}
                  {it.pending.map((file, i) => (
                    <AttachmentChip
                      key={`p${i}`}
                      pending
                      attachment={{ id: `p${i}`, file_name: file.name || 'Receipt' }}
                      onRemove={() => setItem(it.key, { pending: it.pending.filter((_, x) => x !== i), uploadError: '' })}
                    />
                  ))}
                  <AttachmentPicker
                    label={it.attachments.length || it.pending.length ? 'Add another' : 'Add receipt'}
                    onPicked={(file) => setItem(it.key, { pending: [...it.pending, file], uploadError: '' })}
                  />
                </View>
                {it.uploadError ? <FieldError>{it.uploadError}</FieldError> : null}
                {needs ? (
                  <Text style={[text.smallStrong, { color: color.brandChipFg }]}>
                    {`A receipt is needed ${receiptRuleText(cat, formatMoney) === 'Always' ? 'for this category' : 'at this amount'}.`}
                  </Text>
                ) : null}
                {rules ? <Text style={text.caption}>{rules}</Text> : null}
              </View>
            );
          })}

          <Pressable
            accessibilityRole="button"
            onPress={addItem}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space[2],
              minHeight: 48,
              borderRadius: radius.md,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: color.brandChipFg,
              backgroundColor: pressed ? color.brandChipBg : 'transparent',
            })}
          >
            {Plus ? <Plus size={iconSize.md} color={color.brandChipFg} /> : null}
            <Text style={[text.bodyStrong, { color: color.brandChipFg }]}>Add another expense</Text>
          </Pressable>

          <Text style={[text.caption, { color: color.textMuted }]}>
            Approved claims are paid with your salary, on top of your take-home.
          </Text>
        </>
      )}
    </FormSheet>
  );
}

export { ClaimFormScreen };
