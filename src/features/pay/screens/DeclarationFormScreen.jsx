// ─────────────────────────────────────────────────────────────────────────────
// features/pay/screens/DeclarationFormScreen.jsx — "Declare an investment".
// The `DeclarationForm` modal route of PayTab.
//
// Web ancestor: MyTaxAndInvestmentsPage › DeclarationsTab. The same contract,
// the same status rules and the same section list (`TAX_SECTIONS` in
// payMeta.js); a phone-shaped flow — one labelled group per saving instead of
// a five-column table.
//
//   params: { fy? }   the financial year; defaults to the current one
//
// ── WHAT THE STATUS LETS YOU DO (web rules, verbatim) ───────────────────────
//
//   draft                     add / change / remove lines, attach proofs,
//                             save, submit to HR
//   submitted · under_review  amounts are locked; proof references and proof
//                             files can still be added, "Save proofs"
//   anything else             read only — HR has decided
//
// `declarationStage()` in payMeta.js is the one place that rule lives.
//
// ── PUT REPLACES THE WHOLE DECLARATION ──────────────────────────────────────
//
// `upsertMyDeclaration` is an upsert of every line, not a patch, so the form
// always sends all of them (`validateDeclaration` builds the payload). The
// server's auto-filled PF line (`sub_category: 'EPF_AUTO'`) is shown, never
// edited and never sent back — the web filters it the same way.
//
// ── PROOFS BEFORE THE LINE EXISTS ───────────────────────────────────────────
//
// A proof attaches to a SAVED item (`…/declarations/items/:itemId/
// attachments`). The web makes you "Save the draft to attach a proof file";
// here, as in ClaimForm, a picked file is HELD on its line and uploaded right
// after the save, matched back to the saved item by position among the
// editable lines (the server keeps their order). A file that fails stays held
// with the reason, and the next save tries again.
//
// The picker is the house `AttachmentPicker` — the §4 blocker in
// 00-plan/07-pay-screen-plan.md is gone, so proofs are no longer "add them on
// the web".
//
// ── ⓘ: TWO, ON THE FIRST LINE ONLY ──────────────────────────────────────────
//
// `payroll.tax_declaration` › `section` and › `proof_reference`. Every line
// repeating them is wallpaper (CLAUDE.md §7, two per screen on a phone).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { payrollAPI } from '../../../api';
import { useFormFocus } from '../../../hooks/useFormFocus';
import { uploadErrorMessage, uploadFile } from '../../../lib/attachments';
import { errorMessage } from '../../../lib/errors';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../../lib/events';
import { revealer, submitState } from '../../../lib/formGuard';
import { formatMoney } from '../../../lib/format';
import { fmtDate } from '../../../lib/dates';
import { validateDeclaration } from '../../../lib/validation';
import { haptic } from '../../../ui/haptics';
import { icons } from '../../../theme/icons';
import { color, iconSize, radius, space, text } from '../../../theme/tokens';
import {
  AttachmentChip, AttachmentPicker, Button, EmptyState, Field, FieldError, FormGrid, FormSheet,
  InlineAlert, Select, SkeletonBlock, StatusBadge, TextField, showToast, useConfirm,
} from '../../../ui';
import {
  TAX_SECTIONS, currentFinancialYear, declarationRows, declarationStage, num,
} from '../payMeta';

let seq = 0;
const newKey = () => `d${Date.now().toString(36)}${(seq += 1)}`;

const newRow = () => ({
  key: newKey(),
  item_id: null,
  section: '80C',
  sub_category: '',
  declared_amount: '',
  verified_amount: null,
  proof_reference: '',
  attachments: [],
  pending: [],
  uploadError: '',
  locked: false,
});

const SECTION_OPTIONS = TAX_SECTIONS.map((s) => ({ value: s, label: s }));

