// ─────────────────────────────────────────────────────────────────────────────
// features/profile/avatarUpload.js — putting a new profile photo on your account.
//
// PORTED from the web's shared/organization/avatarUpload.js (CLAUDE.md §10):
// same names, same three-step contract, same messages per failed step.
//
//   1. POST /organizations/me/avatar/upload-url  → { upload_url, storage_key_token, required_headers }
//   2. PUT the bytes straight to storage          (no Authorization header)
//   3. POST /organizations/me/avatar/confirm      → the updated profile
//
// Traps, from the web header:
// • `storage_key_token` is opaque and lives ten minutes. Held in memory only
//   and sent back verbatim; after a failure the person picks again, which
//   starts a fresh handshake.
// • The PUT must echo the Content-Type declared in step one, or storage
//   rejects the signature with a 403 that says nothing about types.
// • Confirm is idempotent, so a retry after a network blip is safe.
//
// ── WHAT IS DIFFERENT FROM THE WEB, AND WHY ─────────────────────────────────
//
// The web crops in a canvas (cropAvatar). There is no canvas here and no crop
// library in package.json, so the picker does the shrinking instead —
// `maxWidth/maxHeight: 512` and JPEG at 0.9 (PICK_OPTIONS) — which is what the
// web's crop was mostly FOR: a 3–8 MB phone photo becomes ~60–300 KB and the
// 5 MB limit is practically never hit. The framing is not chosen by hand; the
// Avatar draws the picture as a centred circle (`cover`), which suits a face.
// ─────────────────────────────────────────────────────────────────────────────

import { organizationAPI } from '../../api';
import { uploadToPresignedUrl } from '../../api/files';
import { errorMessage } from '../../lib/errors';

export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_OUTPUT_PX = 512;

/* For react-native-image-picker: the shrink the web does in a canvas. */
export const PICK_OPTIONS = {
  mediaType: 'photo',
  quality: 0.9,
  maxWidth: AVATAR_OUTPUT_PX,
  maxHeight: AVATAR_OUTPUT_PX,
  selectionLimit: 1,
  includeBase64: false,
  saveToPhotos: false,
};

/**
 * True for a photo the person uploaded themselves: served as a presigned
 * storage link (~5 minutes) on every read. Never write one back anywhere.
 */
export function isUploadedPhotoUrl(url) {
  return typeof url === 'string' && /[?&]X-Amz-(Signature|Credential)=/i.test(url);
}

/** A message if this picture can't be used, else null. Checked before anything is uploaded. */
export function avatarFileProblem(file) {
  if (!file) return 'Choose a picture first.';
  const type = String(file.type || '').toLowerCase();
  if (!AVATAR_TYPES.includes(type)) return 'That file isn’t a picture we can use. Choose a PNG, JPG or WebP image.';
  if (file.size === 0) return 'That file is empty. Choose another picture.';
  if (file.size > AVATAR_MAX_BYTES) return 'That picture is too large. Choose one under 5 MB.';
  return null;
}

export class AvatarUploadError extends Error {
  /** @param {"issue"|"put"|"confirm"} stage */
  constructor(stage, cause) {
    super(cause?.message || 'Couldn’t save the photo.');
    this.name = 'AvatarUploadError';
    this.stage = stage;
    this.cause = cause;
  }
}

/** A message that says what to do next, by the step that failed. */
export function avatarUploadMessage(err) {
  if (err instanceof AvatarUploadError) {
    if (err.stage === 'put') return 'The picture couldn’t be sent to secure storage. Check your connection and try again.';
    if (err.stage === 'confirm') return errorMessage(err.cause, 'organization', 'The picture was sent but couldn’t be saved. Try again.');
    return errorMessage(err.cause, 'organization', 'Couldn’t start the upload. Try again.');
  }
  return errorMessage(err, 'organization', 'Couldn’t save the photo. Try again.');
}

/**
 * The whole handshake for one (already shrunk) picture.
 * @param {{ uri: string, type: string, size: number, name?: string }} file  a local file
 * @param {(stage: "issue"|"put"|"confirm") => void} [onStage]
 * @returns {Promise<object|null>} the updated profile (same shape as GET /organizations/me)
 */
export async function uploadAvatar(file, onStage) {
  const content_type = String(file.type).toLowerCase();
  if (file.size > AVATAR_MAX_BYTES) {
    throw new AvatarUploadError('issue', { data: { errorCode: 'FILE_TOO_LARGE' }, status: 413 });
  }

  onStage?.('issue');
  let issued;
  try {
    const res = await organizationAPI.requestAvatarUpload({
      content_type,
      size_bytes: file.size,
      file_name: String(file.name || 'photo').slice(0, 200),
    });
    issued = res?.data ?? res;
  } catch (err) {
    throw new AvatarUploadError('issue', err);
  }
  if (!issued?.upload_url || !issued?.storage_key_token) {
    throw new AvatarUploadError('issue', new Error('Storage didn’t return an upload link.'));
  }

  onStage?.('put');
  try {
    await uploadToPresignedUrl(issued.upload_url, file.uri, content_type, issued.required_headers);
  } catch (err) {
    throw new AvatarUploadError('put', err);
  }

  onStage?.('confirm');
  try {
    const res = await organizationAPI.confirmAvatarUpload({ storage_key_token: issued.storage_key_token });
    return res?.data ?? null;
  } catch (err) {
    throw new AvatarUploadError('confirm', err);
  }
}
