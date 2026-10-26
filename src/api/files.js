// ─────────────────────────────────────────────────────────────────────────────
// api/files.js — authenticated binary transfer: PDF · CSV · ZIP, plus the
// presigned upload step that bypasses our own gateway entirely.
//
// `request()` always parses JSON, so it cannot carry a binary response.
// Payslip PDFs, Form 16, annual statements and report exports stream real
// files, so they come through here: same Bearer token, failures thrown in
// EXACTLY the shape `request()` throws (so payrollErrorMessage reads them
// unchanged), and the bytes written to the app's cache directory.
//
// `Content-Disposition` carries the real filename, and `filename*=UTF-8''…`
// wins over `filename="…"` (RFC 6266). We fall back to the caller's name so a
// file never lands on disk called "download".
//
// ONE ROUTE DOES NOT ALWAYS ANSWER WITH A FILE. Since PDF Generation Phase 3
// the bulk payslip ZIP may answer `202 Accepted` with a JSON body saying "I
// have started preparing these, poll here" — and `response.ok` is TRUE for a
// 202. Without `acceptJson` this would cheerfully save that JSON to disk as a
// .zip. A corrupt archive that looks like a successful download is the worst
// possible outcome for a payroll file, so the option is opt-in per call.
// (No employee route needs it today; the behaviour is kept for parity.)
//
// NOTHING HERE OPENS A WEBVIEW. A PDF is handed to the OS viewer.
// ─────────────────────────────────────────────────────────────────────────────

import ReactNativeBlobUtil from 'react-native-blob-util';
import FileViewer from 'react-native-file-viewer';
import Share from 'react-native-share';
import { Linking, Platform } from 'react-native';
import { API_BASE_URL, getToken } from './client';

const TIMEOUT_MS = 110000;

/* ── "NO APP ASSOCIATED WITH THIS MIME TYPE" (2026-10-20) ─────────────────────
   Android's viewer chooses the app from the FILE EXTENSION. Files were named
   from the caller's title ("Offer Letter", "receipt"), so many had none — or
   the wrong one (an image saved as .pdf) — and the OS answered that nothing
   could open them. Every opened file now gets the extension its real
   Content-Type says, and when the phone genuinely has no app for it (an
   emulator has no PDF viewer) the file still opens: a signed link in the
   browser, an authenticated download through the share sheet. */
const EXT_OF_TYPE = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const baseType = (ct) => String(ct || '').split(';')[0].trim().toLowerCase();

/** Rename `path` so its extension matches `contentType`. Returns the new path. */
async function withRightExtension(path, contentType) {
  const ext = EXT_OF_TYPE[baseType(contentType)];
  if (!ext) return path;
  const current = (/\.([a-z0-9]{2,5})$/i.exec(path) || [])[1];
  if (current && current.toLowerCase() === ext) return path;
  const next = current ? path.replace(/\.[a-z0-9]{2,5}$/i, `.${ext}`) : `${path}.${ext}`;
  await ReactNativeBlobUtil.fs.unlink(next).catch(() => {});
  try {
    await ReactNativeBlobUtil.fs.mv(path, next);
    return next;
  } catch {
    return path;
  }
}

const noViewerApp = (err) => /no app|activity not found|no activity|unable to find/i.test(String(err?.message || err));

/** Open a local file in the OS viewer; with no app for it, the share sheet. */
async function openLocal(path, contentType, displayName) {
  try {
    await FileViewer.open(path, { showOpenWithDialog: true, displayName });
  } catch (err) {
    if (!noViewerApp(err)) throw err;
    const url = Platform.OS === 'android' ? `file://${path}` : path;
    await Share.open({ url, type: baseType(contentType) || 'application/octet-stream', failOnCancel: false });
  }
}

/** Arrays repeat the key (`component_code=A&component_code=B`). */
function buildQuery(params) {
  if (!params) return '';
  const parts = [];
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== '') {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
        }
      });
      return;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

/** `filename*=UTF-8''…` wins over `filename="…"`, per RFC 6266. */
function filenameFromDisposition(header) {
  if (!header) return '';
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // A malformed encoding falls through to the plain filename below.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : '';
}

