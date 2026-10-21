// ─────────────────────────────────────────────────────────────────────────────
// features/pay/screens/BankAccountScreen.jsx — "Add your account" / "Change
// bank details". The `BankAccount` modal route of PayTab.
//
// Web ancestor: the bank dialog inside MySalaryPage. Same fields, same
// order, same one write: `PUT /payroll/me/bank-account`, self-scoped — the
// ONLY route anywhere that can create a bank account, which is why HR cannot
// fill this in for somebody and why the empty Bank card nags.
//
// ── THE NUMBER IS RE-ENTERED EVERY TIME ─────────────────────────────────────
//
// The full number is never returned (masked at rest), so an edit cannot be
// prefilled with it — the web asks for it again too. It is typed TWICE here,
// which the web does not do: on a phone keyboard a transposed digit is easy
// and invisible, and the cost is a salary sent to a stranger's account. The
// confirm box is never sent.
//
// ── SAVING UNVERIFIES THE ACCOUNT, ON PURPOSE ───────────────────────────────
//
// Any successful save resets `is_verified` to false and HR must check it again
// (anti-fraud: a hijacked login must not silently redirect a salary). The
// screen says so BEFORE the save, in the subtitle, because finding out after
// is how people end up thinking the app broke their verified account.
//
// ── §11 · THE BUTTON STAYS LIVE ─────────────────────────────────────────────
//
// `validateBankAccount()` in lib/validation.js holds the server's own rules
// (6–20 digits, the IFSC format). Nothing is red until a save is attempted;
// the press travels to the first problem. Disabled only while saving.
//
// ── TWO ⓘ, BOTH FROM THE WEB ────────────────────────────────────────────────
//
// `payroll.bank_details` → `ifsc_code` and `account_type`. The cap is two per
// screen on a phone (CLAUDE.md §7); names and numbers are ordinary fields.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { payrollAPI } from '../../../api';
import { useFormFocus } from '../../../hooks/useFormFocus';
import { revealer, submitState } from '../../../lib/formGuard';
import { validateBankAccount } from '../../../lib/validation';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../../lib/events';
import { errorMessage } from '../../../lib/errors';
import { isNotFound } from '../../../lib/errors/attendanceErrors';
import { color, text } from '../../../theme/tokens';
import {
  Button, Field, FormGrid, FormSheet, InlineAlert, Select, SkeletonBlock, TextField, showToast,
} from '../../../ui';
import { bankNumberShown, bankVerified } from '../payMeta';

const ACCOUNT_TYPES = [
  { value: 'savings', label: 'Savings', caption: 'Where salary almost always goes.' },
  { value: 'current', label: 'Current' },
];

const EMPTY = {
  account_holder_name: '',
  bank_name: '',
  account_number: '',
  confirm_account_number: '',
  ifsc_code: '',
  branch_name: '',
  account_type: 'savings',
};

