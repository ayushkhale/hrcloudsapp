// ─────────────────────────────────────────────────────────────────────────────
// lib/attachments.js — the phone → storage → confirm handshake, and the
// file-type rules for payroll documents (claim receipts, tax proofs).
//
// PORTED from the web's `src/shared/utils/payrollAttachments.js` (CLAUDE.md
// §10). Same names, same limits, same sentences — the web and the app must
// refuse the same file with the same words. Change one, change both.
//
// The handshake is three calls, and missing the third is the classic bug:
//
//   1. issue()     POST …/attachments { file_name, content_type, size_bytes }
//                  → { attachment_id, upload_url, required_headers }
//   2. PUT         straight to the signed URL — NO token, exact Content-Type
//                  (api/files.js uploadToPresignedUrl)
//   3. confirm()   POST /payroll/me/attachments/:id/confirm
//
// Skip step 3 and the file sits in storage but not on the record, which looks
// to everybody like the upload silently did nothing.
//
// ── WHAT IS NATIVE-ONLY ─────────────────────────────────────────────────────
//
// The web reads a browser `File`. Here a picked file is a plain object,
// `{ uri, name, type, size }`, from `ui/AttachmentPicker`. `fileProblem` and
// `contentTypeOf` read the same four facts from either, so the rules are not
// duplicated — only the shape of the input differs.
// ─────────────────────────────────────────────────────────────────────────────

import { uploadToPresignedUrl } from '../api/files';
import { errorMessage } from './errors';

export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const EXT_TO_TYPE = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

/** The content type of a file: its own `type`, else inferred from the extension, else "". */
export function contentTypeOf(file) {
  if (file?.type && EXT_TO_TYPE[extOf(file.name)] === file.type) return file.type;
  if (file?.type && ALLOWED_TYPES.includes(file.type)) return file.type;
  const byExt = EXT_TO_TYPE[extOf(file?.name)];
  return byExt || file?.type || '';
}

/** File name cut to 255 characters, keeping the extension. */
export function trimFileName(name) {
  const value = String(name || 'file');
  if (value.length <= 255) return value;
  const ext = extOf(value);
  const dot = ext ? `.${ext}` : '';
  return value.slice(0, 255 - dot.length) + dot;
}

/**
 * A plain problem message for a chosen file, or "" when it is fine. Checked
 * before any request, so an over-size or wrong-type file never leaves the phone.
 */
export function fileProblem(file, types = ALLOWED_TYPES) {
  if (!file) return 'Choose a file.';
  if (!file.size) return 'That file is empty. Choose another one.';
  if (file.size > MAX_BYTES) return 'That file is larger than 10 MB. Choose a smaller file.';
  if (!types.includes(contentTypeOf(file))) return 'Use a PDF, JPG, PNG or WebP file.';
  return '';
}

/** Typed error carrying which stage of the upload failed. */
export class UploadError extends Error {
  constructor(stage, cause) {
    super(cause?.message || 'Couldn’t upload the file.');
    this.name = 'UploadError';
    this.stage = stage; // 'issue' | 'put' | 'confirm'
    this.cause = cause;
  }
}

/** A readable message for an UploadError (or any error). */
export function uploadErrorMessage(err) {
  if (err instanceof UploadError) {
    if (err.stage === 'put') return 'Couldn’t send the file to storage. Try again.';
    return errorMessage(err.cause, 'payroll', 'Couldn’t upload the file. Try again.');
  }
  return errorMessage(err, 'payroll', 'Couldn’t upload the file. Try again.');
}

/**
 * The full handshake for one file.
 * @param {{ issue: Function, confirm: Function, file: {uri, name, type, size} }} opts
 * @returns {Promise<object>} the confirmed attachment
 */
export async function uploadFile({ issue, confirm, file }) {
  const content_type = contentTypeOf(file);
  const file_name = trimFileName(file.name);

  let issued;
  try {
    const res = await issue({ file_name, content_type, size_bytes: file.size });
    issued = res?.data ?? res;
  } catch (err) {
    throw new UploadError('issue', err);
  }
  const attachmentId = issued?.attachment_id ?? issued?.id;
  const uploadUrl = issued?.upload_url;
  if (!attachmentId || !uploadUrl) {
    throw new UploadError('issue', new Error('Storage didn’t return an upload link.'));
  }

  try {
    await uploadToPresignedUrl(uploadUrl, file.uri, content_type, issued?.required_headers);
  } catch (err) {
    throw new UploadError('put', err);
  }

  try {
    const res = await confirm(attachmentId);
    const confirmed = res?.data ?? res;
    // The confirm answer is sometimes just `{ status }`. Keep what we know so
    // the chip can name the file straight away.
    return { id: attachmentId, file_name, content_type, ...(confirmed && typeof confirmed === 'object' ? confirmed : {}) };
  } catch (err) {
    throw new UploadError('confirm', err);
  }
}

/**
 * Attachments arrive in more than one shape — `{ id }`, `{ attachment_id }`,
 * sometimes nested under `attachment`. One reader, so a chip never shows
 * "file" for a receipt that has a name.
 */
export function normalizeAttachment(att) {
  if (!att) return null;
  const a = att.attachment && typeof att.attachment === 'object' ? { ...att, ...att.attachment } : att;
  const id = a.id ?? a.attachment_id;
  if (!id) return null;
  return {
    ...a,
    id,
    file_name: a.file_name || a.name || 'File',
    content_type: a.content_type || a.mime_type || '',
  };
}

/** An external reference (a TRACES link), not a stored file. */
export const isReferenceAttachment = (att) => att?.storage_backend === 'reference' || !!att?.reference_url;
export const isImageType = (contentType) => /^image\//.test(String(contentType || ''));
export const isPdfType = (contentType) => String(contentType || '').toLowerCase() === 'application/pdf';
