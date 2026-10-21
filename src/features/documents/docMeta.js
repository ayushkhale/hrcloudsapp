// ─────────────────────────────────────────────────────────────────────────────
// features/documents/docMeta.js — the rules My Documents shares.
//
// PORTED, NOT INVENTED (CLAUDE.md §10). Every function keeps its web name:
//
//   displayStatus, daysToExpiry, groupLabel, typePolicyLine, listPayload,
//   fileProblem, formatBytes, contentTypeLabel, canReplace, selfDeleteRule
//                                    ← shared/documents/documentMeta.js
//   orgDisplayStatus, documentTypeName ← shared/documents/orgDocumentMeta.js
//   ackBlockOf, nextActionOf, actionWindow, myComplianceState, hasEvidence,
//   obligationLabel, dueLabel, asksForSomething
//                                    ← shared/documents/complianceMeta.js
//   requestDisplayStatus, requestTypeOf, requestListOf, checklistOf,
//   requestFilterQuery               ← shared/documents/requestMeta.js
//   portfolioOf                      ← shared/documents/portfolioMeta.js
//   uploadDocument                   ← shared/documents/documentUpload.js
//
// Status LABELS and tones are not here — they are in lib/enums.js
// (`document`, `compliance`, `recipient`, `docRequest`, `checklist`), read by
// <StatusBadge kind=… />. A second registry is how badges start to disagree.
// ─────────────────────────────────────────────────────────────────────────────

import { uploadToPresignedUrl } from '../../api/files';
import { todayYMD } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { humanize } from '../../lib/enums';

/* ─── Shapes ──────────────────────────────────────────────────────────────── */

/** `{ total, rows }` from a list response, tolerating a bare array. */
export function listPayload(res) {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return { rows: data, total: data.length };
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return { rows, total: Number.isFinite(Number(data?.total)) ? Number(data.total) : rows.length };
}
export const requestListOf = listPayload;

/** An array out of a response whose `data` is an array. */
export const arrayPayload = (res) => {
  const data = res?.data ?? res;
  return Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
};

/** The link out of a signed-URL reply — the endpoints disagree on the key. */
export const signedUrlOf = (res) => {
  const data = res?.data ?? res ?? {};
  return data.view_url || data.url || data.download_url || '';
};

/* ─── My own documents ────────────────────────────────────────────────────── */

export const EXPIRING_SOON_DAYS = 30;

const daysBetween = (fromYmd, toYmd) =>
  Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86400000);