const unwrapDeclaration = (res) => {
  const d = res?.data ?? res ?? {};
  return d?.declaration || d;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function DeclarationFormScreen({ navigation, route }) {
  const scroller = useRef(null);
  const focus = useFormFocus(scroller);
  const confirm = useConfirm();
  const fy = route?.params?.fy || currentFinancialYear();

  const [decl, setDecl] = useState(null);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(''); // '' | 'save' | 'submit' | 'proofs'
  const [failure, setFailure] = useState('');
  const busyRef = useRef(false);

  /* ── Load ───────────────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    const res = await payrollAPI.getMyDeclaration({ financial_year: fy });
    const d = unwrapDeclaration(res);
    const seeded = declarationRows(d).map((r) => ({ ...r, pending: [], uploadError: '' }));
    return { d, seeded };
  }, [fy]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then(({ d, seeded }) => {
        if (cancelled) return;
        setDecl(d);
        const stage = declarationStage(d?.status);
        // An empty draft opens on one blank line — the form's only job.
        setRows(seeded.length === 0 && stage.editable ? [newRow()] : seeded);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(errorMessage(err, 'payroll', 'We couldn’t open your declaration.'));
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [load]);

  const stage = declarationStage(decl?.status);
  const editableRows = rows.filter((r) => !r.locked);

  /* ── Editing ────────────────────────────────────────────────────────────── */

  const { errors: problems, payload } = useMemo(() => validateDeclaration(rows), [rows]);
  const show = revealer(attempted);
  const declaredTotal = rows.reduce((t, r) => t + num(r.declared_amount), 0);
  const verifiedTotal = rows.reduce((t, r) => t + num(r.verified_amount), 0);

  const setRow = useCallback((key, patch) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setFailure('');
  }, []);

  const addRow = () => {
    haptic('selection');
    setRows((list) => [...list, newRow()]);
  };

  const removeRow = async (r) => {
    if (r.attachments.length > 0) {
      const ok = await confirm({
        title: 'Remove this saving?',
        message: `Its ${plural(r.attachments.length, 'proof')} go with it.`,
        confirmText: 'Remove',
        destructive: true,
      });
      if (!ok) return;
    }
    haptic('light');
    setRows((list) => list.filter((x) => x.key !== r.key));
  };

  const removeAttachment = async (r, att) => {
    const ok = await confirm({
      title: `Remove ${att.file_name}?`,
      message: 'The proof is deleted from this declaration.',
      confirmText: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await payrollAPI.deleteMyAttachment(att.id);
      setRow(r.key, { attachments: r.attachments.filter((a) => a.id !== att.id) });
    } catch (err) {
      showToast(errorMessage(err, 'payroll', 'Couldn’t remove this proof.'), 'error');
    }
  };

  /* ── Save → upload ──────────────────────────────────────────────────────── */

  // Uploads every held file on lines that have a saved id. Returns the rows as
  // they now stand.
  const uploadHeld = useCallback(async (list) => {
    const after = [];
    for (const r of list) {
      if (!r.pending?.length || !r.item_id) {
        after.push(r);
        continue;
      }
      const attachments = [...r.attachments];
      const stillPending = [];
      let uploadError = '';
      for (const file of r.pending) {
        try {
          const att = await uploadFile({
            issue: (meta) => payrollAPI.requestDeclarationProofUpload(r.item_id, meta),
            confirm: (attId) => payrollAPI.confirmMyAttachment(attId),
            file,
          });
          attachments.push(att);
        } catch (err) {
          stillPending.push(file);
          uploadError = uploadErrorMessage(err);
        }
      }
      after.push({ ...r, attachments, pending: stillPending, uploadError });
    }
    return after;
  }, []);

  // Saves the draft, reads it back for the item ids, carries held files
  // across by position among the editable lines, then uploads them.
  const persistDraft = useCallback(async () => {
    await payrollAPI.upsertMyDeclaration(payload, { financial_year: fy });
    const { d, seeded } = await load();
    const local = rows.filter((r) => !r.locked);
    let i = 0;
    const merged = seeded.map((s) => {
      if (s.locked) return { ...s, pending: [], uploadError: '' };
      const was = local[i];
      i += 1;
      return { ...s, pending: was?.pending || [], uploadError: '' };
    });
    const after = await uploadHeld(merged);
    setDecl(d);
    setRows(after);
    return after;
  }, [payload, fy, load, rows, uploadHeld]);

  const guard = () => {
    if (focus.focusFirstProblem(problems)) {
      setAttempted(true);
      return false;
    }
    return true;
  };

  const run = useCallback(async (kind, fn, fallback) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setFailure('');
    try {
      await fn();
    } catch (err) {
      haptic('error');
      setFailure(errorMessage(err, 'payroll', fallback));
      scroller.current?.scrollTo?.({ y: 0, animated: true });
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }, []);

  const saveDraft = () => {
    if (!guard()) return;
    run('save', async () => {
      const after = await persistDraft();
      emitAttendanceChanged(ATTENDANCE_EVENTS.TAX_DECLARATION, { action: 'draft' });
      if (after.some((r) => r.pending.length)) {
        setFailure('Your declaration is saved, but some proofs didn’t upload. They’re still on their line — save again to retry.');
        return;
      }
      showToast('Declaration saved. Send it to HR when you’re ready.', 'success');
      navigation.goBack();
    }, 'Couldn’t save your declaration.');
  };

  const submit = () => {
    if (!guard()) return;
    run('submit', async () => {
      const after = await persistDraft();
      if (after.some((r) => r.pending.length)) {
        setFailure('Some proofs didn’t upload, so nothing was sent. They’re still on their line — try again.');
        return;
      }
      const ok = await confirm({
        title: `Send ${formatMoney(declaredTotal)} to HR?`,
        message: 'You can’t change the amounts after this. You can still add proofs while HR checks it.',
        confirmText: 'Send to HR',
      });
      if (!ok) {
        emitAttendanceChanged(ATTENDANCE_EVENTS.TAX_DECLARATION, { action: 'draft' });
        return;
      }
      await payrollAPI.submitMyDeclaration({ financial_year: fy });
      emitAttendanceChanged(ATTENDANCE_EVENTS.TAX_DECLARATION, { action: 'submit' });
      showToast('Declaration sent to HR.', 'success');
      navigation.goBack();
    }, 'Couldn’t send your declaration.');
  };

  const saveProofs = () => {
    run('proofs', async () => {
      const refs = rows
        .filter((r) => r.item_id && !r.locked && String(r.proof_reference || '').trim())
        .map((r) => ({ item_id: r.item_id, proof_reference: String(r.proof_reference).trim() }));
      if (refs.length) {
        await payrollAPI.recordMyDeclarationProofs({ items: refs }, { financial_year: fy });
      }
      const after = await uploadHeld(rows);
      setRows(after);
      emitAttendanceChanged(ATTENDANCE_EVENTS.TAX_DECLARATION, { action: 'proofs' });
      if (after.some((r) => r.pending.length)) {
        setFailure('Some proofs didn’t upload. They’re still on their line — try again.');
        return;
      }
      showToast('Proofs saved.', 'success');
      navigation.goBack();
    }, 'Couldn’t save your proofs.');
  };

  const close = useCallback(() => {
    if (!busyRef.current) navigation.goBack();
  }, [navigation]);

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const { disabled, disabledReason } = submitState({ busy: !!busy });
  const Trash = icons.delete;
  const Plus = icons.add;

  const footer = status !== 'ready' ? (
    <View style={{ flex: 1 }}>
      <Button title="Close" variant="outline" onPress={close} fullWidth />
    </View>
  ) : stage.editable ? (
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
          title="Send to HR"
          icon={icons.send}
          onPress={submit}
          loading={busy === 'submit'}
          disabled={disabled || editableRows.length === 0}
          disabledReason={editableRows.length === 0 ? 'Add a saving first.' : disabledReason}
          fullWidth
        />
      </View>
    </>
  ) : stage.proofsOpen ? (
    <View style={{ flex: 1 }}>
      <Button
        title="Save proofs"
        icon={icons.attachment}
        onPress={saveProofs}
        loading={busy === 'proofs'}
        disabled={disabled}
        disabledReason={disabledReason}
        fullWidth
      />
    </View>
  ) : (
    <View style={{ flex: 1 }}>
      <Button title="Close" variant="outline" onPress={close} fullWidth />
    </View>
  );

  return (
    <FormSheet
      title="Declare an investment"
      subtitle={`FY ${fy} · what you’ve invested or spent that lowers your income tax.`}
      onClose={close}
      scrollRef={scroller}
      footer={footer}
    >
      {failure ? <InlineAlert tone="rose">{failure}</InlineAlert> : null}

      {status === 'loading' ? (
        <View style={{ gap: space[3] }}>
          <SkeletonBlock height={56} radius={radius.lg} />
          <SkeletonBlock height={220} radius={radius.lg} />
        </View>
      ) : status === 'error' ? (
        <EmptyState
          icon={icons.tax}
          title="Couldn’t open your declaration"
          message={loadError}
        />
      ) : (
        <>
          {/* Where it stands, in one line: the status, the totals, the deadline. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              padding: space[3],
              borderRadius: radius.lg,
              backgroundColor: color.brandSoftBg,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[text.label, { color: color.brandSoftFg }]}>Declared</Text>
              <Text style={[text.metric, { color: color.brandSoftFg }]}>{formatMoney(declaredTotal)}</Text>
              {verifiedTotal > 0 ? (
                <Text style={text.caption}>{`${formatMoney(verifiedTotal)} accepted by HR`}</Text>
              ) : decl?.proof_deadline ? (
                <Text style={text.caption}>{`Proofs due by ${fmtDate(decl.proof_deadline, '')}`}</Text>
              ) : null}
            </View>
            <StatusBadge kind="declaration" status={stage.status} />
          </View>

          {!stage.editable && stage.proofsOpen ? (
            <InlineAlert tone="blue">
              HR is checking this. The amounts are locked, but you can still add a proof for each saving.
            </InlineAlert>
          ) : null}
          {!stage.proofsOpen ? (
            <InlineAlert tone="blue">
              HR has finished with this declaration, so nothing on it can change now.
            </InlineAlert>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState
              icon={icons.document}
              title="Nothing declared"
              message={`No savings were declared for FY ${fy}.`}
            />
          ) : null}

          {rows.map((r, idx) => {
            const editable = stage.editable && !r.locked;
            const proofsHere = stage.proofsOpen && !r.locked;
            const lineError = show(problems[`row:${r.key}`]);
            const first = idx === rows.findIndex((x) => !x.locked);

            return (
              // A LABELLED GROUP, not a card — the form is already the panel
              // (CLAUDE.md §1, one level of enclosure).
              <View
                key={r.key}
                onLayout={focus.register(`row:${r.key}`).onLayout}
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
                      justifyContent: 'center', backgroundColor: lineError ? color.danger.bg : color.brandChipBg,
                    }}
                  >
                    <Text style={[text.smallStrong, { color: lineError ? color.danger.fg : color.brandChipFg }]}>
                      {idx + 1}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={[text.bodyStrong, { flex: 1 }]}>
                    {r.locked ? 'PF, added for you' : r.sub_category?.trim() || r.section}
                  </Text>
                  {editable && editableRows.length > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove saving ${idx + 1}`}
                      onPress={() => removeRow(r)}
                      hitSlop={10}
                      style={{ padding: space[1] }}
                    >
                      {Trash ? <Trash size={iconSize.md} color={color.textMuted} /> : null}
                    </Pressable>
                  ) : null}
                </View>

                {editable ? (
                  <FormGrid>
                    <Field
                      required
                      label="Section"
                      help={first ? { surface: 'payroll.tax_declaration', field: 'section', label: 'the section' } : undefined}
                    >
                      <Select
                        title="Section"
                        options={SECTION_OPTIONS}
                        value={r.section}
                        onChange={(v) => setRow(r.key, { section: v })}
                        invalid={!!lineError && !r.section}
                      />
                    </Field>
                    <Field required label="Amount">
                      <TextField
                        kind="amount"
                        value={r.declared_amount}
                        onChangeText={(v) => setRow(r.key, { declared_amount: v.replace(/[^0-9.]/g, '') })}
                        placeholder="0"
                        invalid={!!lineError && !!r.section}
                        left={<Text style={[text.bodyStrong, { color: color.textMuted }]}>₹</Text>}
                      />
                    </Field>
                    <Field wide label="What it is">
                      <TextField
                        value={r.sub_category}
                        onChangeText={(v) => setRow(r.key, { sub_category: v })}
                        placeholder="e.g. LIC premium"
                        maxLength={120}
                      />
                    </Field>
                  </FormGrid>
                ) : (
                  <View style={{ flexDirection: 'row', gap: space[3] }}>
                    {[
                      ['Section', r.section],
                      ['Declared', formatMoney(r.declared_amount)],
                      ['Accepted', r.verified_amount != null ? formatMoney(r.verified_amount) : 'N/A'],
                    ].map(([label, value]) => (
                      <View key={label} style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={[text.label, { fontSize: 9, color: color.textMuted }]}>{label}</Text>
                        <Text numberOfLines={1} style={[text.smallStrong, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {lineError ? <FieldError>{lineError}</FieldError> : null}

                {proofsHere ? (
                  <>
                    <Field
                      wide
                      label="Proof reference"
                      help={first ? { surface: 'payroll.tax_declaration', field: 'proof_reference', label: 'the proof reference' } : undefined}
                    >
                      <TextField
                        value={r.proof_reference}
                        onChangeText={(v) => setRow(r.key, { proof_reference: v })}
                        placeholder="A link or receipt number"
                        maxLength={500}
                        autoCapitalize="none"
                      />
                    </Field>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'flex-start' }}>
                      {r.attachments.map((att) => (
                        <AttachmentChip key={att.id} attachment={att} onRemove={() => removeAttachment(r, att)} />
                      ))}
                      {(r.pending || []).map((file, i) => (
                        <AttachmentChip
                          key={`p${i}`}
                          pending
                          attachment={{ id: `p${i}`, file_name: file.name || 'Proof' }}
                          onRemove={() => setRow(r.key, { pending: r.pending.filter((_, x) => x !== i), uploadError: '' })}
                        />
                      ))}
                      {/* A saved line uploads straight away once the
                          declaration is with HR; a draft line holds the file
                          until the save gives it an id. */}
                      <AttachmentPicker
                        label={r.attachments.length || r.pending?.length ? 'Add another' : 'Add proof'}
                        onPicked={(file) => setRow(r.key, { pending: [...(r.pending || []), file], uploadError: '' })}
                      />
                    </View>
                    {r.uploadError ? <FieldError>{r.uploadError}</FieldError> : null}
                  </>
                ) : r.attachments.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                    {r.attachments.map((att) => <AttachmentChip key={att.id} attachment={att} />)}
                  </View>
                ) : null}
              </View>
            );
          })}

          {stage.editable ? (
            <Pressable
              accessibilityRole="button"
              onPress={addRow}
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
              <Text style={[text.bodyStrong, { color: color.brandChipFg }]}>Add another saving</Text>
            </Pressable>
          ) : null}

          <Text style={[text.caption, { color: color.textMuted }]}>
            Only the old tax regime counts these. Proofs can be a PDF, JPG, PNG or WebP, up to 10 MB each.
          </Text>
        </>
      )}
    </FormSheet>
  );
}

export { DeclarationFormScreen };
