// ─────────────────────────────────────────────────────────────────────────────
// features/documents/screens/UploadDocumentScreen.jsx — "Upload a document".
// The `UploadDocument` modal route of DocsTab.
//
// Web ancestor: shared/documents/DocumentUploadDialog.jsx (self plane). Same
// fields, same checks, same sentences, same three-step handshake
// (docMeta.uploadDocument):
//
//   1. issue    POST /me/documents  — or /:id/replace for a new version
//   2. PUT      the bytes straight to storage (no token)
//   3. confirm  POST /me/documents/:id/confirm   ← the document exists NOW
//
//   params: { typeId? }            preset the kind (from a checklist / request /
//                                  "What I can add" card) and lock it
//           { replaceId? }         a new VERSION of that document
//           { title?, askedFor? }  what was asked for, kept in view
//
// ── CAMERA FIRST ────────────────────────────────────────────────────────────
//
// Most documents on a phone are photographed on the spot (06-documents.md),
// so the picker offers Take a photo · Choose from photos · Choose a file —
// and photos are resized before they ever leave the phone.
//
// ── A FAILED UPLOAD IS NOT A DOCUMENT ───────────────────────────────────────
//
// A failure at step 2 or 3 leaves a draft (`pending_upload`). The form LOCKS
// to it: "Try again" resends to the same link instead of opening a second
// draft, "Start over" discards it. Success is reported only after step 3.
//
// ── TWO ⓘ, BOTH SHIPPED ─────────────────────────────────────────────────────
//
// `documents.upload` → `document_number` and `is_confidential`. Confidential
// is ONE-WAY (it can't be made visible again), so turning it on asks first.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { documentsAPI } from '../../../api';
import { useFormFocus } from '../../../hooks/useFormFocus';
import { fmtDate, todayYMD } from '../../../lib/dates';
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from '../../../lib/events';
import { revealer } from '../../../lib/formGuard';
import { color, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import {
  AttachmentChip, AttachmentPicker, Button, DateField, Field, FieldError, FormGrid, FormSheet, InlineAlert,
  Select, SkeletonBlock, TextField, Toggle, showToast, useConfirm,
} from '../../../ui';
import {
  DocumentUploadError, arrayPayload, documentUploadMessage, fileProblem, formatBytes, formatList, groupLabel,
  typePolicyLine, uploadDocument,
} from '../docMeta';

const STAGE_LABEL = {
  issue: 'Preparing a secure upload link…',
  put: 'Sending the file to encrypted storage…',
  confirm: 'Checking the file arrived intact…',
};

const byOrder = (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.name).localeCompare(String(b.name));

export default function UploadDocumentScreen({ navigation, route }) {
  const scroller = useRef(null);
  const focus = useFormFocus(scroller);
  const confirmDialog = useConfirm();
  const { typeId: presetTypeId = '', replaceId = '', title: presetTitle = '', askedFor = null } = route?.params || {};
  const replacing = !!replaceId;

  const [types, setTypes] = useState({ rows: [], loading: true, error: null });
  const [predecessor, setPredecessor] = useState(null);
  const [form, setForm] = useState({
    document_type_id: presetTypeId,
    title: presetTitle,
    document_number: '',
    issued_on: '',
    expires_on: '',
    is_confidential: false,
  });
  const [file, setFile] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [stage, setStage] = useState(null);
  const [failure, setFailure] = useState('');
  const [draft, setDraft] = useState(null);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    documentsAPI.getMyUploadTypes()
      .then((res) => setTypes({ rows: arrayPayload(res).sort(byOrder), loading: false, error: null }))
      .catch((error) => setTypes({ rows: [], loading: false, error }));
  }, []);

  useEffect(() => {
    if (!replaceId) return;
    documentsAPI.getMyDocument(replaceId)
      .then((res) => {
        const d = res?.data ?? res;
        setPredecessor(d);
        setForm((f) => ({ ...f, document_type_id: d.document_type_id, title: d.title || f.title, is_confidential: !!d.is_confidential }));
      })
      .catch(() => setFailure('We couldn’t load the document you’re replacing. Close this and try again.'));
  }, [replaceId]);

  const type = useMemo(() => types.rows.find((t) => t.id === form.document_type_id) || null, [types.rows, form.document_type_id]);
  const typeLocked = replacing || (!!presetTypeId && types.rows.some((t) => t.id === presetTypeId));
  const confidentialForced = !!type?.is_confidential || (replacing && !!predecessor?.is_confidential);
  const busy = (!!stage && stage !== 'done') || discarding;
  const locked = busy || !!draft;

  const set = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFailure('');
  }, []);

  /* The web's checks, field for field. */
  const today = todayYMD();
  const title = form.title.trim();
  const problems = useMemo(() => {
    const p = {};
    if (!form.document_type_id) p.document_type_id = 'Choose what kind of document this is.';
    if (title.length < 3) p.title = 'Give the document a title (at least 3 characters).';
    else if (title.length > 200) p.title = 'Keep the title under 200 characters.';
    if (form.document_number.trim().length > 100) p.document_number = 'Keep the document number under 100 characters.';
    if (form.issued_on && form.issued_on > today) p.issued_on = 'The issue date can’t be in the future.';
    if (type?.has_expiry && !form.expires_on) p.expires_on = 'This kind of document runs out — add the date it expires.';
    else if (form.issued_on && form.expires_on && form.expires_on <= form.issued_on) p.expires_on = 'The expiry date must be after the issue date.';
    const fp = fileProblem(file, { allowed: type?.allowed_content_types, maxBytes: type?.max_file_size_bytes });
    if (fp) p.file = fp;
    return p;
  }, [form, title, today, type, file]);
  const show = revealer(attempted);

  const typeOptions = useMemo(() => types.rows.map((t) => ({
    value: t.id,
    label: t.name,
    caption: [groupLabel(t.group), typePolicyLine(t)].filter(Boolean).join(' · ') || null,
  })), [types.rows]);

  const toggleConfidential = async (v) => {
    if (!v) { set('is_confidential', false); return; }
    const ok = await confirmDialog({
      title: 'Keep this private from your manager?',
      message: 'Only you and HR will be able to see it. This can’t be undone — a private document can’t be made visible again.',
      confirmText: 'Keep it private',
    });
    if (ok) set('is_confidential', true);
  };

  const close = useCallback(() => {
    if (!busy) navigation.goBack();
  }, [busy, navigation]);

  const submit = useCallback(async () => {
    if (busy) return;
    setAttempted(true);
    if (focus.focusFirstProblem(problems)) return;
    setFailure('');
    const meta = {
      document_type_id: form.document_type_id,
      title,
      issued_on: form.issued_on || null,
      expires_on: form.expires_on || null,
      document_number: form.document_number.trim() || null,
      is_confidential: confidentialForced || form.is_confidential,
    };
    try {
      const doc = await uploadDocument({
        issue: (payload) => (replacing ? documentsAPI.myReplaceDocument(replaceId, payload) : documentsAPI.myIssueUpload(payload)),
        confirm: (id) => documentsAPI.myConfirmUpload(id),
        file,
        meta,
        onStage: setStage,
        resume: draft,
      });
      setStage('done');
      emitAttendanceChanged(ATTENDANCE_EVENTS.DOCUMENT, { action: replacing ? 'replace' : 'upload' });
      emitAttendanceChanged(ATTENDANCE_EVENTS.DOCUMENT_REQUEST, { action: 'upload' });
      const base = doc?.status === 'pending_verification' ? 'Uploaded — HR reviews it next.' : 'Uploaded and active.';
      showToast(doc?.fulfilled_request_id ? `${base} That also closes what was asked of you.` : base, 'success');
      navigation.goBack();
    } catch (err) {
      setStage(null);
      if (err instanceof DocumentUploadError && err.issued) setDraft(err.issued);
      setFailure(documentUploadMessage(err));
      scroller.current?.scrollTo?.({ y: 0, animated: true });
    }
  }, [busy, focus, problems, form, title, confidentialForced, replacing, replaceId, file, draft, navigation]);

  const startOver = async () => {
    if (!draft || busy) return;
    setDiscarding(true);
    try {
      await documentsAPI.myDeleteDocument(draft.document_id);
    } catch {
      // The server reaps an unfinished draft on its own; carry on regardless.
    }
    emitAttendanceChanged(ATTENDANCE_EVENTS.DOCUMENT, { action: 'discard' });
    setDraft(null);
    setFailure('');
    setDiscarding(false);
  };

  const loading = types.loading || (replacing && !predecessor && !failure);
  const noTypes = !types.loading && types.rows.length === 0;

  return (
    <FormSheet
      title={replacing ? 'Upload a new version' : 'Upload a document'}
      subtitle={replacing
        ? 'The current version stays in force until this one is checked in.'
        : 'Kept in encrypted storage. HR checks it if your company asks for that.'}
      onClose={close}
      scrollRef={scroller}
      footer={noTypes ? (
        <View style={{ flex: 1 }}><Button title="Close" variant="outline" onPress={close} fullWidth /></View>
      ) : draft ? (
        <>
          <View style={{ flex: 1 }}>
            <Button title="Start over" variant="outline" onPress={startOver} loading={discarding} disabled={busy} fullWidth />
          </View>
          <View style={{ flex: 1.3 }}>
            <Button title="Try again" icon={icons.refresh} onPress={submit} loading={busy && !discarding} fullWidth />
          </View>
        </>
      ) : (
        <>
          <View style={{ flex: 1 }}>
            <Button title="Cancel" variant="outline" onPress={close} disabled={busy} fullWidth />
          </View>
          <View style={{ flex: 1.3 }}>
            <Button title={replacing ? 'Upload version' : 'Upload'} icon={icons.upload} onPress={submit} loading={busy} disabled={busy} fullWidth />
          </View>
        </>
      )}
    >
      {askedFor ? (
        <InlineAlert tone="blue">
          {[`Asked for${askedFor.dueOn ? ` by ${fmtDate(askedFor.dueOn)}` : ''}.`, askedFor.note || null].filter(Boolean).join(' ')}
        </InlineAlert>
      ) : null}
      {failure ? <InlineAlert tone="rose">{failure}</InlineAlert> : null}
      {draft ? (
        <Text style={text.small}>
          The details are locked to the upload that didn’t finish. Try again to resend the same file, or start over to change something.
        </Text>
      ) : null}
      {stage && stage !== 'done' ? <Text style={[text.smallStrong, { color: color.brandChipFg }]}>{STAGE_LABEL[stage]}</Text> : null}

      {loading ? (
        <View style={{ gap: space[3] }}>
          {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={64} />)}
        </View>
      ) : noTypes ? (
        <InlineAlert tone="blue">
          There’s nothing you can upload yourself yet. HR can still add documents to your file for you.
        </InlineAlert>
      ) : (
        <FormGrid>
          <Field wide required label="What kind of document" error={show(problems.document_type_id)} register={focus.register('document_type_id')}>
            <Select
              title="What kind of document"
              options={typeOptions}
              value={form.document_type_id}
              onChange={(v) => { set('document_type_id', v); setFile(null); }}
              disabled={typeLocked || locked}
              placeholder="Choose one"
            />
          </Field>

          <Field wide required label="Title" error={show(problems.title)} register={focus.register('title')}>
            <TextField
              value={form.title}
              onChangeText={(v) => set('title', v)}
              placeholder={type ? `e.g. ${type.name}` : 'e.g. Passport'}
              maxLength={200}
              editable={!locked}
            />
          </Field>

          <Field
            wide
            label="Number on the document"
            help={{ surface: 'documents.upload', field: 'document_number' }}
            error={show(problems.document_number)}
            hint="Only the last four digits are ever shown."
            register={focus.register('document_number')}
          >
            <TextField
              kind="code"
              value={form.document_number}
              onChangeText={(v) => set('document_number', v)}
              placeholder="Optional"
              maxLength={100}
              editable={!locked}
            />
          </Field>

          <Field label="Issued on" error={show(problems.issued_on)} register={focus.register('issued_on')}>
            <DateField value={form.issued_on} onChange={(v) => set('issued_on', v)} max={today} placeholder="Optional" disabled={locked} />
          </Field>

          <Field
            required={!!type?.has_expiry}
            label="Expires on"
            error={show(problems.expires_on)}
            register={focus.register('expires_on')}
          >
            <DateField value={form.expires_on} onChange={(v) => set('expires_on', v)} placeholder={type?.has_expiry ? 'Pick a date' : 'Optional'} disabled={locked} />
          </Field>

          <View style={{ width: '100%' }}>
            <Toggle
              label="Keep this private from my manager"
              caption={confidentialForced
                ? 'This kind of document is always private — only you and HR see it.'
                : 'Only you and HR will see it. Can’t be undone.'}
              value={confidentialForced || form.is_confidential}
              onValueChange={toggleConfidential}
              disabled={confidentialForced || locked}
            />
          </View>

          <View style={{ width: '100%', gap: space[2] }} onLayout={focus.register('file').onLayout}>
            <Text style={text.label}>
              The file
              <Text style={{ color: color.danger.fg }}> *</Text>
            </Text>
            {file ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                <AttachmentChip
                  pending
                  attachment={{ id: 'f', file_name: `${file.name || 'File'} · ${formatBytes(file.size)}` }}
                  onRemove={locked ? undefined : () => setFile(null)}
                />
              </View>
            ) : null}
            {!locked ? (
              <AttachmentPicker
                label={file ? 'Choose a different file' : 'Add the file'}
                fileTypes="documents"
                allowedTypes={type?.allowed_content_types}
                hint={type ? typePolicyLine(type) || `${formatList(type.allowed_content_types || [])}` : 'PDF, photo, Word or Excel, up to 25 MB.'}
                validate={(f) => fileProblem(f, { allowed: type?.allowed_content_types, maxBytes: type?.max_file_size_bytes })}
                onPicked={(f) => { setFile(f); setFailure(''); }}
              />
            ) : null}
            {show(problems.file) ? <FieldError>{problems.file}</FieldError> : null}
          </View>
        </FormGrid>
      )}

      {type ? (
        <Text style={[text.caption, { color: color.textMuted }]}>
          {type.requires_verification ? 'HR reviews this before it counts.' : 'Active as soon as it arrives.'}
          {type.allows_multiple ? '' : ' You keep one of these at a time — a new one replaces the old.'}
        </Text>
      ) : null}
    </FormSheet>
  );
}

export { UploadDocumentScreen };
