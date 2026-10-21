// ─────────────────────────────────────────────────────────────────────────────
// ui/AttachmentPicker.jsx — "Add receipt" / "Add proof", and the chip a
// file becomes once it is on the record.
//
// The web has one control, a hidden <input type="file">. A phone has three
// honest ways a receipt gets in, and they are offered in this order because
// that is how often each happens:
//
//   Take a photo        — the receipt is in your hand. This is the case where
//                         the app beats the web (30-domain/06-pay.md §6).
//   Choose from photos  — you photographed it at the counter.
//   Choose a PDF        — the invoice came by email.
//
// Camera images are resized to 2000px and saved at 0.8 quality before upload:
// a 12 MP photo of a taxi receipt is 5 MB of nothing, and the 10 MB limit
// would otherwise refuse plenty of ordinary phone photos.
//
// ── NO PERMISSION PROMPT OF OUR OWN ─────────────────────────────────────────
//
// Android: the photo picker needs no permission, and the camera is launched
// as an intent — so CAMERA is deliberately NOT in AndroidManifest. Declaring
// it would make the intent require a runtime grant for no benefit.
// iOS: the two usage strings live in Info.plist.
//
// ── ONE UPLOAD AT A TIME, ERROR STAYS UNTIL THE NEXT TRY ────────────────────
//
// Same as the web's AttachmentUploadButton. A failed upload says why beside
// the button, not in a toast that fades before the person has read it — the
// thing they must fix (a bigger file, a PDF) is right here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import {
  errorCodes, isErrorWithCode, keepLocalCopy, pick, types,
} from '@react-native-documents/picker';
import { payrollAPI } from '../api/payroll.api';
import { openSignedUrl } from '../api/files';
import { fileProblem, uploadErrorMessage, uploadFile } from '../lib/attachments';
import { errorMessage } from '../lib/errors';
import { icons } from '../theme/icons';
import { color, gutter, iconSize, radius, space, text } from '../theme/tokens';
import { FieldError } from './InlineAlert';
import { OptionSheet } from './Select';
import { showToast } from './Toast';

const SOURCES = [
  { value: 'camera', label: 'Take a photo', icon: icons.camera },
  { value: 'library', label: 'Choose from photos', icon: icons.photo },
  { value: 'pdf', label: 'Choose a PDF', icon: icons.document },
];

const IMAGE_OPTIONS = {
  mediaType: 'photo',
  quality: 0.8,
  maxWidth: 2000,
  maxHeight: 2000,
  selectionLimit: 1,
  includeBase64: false,
  saveToPhotos: false,
};

/** The picked thing as `{ uri, name, type, size }`, or null when cancelled. */
const DOC_SOURCES = [
  { value: 'camera', label: 'Take a photo', icon: icons.camera },
  { value: 'library', label: 'Choose from photos', icon: icons.photo },
  { value: 'pdf', label: 'Choose a file', icon: icons.document },
];

/* ── WHAT THE TYPE ACCEPTS DECIDES WHAT IS OFFERED (2026-10-20) ────────────
   User: "places where pdf is applicable why to even give option of gallery".
   `allowedTypes` (the document type's `allowed_content_types`) now shapes the
   sheet: no camera or photos unless an image is accepted, and the file
   picker only shows files of an accepted kind. Empty means "anything the
   mode allows", which is the old behaviour. */
const PICKER_TYPE_OF = {
  'application/pdf': types.pdf,
  'application/msword': types.doc,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': types.docx,
  'application/vnd.ms-excel': types.xls,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': types.xlsx,
};

const lowerList = (list) => (Array.isArray(list) ? list.map((t) => String(t || '').toLowerCase()).filter(Boolean) : []);
const acceptsImages = (allowed) => !allowed.length || allowed.some((t) => t.startsWith('image/'));