/** Days until `expires_on` (negative once past), or null when there is no expiry. */
export function daysToExpiry(doc, today = todayYMD()) {
  const exp = String(doc?.expires_on || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return null;
  return daysBetween(today, exp);
}

/** The status to show: the server's `display_status`, plus `expiring_soon`. */
export function displayStatus(doc, today = todayYMD()) {
  const base = doc?.display_status || doc?.status;
  if (base === 'available') {
    const days = daysToExpiry(doc, today);
    if (days !== null && days < 0) return 'expired';
    if (days !== null && days <= EXPIRING_SOON_DAYS) return 'expiring_soon';
  }
  return base;
}

/** Statuses that count as "the one I have" for a type. */
export const LIVE_STATUSES = ['pending_verification', 'available', 'expired', 'expiring_soon'];

const GROUP_LABEL = {
  identity: 'Identity',
  education: 'Education',
  employment_history: 'Employment history',
  financial: 'Financial',
  medical: 'Medical',
  background_check: 'Background check',
  onboarding: 'Onboarding',
  policy: 'Policy',
  disciplinary: 'Disciplinary',
  exit: 'Exit',
};
export const groupLabel = (group) => GROUP_LABEL[group] || humanize(group) || 'Document';

/** The module's allow-list (web D-7). SVG/HTML/XML are excluded for good. */
export const CONTENT_TYPES = [
  { value: 'application/pdf', label: 'PDF', ext: ['pdf'] },
  { value: 'image/jpeg', label: 'JPEG', ext: ['jpg', 'jpeg'] },
  { value: 'image/png', label: 'PNG', ext: ['png'] },
  { value: 'image/webp', label: 'WebP', ext: ['webp'] },
  { value: 'application/msword', label: 'Word', ext: ['doc'] },
  { value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word', ext: ['docx'] },
  { value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel', ext: ['xlsx'] },
];
export const ALL_CONTENT_TYPES = CONTENT_TYPES.map((c) => c.value);
const CT_BY_VALUE = Object.fromEntries(CONTENT_TYPES.map((c) => [c.value, c]));
const CT_BY_EXT = Object.fromEntries(CONTENT_TYPES.flatMap((c) => c.ext.map((e) => [e, c.value])));

export const contentTypeLabel = (ct) =>
  CT_BY_VALUE[ct]?.label || (ct ? String(ct).split('/').pop().toUpperCase() : 'N/A');

/** "PDF, JPEG or PNG" */
export function formatList(types = []) {
  const labels = [...new Set(types.map(contentTypeLabel))];
  if (labels.length <= 1) return labels[0] || 'N/A';
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}

const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(String(name || '')) || [])[1]?.toLowerCase() || '';
export function contentTypeOfFile(file) {
  if (file?.type && CT_BY_VALUE[file.type]) return file.type;
  return CT_BY_EXT[extOf(file?.name)] || file?.type || '';
}

export const HARD_MAX_BYTES = 25 * 1024 * 1024;

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return 'N/A';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/** Why this file can't go into this type, or "" — checked before any request. */
export function fileProblem(file, { allowed = ALL_CONTENT_TYPES, maxBytes = HARD_MAX_BYTES } = {}) {
  if (!file) return 'Choose a file.';
  if (!file.size) return 'That file is empty. Choose another one.';
  const limit = Math.min(maxBytes || HARD_MAX_BYTES, HARD_MAX_BYTES);
  if (file.size > limit) return `This file is ${formatBytes(file.size)}; the limit is ${formatBytes(limit)}. Choose a smaller file.`;
  const type = contentTypeOfFile(file);
  const usable = (allowed?.length ? allowed : ALL_CONTENT_TYPES).filter((t) => ALL_CONTENT_TYPES.includes(t));
  if (!usable.includes(type)) return `This format isn’t allowed here. Use ${formatList(usable)}.`;
  return '';
}

export function trimFileName(name) {
  const value = String(name || 'file');
  if (value.length <= 255) return value;
  const ext = extOf(value);
  const dot = ext ? `.${ext}` : '';
  return value.slice(0, 255 - dot.length) + dot;
}

export const isReferenceDoc = (doc) => doc?.storage_backend === 'reference';
/** Replace from available or expired only; a link can't be replaced by a file. */
export const canReplace = (doc) => ['available', 'expired'].includes(doc?.status) && !isReferenceDoc(doc);
export const canOpenFile = (doc) => !!doc && !['pending_upload', 'deleted'].includes(doc.status);

/** Self-service delete (R-29, R-30). The server has the final word. */
export function selfDeleteRule(doc) {
  if (['pending_upload', 'pending_verification'].includes(doc?.status)) return { allowed: true, note: '' };
  if (doc?.status === 'available') {
    return { allowed: true, note: 'A verified document can only be deleted if your company allows it. Statutory ones (PAN, Aadhaar…) are always kept.' };
  }
  return { allowed: false, note: 'Only HR can delete this document.' };
}

/** "Up to 10 MB · PDF, JPEG or PNG" */
export function typePolicyLine(type) {
  if (!type) return '';
  const parts = [];
  if (type.max_file_size_bytes) parts.push(`Up to ${formatBytes(type.max_file_size_bytes)}`);
  if (type.allowed_content_types?.length) parts.push(formatList(type.allowed_content_types));
  return parts.join(' · ');
}

const SOURCE_LABEL = {
  self_upload: 'You',
  hr_upload: 'HR',
  manager_upload: 'Your manager',
  onboarding: 'Onboarding',
  migrated: 'Migrated',
};
export const sourceLabel = (source) => SOURCE_LABEL[source] || humanize(source) || 'N/A';

/** "•••• 1234" — a document number is never shown whole (06-documents, Traps). */
export const maskedNumber = (n) => {
  const v = String(n || '').trim();
  return v ? `•••• ${v.slice(-4)}` : null;
};

/* ─── The upload handshake: issue/replace → PUT → confirm ─────────────────── */

export class DocumentUploadError extends Error {
  constructor(stage, cause, issued = null) {
    super(cause?.message || 'Couldn’t upload the file.');
    this.name = 'DocumentUploadError';
    this.stage = stage; // 'issue' | 'put' | 'confirm'
    this.cause = cause;
    this.issued = issued;
  }
}

export function documentUploadMessage(err) {
  if (err instanceof DocumentUploadError) {
    if (err.stage === 'put') return 'The file couldn’t be sent to secure storage. Check your connection and try again.';
    if (err.stage === 'confirm') return errorMessage(err.cause, 'documents', 'The file was sent but couldn’t be checked. Try again from My Documents.');
    return errorMessage(err.cause, 'documents', 'Couldn’t start the upload. Try again.');
  }
  return errorMessage(err, 'documents', 'Couldn’t upload the file. Try again.');
}

/**
 * @param {{ issue, confirm, file: {uri,name,type,size}, meta, onStage?, resume? }} opts
 *   `resume` is `err.issued` from a failed attempt — resend to the same link
 *   instead of opening a second draft.
 */
export async function uploadDocument({ issue, confirm, file, meta, onStage, resume }) {
  const content_type = contentTypeOfFile(file);
  const payload = { ...meta, file_name: trimFileName(file.name), content_type, size_bytes: file.size };

  let issued = resume && Date.parse(resume.expires_at || 0) > Date.now() + 5000 ? resume : null;
  if (!issued) {
    onStage?.('issue');
    try {
      const res = await issue(payload);
      const data = res?.data ?? res;
      issued = { ...data, document_id: data?.document_id ?? data?.document?.id ?? data?.id };
    } catch (err) {
      throw new DocumentUploadError('issue', err);
    }
  }
  if (!issued?.document_id || !issued?.upload_url) {
    throw new DocumentUploadError('issue', new Error('Storage didn’t return an upload link.'));
  }

  onStage?.('put');
  try {
    await uploadToPresignedUrl(issued.upload_url, file.uri, content_type, issued.required_headers);
  } catch (err) {
    throw new DocumentUploadError('put', err, issued);
  }

  onStage?.('confirm');
  try {
    const res = await confirm(issued.document_id);
    return res?.data ?? res ?? { id: issued.document_id };
  } catch (err) {
    throw new DocumentUploadError('confirm', err, issued);
  }
}

/* ─── Company documents issued to me ──────────────────────────────────────── */

export const orgDisplayStatus = (doc) => doc?.display_status || doc?.status || 'draft';
export const documentTypeName = (doc) => doc?.document_type?.name || '';
export const asksForSomething = (doc) => !!(doc?.requires_acknowledgement || doc?.requires_signature);

export function obligationLabel(doc) {
  if (doc?.requires_signature) return 'Signature needed';
  if (doc?.requires_acknowledgement) return 'Acknowledgement needed';
  return 'For your information';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** "Due today" / "Due in 3 days" / "Overdue by 2 days". Due today is NOT overdue. */
export function dueLabel(daysRemaining) {
  if (daysRemaining === null || daysRemaining === undefined || daysRemaining === '') return '';
  const n = Number(daysRemaining);
  if (!Number.isFinite(n)) return '';
  if (n < 0) return `Overdue by ${plural(-n, 'day', 'days')}`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${plural(n, 'day', 'days')}`;
}

const SETTLED = ['acknowledged', 'signed', 'waived'];

/** The row's `acknowledgement` block, normalised — never guessing "overdue". */
export function ackBlockOf(row) {
  const doc = row?.document || {};
  const block = row?.acknowledgement;
  if (block && typeof block === 'object') {
    return {
      state: block.state || null,
      dueOn: block.due_on || row?.due_on || null,
      daysRemaining: block.days_remaining ?? null,
      isOverdue: !!block.is_overdue,
      isBlocking: !!block.is_blocking,
      acknowledgedAt: block.acknowledged_at || null,
      signedAt: block.signed_at || null,
    };
  }
  const state = row?.state;
  return {
    state: state === 'waived' ? 'waived' : ['acknowledged', 'signed'].includes(state) ? 'completed' : asksForSomething(doc) ? 'pending' : null,
    dueOn: row?.due_on || null,
    daysRemaining: null,
    isOverdue: false,
    isBlocking: false,
    acknowledgedAt: null,
    signedAt: null,
  };
}

/** "sign" | "acknowledge" | null — `document.next_action` is the recipient-aware answer. */
export function nextActionOf(row) {
  const doc = row?.document || {};
  if (doc.next_action !== undefined) {
    const value = String(doc.next_action || '').toLowerCase();
    return value === 'sign' || value === 'acknowledge' ? value : null;
  }
  if (SETTLED.includes(row?.state)) return null;
  if (doc.requires_signature) return 'sign';
  if (doc.requires_acknowledgement) return 'acknowledge';
  return null;
}

/** Can it be acted on today? Scheduled / expired / superseded can't. */
export function actionWindow(doc) {
  const display = doc?.display_status || doc?.status;
  if (doc?.status && doc.status !== 'published') return { open: false, reason: doc.status === 'superseded' ? 'superseded' : 'closed' };
  if (display === 'scheduled') return { open: false, reason: 'scheduled' };
  if (display === 'expired') return { open: false, reason: 'expired' };
  return { open: true, reason: '' };
}

/** Acknowledged-but-still-to-sign reads as Waiting, never Done beside a Sign button. */
export function myComplianceState(row) {
  const state = ackBlockOf(row).state;
  return state === 'completed' && nextActionOf(row) ? 'pending' : state;
}

export const hasEvidence = (row) => ['acknowledged', 'signed'].includes(row?.state) || row?.acknowledgement?.state === 'completed';

export const SIGNER_MIN = 2;
export const SIGNER_MAX = 150;

/* ─── Requested from me, and my checklist ─────────────────────────────────── */

/** `open` with a negative countdown is already overdue (the 08:00 job hasn't run). */
export function requestDisplayStatus(req) {
  const status = req?.status;
  if (status !== 'open') return status;
  const days = Number(req?.days_until_due);
  return Number.isFinite(days) && days < 0 ? 'overdue' : 'open';
}
export const isRequestActive = (req) => ['open', 'overdue'].includes(requestDisplayStatus(req));

export const OUTSTANDING = 'outstanding';
export function requestFilterQuery(filter) {
  if (filter === OUTSTANDING) return { status: ['open', 'overdue'] };
  return filter ? { status: filter } : {};
}

/** The type a request is for — my own type list first, then the name it carries. */
export function requestTypeOf(request, index) {
  const known = index?.get?.(request?.document_type_id);
  if (known) return known;
  if (!request?.document_type_name) return null;
  return { id: request.document_type_id, name: request.document_type_name, group: request.document_type_group || null };
}

export const requesterLabel = (role) => (role === 'manager' ? 'Your manager' : role === 'hr' ? 'HR' : 'Your organisation');

const CHECKLIST_ORDER = ['expired', 'missing', 'requested', 'pending_upload', 'expiring', 'satisfied'];
const RANK = Object.fromEntries(CHECKLIST_ORDER.map((s, i) => [s, i]));
/** Counts toward completeness: on file, or on file but expiring. */
export const checklistCounts = (item) => item?.state === 'satisfied' || item?.state === 'expiring';

/** #98, normalised; what needs doing first. */
export function checklistOf(res) {
  const data = res?.data ?? res ?? {};
  const items = Array.isArray(data.items) ? data.items : [];
  const c = data.completeness || {};
  return {
    hasEmployeeRecord: data.has_employee_record !== false,
    profileIncomplete: data.profile_incomplete === true,
    completeness: {
      required: Number(c.required) || 0,
      satisfied: Number(c.satisfied) || 0,
      percent: Number.isFinite(Number(c.percent)) ? Number(c.percent) : null,
    },
    items: [...items].sort((a, b) => (RANK[a?.state] ?? 99) - (RANK[b?.state] ?? 99)
      || String(a?.name || '').localeCompare(String(b?.name || ''))),
  };
}

/* ─── My Document Home (#126) — only the to-do count is used here ─────────── */

/** How many things across my documents need something from me. */
export function portfolioActionCount(res) {
  const sections = (res?.data ?? res ?? {}).sections || {};
  return Object.values(sections).reduce(
    (sum, section) => sum + (Array.isArray(section?.items) ? section.items.filter((i) => i?.requires_action).length : 0),
    0,
  );
}

/* ─── Blank forms ─────────────────────────────────────────────────────────── */

export const isReferenceTemplate = (t) => t?.storage_backend === 'reference';