const safeName = (name) => String(name || 'download').replace(/[\\/:*?"<>|]+/g, '-');

/** Where downloads land. Cleared on sign-out — see state/session.js. */
export const DOWNLOAD_DIR = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/hrclouds`;

const headerOf = (headers, name) => {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
};

/**
 * The shared half of every download: send with the session token, turn a
 * refusal into the error shape `request()` throws, and refuse an empty body.
 */
async function fetchBinary(endpoint, { params, method = 'GET', body, filename, acceptJson = false } = {}) {
  const token = getToken();
  await ReactNativeBlobUtil.fs.mkdir(DOWNLOAD_DIR).catch(() => {});
  const target = `${DOWNLOAD_DIR}/${safeName(filename || `dl-${Date.now()}`)}`;

  let res;
  try {
    res = await ReactNativeBlobUtil.config({ path: target, timeout: TIMEOUT_MS, fileCache: false })
      .fetch(
        method,
        `${API_BASE_URL}${endpoint}${buildQuery(params)}`,
        {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body ? JSON.stringify(body) : undefined,
      );
  } catch (err) {
    const error = new Error('Download timed out. Please try again.');
    error.status = 408;
    error.isTimeout = true;
    error.cause = err;
    throw error;
  }

  const status = res.info().status;
  const headers = res.info().headers || {};
  const contentType = headerOf(headers, 'Content-Type');
  const isJson = /application\/json/i.test(contentType);

  // A refusal (403 held payslip, 409 unpaid run, 422 too large) still comes
  // back as the normal JSON envelope — throw it the way request() does.
  if (status < 200 || status >= 300) {
    let data = null;
    if (isJson) {
      try {
        data = JSON.parse(await res.text());
      } catch {
        // A non-JSON error body carries nothing worth showing.
      }
    }
    await ReactNativeBlobUtil.fs.unlink(target).catch(() => {});
    const error = new Error(data?.message || `Download failed (${status})`);
    error.status = status;
    error.data = data;
    throw error;
  }

  // Checked BEFORE the file is treated as bytes: a 202 is a successful answer
  // that happens not to be a file.
  if (acceptJson && isJson) {
    let json = null;
    try {
      json = JSON.parse(await res.text());
    } catch {
      // falls through to the error below rather than being guessed at
    }
    await ReactNativeBlobUtil.fs.unlink(target).catch(() => {});
    if (json) return { json, status };
    const error = new Error('The server sent an answer that couldn’t be read.');
    error.status = status;
    throw error;
  }

  const stat = await ReactNativeBlobUtil.fs.stat(target);
  if (!stat || Number(stat.size) === 0) {
    await ReactNativeBlobUtil.fs.unlink(target).catch(() => {});
    const error = new Error('The server returned an empty file.');
    error.status = status;
    throw error;
  }

  // Rename to the server's own filename when it gave us one.
  const serverName = safeName(filenameFromDisposition(headerOf(headers, 'Content-Disposition')) || filename);
  let path = target;
  if (serverName && `${DOWNLOAD_DIR}/${serverName}` !== target) {
    const renamed = `${DOWNLOAD_DIR}/${serverName}`;
    await ReactNativeBlobUtil.fs.unlink(renamed).catch(() => {});
    await ReactNativeBlobUtil.fs.mv(target, renamed).catch(() => {});
    path = renamed;
  }

  return { path, filename: serverName || safeName(filename), size: Number(stat.size), contentType, status };
}

/**
 * Download a file and hand it to the OS viewer.
 * @param {string} endpoint path after the API base, e.g. payrollFiles.myPayslipPdf(id)
 * @param {{ params?: object, filename?: string, method?: string, body?: object,
 *           acceptJson?: boolean, open?: boolean }} [options]
 * @returns {Promise<{ path: string, filename: string, size: number } | { enqueued: true, status: number, data: object }>}
 */
export async function downloadFile(endpoint, options = {}) {
  const { open = true, ...rest } = options;
  const result = await fetchBinary(endpoint, rest);
  if (result.json) return { enqueued: true, status: result.status, data: result.json?.data ?? result.json };

  if (open) {
    // showOpenWithDialog lets Android offer every PDF app rather than guessing.
    const path = await withRightExtension(result.path, result.contentType);
    await openLocal(path, result.contentType, result.filename);
    return { ...result, path };
  }
  return result;
}

/**
 * The same download, but shared instead of opened — the OS share sheet, so a
 * payslip can be mailed or saved without a second request.
 */
export async function shareFile(endpoint, options = {}) {
  const result = await fetchBinary(endpoint, options);
  const url = Platform.OS === 'android' ? `file://${result.path}` : result.path;
  await Share.open({ url, type: result.contentType || 'application/pdf', failOnCancel: false });
  return result;
}

/**
 * Fetch the bytes without opening anything — for a screen that must SHOW the
 * file (an inline image preview). The caller owns the path and should delete
 * it when the view closes.
 *
 * `Cache-Control: private, no-store` on these responses is the server's, and
 * it is the reason a preview is re-fetched on every open rather than
 * remembered. Respect it: do not cache the path across screens.
 */
export const fetchFileToCache = (endpoint, options = {}) => fetchBinary(endpoint, options);

/**
 * STEP 2 of the three-step presigned upload. This does NOT go through our
 * gateway and carries NO Bearer token — it is a signed URL to object storage.
 *
 *   1. POST …/attachments  { file_name, content_type, file_size } → { upload_url }
 *   2. uploadToPresignedUrl(upload_url, localPath, contentType)     ← here
 *   3. POST …/attachments/:id/confirm
 *
 * `contentType` MUST be byte-identical to what you declared in step 1, or the
 * signature check fails with a 403 that mentions nothing about content types.
 *
 * MISS STEP 3 and the file exists in storage but not on the record — which
 * looks, to everyone, like the upload silently did nothing.
 *
 * `signal` is an optional AbortSignal: when it fires mid-PUT, the fetch task
 * is cancelled and this rejects with an `AbortError`. The caller must stop
 * before step 3 — a confirmed attachment is attached to the record.
 */
export async function uploadToPresignedUrl(uploadUrl, localPath, contentType, requiredHeaders, signal) {
  // `required_headers` from step 1 are echoed back, EXCEPT Content-Length
  // (the native layer derives it from the file) and Content-Type (set once,
  // from the value declared in step 1). Same rule as the web's putToSignedUrl.
  const headers = { 'Content-Type': contentType };
  if (requiredHeaders && typeof requiredHeaders === 'object') {
    Object.entries(requiredHeaders).forEach(([key, value]) => {
      if (/^content-(length|type)$/i.test(key)) return;
      headers[key] = value;
    });
  }
  if (signal?.aborted) {
    const err = new Error('Upload cancelled.');
    err.name = 'AbortError';
    throw err;
  }
  const task = ReactNativeBlobUtil.fetch(
    'PUT',
    uploadUrl,
    headers,
    ReactNativeBlobUtil.wrap(decodeURI(localPath.replace('file://', ''))),
  );
  const onAbort = () => { try { task.cancel(); } catch { /* ignore */ } };
  if (signal) signal.addEventListener('abort', onAbort);
  let res;
  try {
    res = await task;
  } catch (err) {
    if (signal?.aborted) {
      const aborted = new Error('Upload cancelled.');
      aborted.name = 'AbortError';
      throw aborted;
    }
    throw err;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
  }
  if (signal?.aborted) {
    const err = new Error('Upload cancelled.');
    err.name = 'AbortError';
    throw err;
  }
  const status = res.info().status;
  if (status < 200 || status >= 300) {
    const error = new Error('The file couldn’t be uploaded. Please try again.');
    error.status = status;
    throw error;
  }
  return true;
}

/**
 * Open a file behind a PRESIGNED storage URL — a claim receipt or a tax proof,
 * whose `view-url` route answers with `{ view_url }` rather than the bytes.
 *
 * NO Bearer token: the URL carries its own signature, and an Authorization
 * header on a signed S3 request is refused. Fetch the URL at the moment of use
 * (it lives about five minutes) and never keep it.
 */
export async function openSignedUrl(url, { filename, open = true } = {}) {
  await ReactNativeBlobUtil.fs.mkdir(DOWNLOAD_DIR).catch(() => {});
  const path = `${DOWNLOAD_DIR}/${safeName(filename || `file-${Date.now()}`)}`;
  let res;
  try {
    res = await ReactNativeBlobUtil.config({ path, timeout: TIMEOUT_MS, fileCache: false }).fetch('GET', url);
  } catch (err) {
    const error = new Error('The file took too long to open. Please try again.');
    error.status = 408;
    error.cause = err;
    throw error;
  }
  const status = res.info().status;
  if (status < 200 || status >= 300) {
    await ReactNativeBlobUtil.fs.unlink(path).catch(() => {});
    const error = new Error('This file couldn’t be opened. It may have been removed.');
    error.status = status;
    throw error;
  }
  const contentType = headerOf(res.info().headers, 'Content-Type');
  const finalPath = await withRightExtension(path, contentType);
  if (open) {
    try {
      await FileViewer.open(finalPath, { showOpenWithDialog: true, displayName: filename });
    } catch (err) {
      // No app on the phone for this type: the signed link opens in the
      // browser, which renders a PDF or an image itself. A browser is not a
      // webview (house rule 11.4) — it is the OS handing the file elsewhere.
      if (!noViewerApp(err)) throw err;
      await Linking.openURL(url);
    }
  }
  return { path: finalPath, contentType };
}

/** Called on sign-out. A cached payslip outliving the session is a real leak. */
export async function clearDownloadCache() {
  try {
    if (ReactNativeBlobUtil?.fs?.unlink && DOWNLOAD_DIR) {
      await ReactNativeBlobUtil.fs.unlink(DOWNLOAD_DIR).catch(() => {});
    }
  } catch {
    // Non-fatal on sign out
  }
}