function filePickerTypes(fileTypes, allowed) {
  const base = fileTypes === 'documents'
    ? [types.pdf, types.images, types.doc, types.docx, types.xlsx]
    : [types.pdf, types.images];
  if (!allowed.length) return base;
  const out = [];
  allowed.forEach((t) => {
    if (t.startsWith('image/')) { if (!out.includes(types.images)) out.push(types.images); }
    else if (PICKER_TYPE_OF[t] && !out.includes(PICKER_TYPE_OF[t])) out.push(PICKER_TYPE_OF[t]);
  });
  return out.length ? out.filter(Boolean) : base;
}

async function pickFrom(source, fileTypes, allowed = []) {
  if (source === 'pdf') {
    let picked;
    try {
      [picked] = await pick({ type: filePickerTypes(fileTypes, allowed) });
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return null;
      throw err;
    }
    // A `content://` uri can't be streamed by blob-util's PUT; a local copy can.
    const [copy] = await keepLocalCopy({
      files: [{ uri: picked.uri, fileName: picked.name || 'document.pdf' }],
      destination: 'cachesDirectory',
    });
    if (copy?.status !== 'success') throw new Error('That file couldn’t be read. Choose another one.');
    return { uri: copy.localUri, name: picked.name, type: picked.type, size: picked.size };
  }

  const res = source === 'camera'
    ? await launchCamera({ ...IMAGE_OPTIONS, cameraType: 'back' })
    : await launchImageLibrary(IMAGE_OPTIONS);
  if (res.didCancel) return null;
  if (res.errorCode) {
    throw new Error(res.errorCode === 'camera_unavailable'
      ? 'This phone has no camera available. Choose a photo instead.'
      : res.errorCode === 'permission'
        ? 'The app isn’t allowed to use the camera. Allow it in Settings, or choose a photo instead.'
        : res.errorMessage || 'That didn’t work. Try again.');
  }
  const a = res.assets?.[0];
  if (!a?.uri) return null;
  return { uri: a.uri, name: a.fileName || `receipt-${Date.now()}.jpg`, type: a.type, size: a.fileSize };
}

/**
 * @param {object} props
 * @param {(meta) => Promise} [props.issue]  step 1 of the handshake, bound to the record
 * @param {(attachment) => void} [props.onUploaded]
 * @param {(file) => void} [props.onPicked]  PICK-ONLY mode: hand back the checked
 *        file and upload nothing. For a record that does not exist yet — a new
 *        claim line has no id to attach to until the draft is saved, so the
 *        form holds the file and uploads it straight after the save. The web
 *        makes you save first; on a phone, with the receipt in your hand, that
 *        is one step too many.
 * @param {string} [props.label]
 * @param {boolean} [props.disabled]
 */
