// ─────────────────────────────────────────────────────────────────────────────
// features/tasks/taskUpload.js — the phone → S3 → confirm handshake for task
// files (#268–#270), and opening one back.
//
// PORTED from the web's src/shared/tasks/taskUpload.js (CLAUDE.md §10), kept to
// the ONE mode an employee needs: Mode B, where the task already exists. The web
// file also has Mode A (staging a file before the task is created) for the
// assign form — an employee never creates a task, so that half is absent.
//
// Mode B: upload-url WITH `task_id` → PUT straight to the signed URL → #269
// confirm → an attachment row with an id, which is what `attachment_ids` on a
// submission or a comment takes. Skip the confirm and the file sits in storage
// but not on the task, which looks to everybody like the upload did nothing.
//
// Tasks accept two file types payroll receipts don't — Word and Excel — so the
// type list is its own, not lib/attachments' (that one is receipts/proofs).
// The 10 MB cap is the server's (CHK_TASK_ATTACHMENTS_SIZE).
// ─────────────────────────────────────────────────────────────────────────────

import { tasksAPI } from '../../api';
import { uploadToPresignedUrl, openSignedUrl } from '../../api/files';
import { trimFileName } from '../../lib/attachments';
import { taskErrorMessage } from '../../lib/errors/taskErrors';

export const TASK_MAX_BYTES = 10 * 1024 * 1024;

export const TASK_ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const EXT_TO_TYPE = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const extOf = (name) => {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
};

/**
 * The content type to declare. A phone hands us an empty `type` for .docx often
 * enough that the extension has to be able to decide on its own.
 */
export function taskContentType(file) {
  const byExt = EXT_TO_TYPE[extOf(file?.name)];
  if (byExt) return byExt;
  if (file?.type && TASK_ALLOWED_TYPES.includes(file.type)) return file.type;
  return file?.type || '';
}

/** Why this file can't be sent, or "" when it's fine. Checked before any request. */
export function taskFileProblem(file) {
  if (!file) return 'Choose a file.';
  if (!file.size) return 'That file is empty. Choose another one.';
  if (file.size > TASK_MAX_BYTES) return 'That file is larger than 10 MB. Choose a smaller one.';
  if (!TASK_ALLOWED_TYPES.includes(taskContentType(file))) {
    return 'Use a PDF, Word, Excel, JPG, PNG or WebP file.';
  }
  return '';
}

/** Which stage of the handshake failed, so the message can say something useful. */
export class TaskUploadError extends Error {
  constructor(stage, cause) {
    super(cause?.message || 'Couldn’t upload the file.');
    this.name = 'TaskUploadError';
    this.stage = stage; // 'issue' | 'put' | 'confirm'
    this.cause = cause;
  }
}

export function taskUploadErrorMessage(err) {
  if (err instanceof TaskUploadError) {
    if (err.stage === 'put') return 'Couldn’t send the file to storage. Try again.';
    return taskErrorMessage(err.cause, 'Couldn’t upload the file. Try again.');
  }
  return taskErrorMessage(err, 'Couldn’t upload the file. Try again.');
}

/**
 * Upload one file against an existing task (Mode B), end to end.
 *
 * @param {{ file: {uri,name,type,size}, taskId: string, context?: 'submission'|'comment' }} opts
 * @returns {Promise<{ id, file_name, file_size_bytes, content_type }>} the saved row
 */
export async function uploadTaskFile({ file, taskId, context = 'submission' }) {
  const content_type = taskContentType(file);
  const file_name = trimFileName(file.name);

  let issued;
  try {
    const res = await tasksAPI.getTaskUploadUrl({
      file_name,
      content_type,
      file_size_bytes: file.size,
      attachment_context: context,
      task_id: taskId,
    });
    issued = res?.data ?? res;
  } catch (err) {
    throw new TaskUploadError('issue', err);
  }

  const uploadUrl = issued?.upload_url;
  const token = issued?.attachment_token;
  if (!uploadUrl || !token) {
    throw new TaskUploadError('issue', new Error('Storage didn’t return an upload link.'));
  }

  try {
    await uploadToPresignedUrl(uploadUrl, file.uri, content_type, issued?.required_headers);
  } catch (err) {
    throw new TaskUploadError('put', err);
  }

  try {
    const res = await tasksAPI.confirmTaskAttachment(token);
    const body = res?.data ?? res ?? {};
    const attachment = body.attachment ?? body;
    return {
      id: attachment?.id,
      file_name: attachment?.file_name || file_name,
      file_size_bytes: attachment?.file_size_bytes ?? file.size,
      content_type: attachment?.content_type || content_type,
    };
  } catch (err) {
    throw new TaskUploadError('confirm', err);
  }
}

/**
 * Open one attachment through a fresh presigned link (#270). Never cache the
 * URL — it dies after 15 minutes. The link carries `Content-Disposition:
 * attachment`, so the OS saves/opens it; there is no in-app preview.
 */
export async function openTaskAttachment(attachmentId, filename) {
  const res = await tasksAPI.getTaskAttachmentDownloadUrl(attachmentId);
  const data = res?.data ?? res ?? {};
  const url = data.download_url || data.url || '';
  if (!url) throw new Error('Storage didn’t return a link for that file.');
  await openSignedUrl(url, { filename: filename || data.file_name });
  return data;
}