export default function BankAccountScreen({ navigation }) {
  const scroller = useRef(null);
  const focus = useFormFocus(scroller);

  const [existing, setExisting] = useState(undefined); // undefined = still asking
  const [form, setForm] = useState(EMPTY);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  // Read the account here rather than taking it as a param: a param would be
  // whatever the Bank card last saw, and the form must start from the truth.
  useEffect(() => {
    let cancelled = false;
    payrollAPI.getMyBankAccount()
      .then((res) => {
        if (cancelled) return;
        const d = res?.data?.bank_account || res?.data || null;
        setExisting(d && (d.bank_name || bankNumberShown(d)) ? d : null);
        if (d) {
          setForm({
            ...EMPTY,
            account_holder_name: d.account_holder_name || '',
            bank_name: d.bank_name || '',
            ifsc_code: d.ifsc_code || '',
            branch_name: d.branch_name || '',
            account_type: d.account_type || 'savings',
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // 404 = nothing on file, which is simply a blank form. Anything else
        // still lets them type — the save will say what is wrong.
        setExisting(null);
        if (!isNotFound(err)) setFailure(errorMessage(err, 'payroll', 'We couldn’t load your current details.'));
      });
    return () => { cancelled = true; };
  }, []);

  const set = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFailure('');
  }, []);

  const { errors: problems, payload } = useMemo(() => validateBankAccount(form), [form]);
  const show = revealer(attempted);
  const { disabled, disabledReason } = submitState({ busy });
  const isEdit = !!existing;

  const close = useCallback(() => {
    if (!busy) navigation.goBack();
  }, [busy, navigation]);

  const save = useCallback(async () => {
    if (busy) return;
    if (focus.focusFirstProblem(problems)) {
      setAttempted(true);
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      await payrollAPI.upsertMyBankAccount(payload);
      emitAttendanceChanged(ATTENDANCE_EVENTS.BANK_ACCOUNT, { action: isEdit ? 'update' : 'create' });
      showToast('Bank details saved. HR verifies them before your next pay run.', 'success');
      navigation.goBack();
    } catch (err) {
      setFailure(errorMessage(err, 'payroll', 'We couldn’t save your bank details.'));
    } finally {
      setBusy(false);
    }
  }, [busy, focus, problems, payload, isEdit, navigation]);

  const loading = existing === undefined;

  return (
    <FormSheet
      title={isEdit ? 'Change bank details' : 'Add your account'}
      subtitle={isEdit && bankVerified(existing)
        ? 'Saving sends it back to HR to verify again.'
        : 'Your salary is paid into this account.'}
      onClose={close}
      scrollRef={scroller}
      footer={(
        <>
          <View style={{ flex: 1 }}>
            <Button title="Cancel" variant="outline" onPress={close} disabled={busy} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title={isEdit ? 'Save changes' : 'Save account'}
              onPress={save}
              loading={busy}
              disabled={disabled || loading}
              disabledReason={disabledReason}
              fullWidth
            />
          </View>
        </>
      )}
    >
      {failure ? <InlineAlert tone="rose">{failure}</InlineAlert> : null}

      {loading ? (
        <View style={{ gap: 14 }}>
          {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={64} />)}
        </View>
      ) : (
        <FormGrid>
          <Field
            wide
            required
            label="Name on the account"
            error={show(problems.account_holder_name)}
            register={focus.register('account_holder_name')}
          >
            <TextField
              kind="name"
              value={form.account_holder_name}
              onChangeText={(v) => set('account_holder_name', v)}
              placeholder="As printed on your passbook"
              maxLength={150}
            />
          </Field>

          <Field
            wide
            required
            label="Bank"
            error={show(problems.bank_name)}
            register={focus.register('bank_name')}
          >
            <TextField
              kind="name"
              value={form.bank_name}
              onChangeText={(v) => set('bank_name', v)}
              placeholder="e.g. HDFC Bank"
              maxLength={150}
            />
          </Field>

          <Field
            wide
            required
            label="Account number"
            error={show(problems.account_number)}
            hint={isEdit ? `Now ${bankNumberShown(existing) || 'on file'}. Type the full number again.` : null}
            register={focus.register('account_number')}
          >
            <TextField
              kind="integer"
              value={form.account_number}
              onChangeText={(v) => set('account_number', v.replace(/\D/g, ''))}
              placeholder="6 to 20 digits"
              maxLength={20}
            />
          </Field>

          <Field
            wide
            required
            label="Account number again"
            error={show(problems.confirm_account_number)}
            register={focus.register('confirm_account_number')}
          >
            <TextField
              kind="integer"
              value={form.confirm_account_number}
              onChangeText={(v) => set('confirm_account_number', v.replace(/\D/g, ''))}
              placeholder="So a typo can’t send your pay elsewhere"
              maxLength={20}
              contextMenuHidden
            />
          </Field>

          <Field
            required
            label="IFSC code"
            help={{ surface: 'payroll.bank_details', field: 'ifsc_code' }}
            error={show(problems.ifsc_code)}
            register={focus.register('ifsc_code')}
          >
            <TextField
              kind="code"
              value={form.ifsc_code}
              onChangeText={(v) => set('ifsc_code', v.toUpperCase().replace(/\s/g, ''))}
              placeholder="HDFC0001234"
              maxLength={11}
            />
          </Field>

          <Field
            label="Account type"
            help={{ surface: 'payroll.bank_details', field: 'account_type' }}
            register={focus.register('account_type')}
          >
            <Select
              title="Account type"
              options={ACCOUNT_TYPES}
              value={form.account_type}
              onChange={(v) => set('account_type', v)}
            />
          </Field>

          <Field wide label="Branch" register={focus.register('branch_name')}>
            <TextField
              kind="name"
              value={form.branch_name}
              onChangeText={(v) => set('branch_name', v)}
              placeholder="Optional"
              maxLength={150}
            />
          </Field>
        </FormGrid>
      )}

      <Text style={[text.caption, { color: color.textMuted }]}>
        HR checks every new or changed account before money is sent to it. Pay runs
        already approved still go to the old one.
      </Text>
    </FormSheet>
  );
}

export { BankAccountScreen };
