// ─────────────────────────────────────────────────────────────────────────────
// lib/imageCache.js — remote pictures (profile photos, the org logo), kept on
// the phone so they don't download again on every open.
//
// User, 2026-10-22: "profile image, org images take a little time to show up."
// The platform image cache already exists, but it keys on the WHOLE URL, and
// these URLs are signed — the query string (signature, expiry) changes every
// time the profile is read (ui/Avatar.jsx: "the old one had expired"). A new
// URL is a cache miss, so the same photo downloaded again on every visit.
//
// So the key here is the URL WITHOUT its query: the file's own address. The
// first time a picture is shown it is drawn from the network as before and
// saved in the background; every time after that, it is drawn from the saved
// file at once. A fresh signed URL for the same file still hits.
//
// A NEW photo is a new file (an upload gets a new storage key), so it gets a
// new entry — a changed avatar is never hidden behind the old one.
//
// Cleared on sign-out (state/AuthContext.jsx): photos of colleagues are
// personal data, and the next person on this phone must not inherit them.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import ReactNativeBlobUtil from 'react-native-blob-util';

const DIR = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/hrc-images`;
const known = new Map(); // key → file path, once saved
const inFlight = new Set();

/** The file's address, without the signature that changes on every read. */
const keyOf = (url) => String(url || '').split('?')[0].split('#')[0];

/** A short, file-safe name for a key (djb2 — collisions here only cost a re-download). */
function nameOf(key) {
  let h = 5381;
  for (let i = 0; i < key.length; i += 1) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}-${key.length.toString(36)}`;
}

const isRemote = (url) => /^https?:\/\//i.test(String(url || ''));

async function save(url, key, path) {
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    if (!(await ReactNativeBlobUtil.fs.isDir(DIR))) await ReactNativeBlobUtil.fs.mkdir(DIR);
    const res = await ReactNativeBlobUtil.config({ path }).fetch('GET', url);
    const status = res?.info?.()?.status;
    if (status && status >= 200 && status < 300) known.set(key, path);
    else await ReactNativeBlobUtil.fs.unlink(path).catch(() => {});
  } catch {
    // A picture that couldn't be saved is drawn from the network next time too.
  } finally {
    inFlight.delete(key);
  }
}

/**
 * The URI to draw for a remote picture: the saved file when there is one,
 * otherwise the URL itself (and the file is saved for next time).
 * Local and empty sources pass straight through.
 */
export function useCachedImageUri(url) {
  const key = isRemote(url) ? keyOf(url) : null;
  const [uri, setUri] = useState(() => (key && known.has(key) ? `file://${known.get(key)}` : url));

  useEffect(() => {
    if (!key) { setUri(url); return undefined; }
    if (known.has(key)) { setUri(`file://${known.get(key)}`); return undefined; }
    let alive = true;
    const path = `${DIR}/${nameOf(key)}`;
    setUri(url);
    ReactNativeBlobUtil.fs.exists(path)
      .then((there) => {
        if (there) {
          known.set(key, path);
          if (alive) setUri(`file://${path}`);
        } else {
          // Not on the phone yet: this view draws from the network; save it
          // for the next one. Never swap mid-view — that's a visible flash.
          save(url, key, path);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [key, url]);

  return uri;
}

/** Forget every saved picture. Called when a session ends. */
export async function clearImageCache() {
  known.clear();
  try {
    if (await ReactNativeBlobUtil.fs.isDir(DIR)) await ReactNativeBlobUtil.fs.unlink(DIR);
  } catch {
    // Best effort; the OS also clears CacheDir under storage pressure.
  }
}

export default { useCachedImageUri, clearImageCache };
