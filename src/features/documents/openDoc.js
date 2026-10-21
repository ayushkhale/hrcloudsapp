// ─────────────────────────────────────────────────────────────────────────────
// features/documents/openDoc.js — opening a document, the one way.
//
// Every document route answers a SIGNED, SHORT-LIVED link rather than the
// bytes (`view_url` / `url` / `download_url` — the endpoints disagree, so
// `signedUrlOf` reads all three). So: ask at the moment of the tap, follow the
// link at once, never keep it (CLAUDE.md §6, 06-documents Traps). Asking IS
// the read receipt for a company document — which is why nothing on these
// screens pre-fetches a link.
//
// A link-type document or form (`storage_backend: "reference"`) is a web page
// somewhere else; it opens in the browser, not the file viewer.
// ─────────────────────────────────────────────────────────────────────────────

import { Linking } from 'react-native';
import { openSignedUrl } from '../../api/files';
import { errorMessage } from '../../lib/errors';
import { showToast } from '../../ui/Toast';
import { signedUrlOf } from './docMeta';

const safe = (s) => String(s || 'document').replace(/[\\/:*?"<>|]+/g, '-').trim();

/** A file name with an extension, so the OS viewer knows what to open it with. */
export function fileNameFor(title, contentType) {
  const base = safe(title);
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
  const ext = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  }[contentType] || 'pdf';
  return `${base}.${ext}`;
}

/**
 * @param {() => Promise} getLink   the view-url / download-url call, unbound
 * @param {{ title?: string, contentType?: string, reference?: boolean }} info
 * @returns {Promise<boolean>} true when it opened
 */
export async function openDocument(getLink, { title, contentType, reference = false } = {}) {
  try {
    const url = signedUrlOf(await getLink());
    if (!url) throw new Error('No link came back for this document.');
    if (reference) {
      await Linking.openURL(url);
      return true;
    }
    await openSignedUrl(url, { filename: fileNameFor(title, contentType) });
    return true;
  } catch (err) {
    showToast(errorMessage(err, 'documents', 'Couldn’t open that. Try again.'), 'error');
    return false;
  }
}