export function AttachmentPicker({
  issue, onUploaded, onPicked, label = 'Add receipt', disabled = false,
  // DOCUMENTS mode (My Documents' upload form): Word and Excel are allowed,
  // the limit is the document type's own, and the caller checks the file.
  validate, fileTypes = 'payroll', hint = 'PDF, JPG, PNG or WebP, up to 10 MB.',
  allowedTypes,
}) {
  const allowed = lowerList(allowedTypes);
  const images = acceptsImages(allowed);
  const onlyFiles = !images;
  const fileLabel = allowed.length && allowed.every((t) => t === 'application/pdf') ? 'Choose a PDF' : 'Choose a file';
  const sources = (fileTypes === 'documents' ? DOC_SOURCES : SOURCES)
    .filter((s) => images || s.value === 'pdf')
    .map((s) => (s.value === 'pdf' && allowed.length ? { ...s, label: fileLabel } : s));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const Upload = icons.upload;

  const run = useCallback(async (source) => {
    if (busyRef.current) return;
    setError('');
    let file;
    try {
      file = await pickFrom(source, fileTypes, allowed);
    } catch (err) {
      setError(err?.message || 'That didn’t work. Try again.');
      return;
    }
    if (!file) return;
    const problem = validate ? validate(file) : fileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    if (onPicked) {
      onPicked(file);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const attachment = await uploadFile({
        issue,
        confirm: (id) => payrollAPI.confirmMyAttachment(id),
        file,
      });
      onUploaded?.(attachment);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue, onUploaded, onPicked, validate, fileTypes, allowed.join('|')]);

  const choose = (source) => {
    setOpen(false);
    // Let the sheet finish closing first: iOS refuses to present the camera
    // from a modal that is still on its way out.
    setTimeout(() => run(source), 350);
  };

  return (
    <View style={{ gap: space[1], alignSelf: 'flex-start' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || busy, busy }}
        disabled={disabled || busy}
        // Only files accepted: there is nothing to choose between, so the
        // press opens the file picker straight away.
        onPress={() => (onlyFiles ? run('pdf') : setOpen(true))}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          minHeight: 40,
          paddingHorizontal: space[3],
          borderRadius: radius.md,
          backgroundColor: pressed ? color.brandSoftBorder : color.brandChipBg,
          opacity: disabled ? 0.5 : 1,
        })}
      >
        {busy
          ? <ActivityIndicator size="small" color={color.brandChipFg} />
          : Upload ? <Upload size={iconSize.sm} color={color.brandChipFg} /> : null}
        <Text style={[text.smallStrong, { color: color.brandChipFg }]}>{busy ? 'Uploading…' : label}</Text>
      </Pressable>
      {error ? <FieldError>{error}</FieldError> : null}

      <OptionSheet
        visible={open}
        title={label}
        onClose={() => setOpen(false)}
        data={sources}
        header={(
          <Text style={[text.caption, { paddingHorizontal: gutter, paddingTop: space[2] }]}>
            {hint}
          </Text>
        )}
        renderRow={(opt) => {
          const Icon = opt.icon;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => choose(opt.value)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                paddingHorizontal: gutter,
                paddingVertical: space[3],
                minHeight: 56,
                backgroundColor: pressed ? color.pressTint : 'transparent',
              })}
            >
              <View
                style={{
                  width: 40, height: 40, borderRadius: radius.md, alignItems: 'center',
                  justifyContent: 'center', backgroundColor: color.brandChipBg,
                }}
              >
                {Icon ? <Icon size={20} color={color.brandChipFg} /> : null}
              </View>
              <Text style={text.bodyStrong}>{opt.label}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

/** Open a payroll attachment: a fresh signed URL, then the OS viewer. */
export async function openPayrollAttachment(att) {
  try {
    const res = await payrollAPI.getMyAttachmentViewUrl(att.id);
    const data = res?.data ?? res ?? {};
    const url = data.view_url || data.url;
    if (!url) throw new Error('This file isn’t available right now.');
    await openSignedUrl(url, { filename: att.file_name || data.file_name });
  } catch (err) {
    showToast(errorMessage(err, 'payroll', 'Couldn’t open this file.'), 'error');
  }
}

/**
 * One attached file: a tap opens it, the × removes it. Not a box in a box —
 * a tinted pill, the same weight as the "Add" control beside it.
 */
export function AttachmentChip({ attachment, onRemove, pending = false }) {
  const Clip = icons.attachment;
  const Close = icons.close;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        maxWidth: '100%',
        borderRadius: radius.md,
        // A white slab with a hairline, not a surfaceSubtle fill: forms sit on
        // the lavender canvas since 2026-10-20, where that fill vanishes.
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${attachment.file_name}`}
        // A pending file is not on the server yet, so there is nothing to open.
        disabled={pending}
        onPress={() => openPayrollAttachment(attachment)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 40, paddingLeft: space[3], paddingRight: onRemove ? space[1] : space[3], flexShrink: 1 }}
      >
        {Clip ? <Clip size={14} color={color.brandChipFg} /> : null}
        <Text numberOfLines={1} style={[text.small, { color: color.textPrimary, flexShrink: 1 }]}>
          {attachment.file_name}
        </Text>
        {pending ? <Text style={[text.caption, { color: color.textMuted }]}>· not sent yet</Text> : null}
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${attachment.file_name}`}
          onPress={onRemove}
          hitSlop={8}
          style={{ width: 36, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          {Close ? <Close size={16} color={color.textMuted} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

export default AttachmentPicker;
