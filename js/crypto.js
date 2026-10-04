// Night of ʻOhana — shared crypto + normalization module.
// Used by BOTH the Node build (scripts/build.mjs, Node >= 18) and the browser.
// Spec: planning/06_WEBSITE_SPEC.md §Answer Normalization, §Encryption Scheme.
//
// Blob format: { "s": b64salt(16 bytes), "i": b64iv(12 bytes), "c": b64ciphertext }
// KDF: PBKDF2-SHA-256, 200,000 iterations. Cipher: AES-GCM 256.
// NOTE: browsers only expose crypto.subtle on https:// or http://localhost.

export const ITERATIONS = 200000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

function getCrypto() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('Web Crypto is unavailable. Open the site over https:// or http://localhost.');
  }
  return c;
}

/**
 * Normalize a typed answer/passcode so that case, spaces, punctuation,
 * ʻokina and kahakō don't matter. Directional answers are collapsed:
 * "Up, Left, Up" / "↑←↑" / "ulu" → "ULU".
 */
export function normalize(input) {
  let s = String(input ?? '');
  // Arrows → direction letters (before punctuation is stripped).
  s = s
    .replace(/[↑⬆]/g, ' U ')
    .replace(/[↓⬇]/g, ' D ')
    .replace(/[←⬅]/g, ' L ')
    .replace(/[→➡]/g, ' R ');
  // Strip diacritics (kahakō etc.).
  s = s.normalize('NFD').replace(/\p{M}/gu, '');
  // Uppercase; drop everything that isn't A–Z / 0–9 (removes ʻokina, apostrophes,
  // spaces, hyphens, punctuation, emoji variation selectors).
  s = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Directional words → letters, only when the WHOLE answer is directions
  // (so ordinary words are never altered).
  if (/^(?:UP|DOWN|LEFT|RIGHT|[UDLR])+$/.test(s)) {
    s = s.replace(/UP|DOWN|LEFT|RIGHT/g, (m) => m[0]);
  }
  return s;
}

/** Secret builders (spec §Encryption Scheme → Keys). */
export const secrets = {
  chapter: (answer) => normalize(answer),
  private: (passcode, answer) => normalize(passcode) + '|' + normalize(answer),
  teaser: (passcode) => normalize(passcode),
  host: (hostPasscode) => normalize(hostPasscode),
};

export function toB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}

export function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(secret, salt, usage) {
  const c = getCrypto();
  const base = await c.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return c.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

/** Encrypt a string with an (already-built) secret. Returns a blob object. */
export async function encryptString(secret, plaintext) {
  if (!secret) throw new Error('encryptString: empty secret');
  const c = getCrypto();
  const salt = c.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = c.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(secret, salt, 'encrypt');
  const ct = await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { s: toB64(salt), i: toB64(iv), c: toB64(new Uint8Array(ct)) };
}

/** Decrypt a blob. Throws on a wrong secret (AES-GCM auth failure). */
export async function decryptString(secret, blob) {
  if (!secret) throw new Error('decryptString: empty secret');
  if (!blob || !blob.s || !blob.i || !blob.c) throw new Error('decryptString: malformed blob');
  const c = getCrypto();
  const key = await deriveKey(secret, fromB64(blob.s), 'decrypt');
  const pt = await c.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.i) }, key, fromB64(blob.c));
  return dec.decode(pt);
}

export async function encryptJSON(secret, obj) {
  return encryptString(secret, JSON.stringify(obj));
}

export async function decryptJSON(secret, blob) {
  return JSON.parse(await decryptString(secret, blob));
}

/** Like decryptJSON but returns null instead of throwing ("That's not quite it."). */
export async function tryDecryptJSON(secret, blob) {
  if (!secret || !blob) return null;
  try {
    return await decryptJSON(secret, blob);
  } catch {
    return null;
  }
}
