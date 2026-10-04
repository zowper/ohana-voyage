// Night of ʻOhana — shared chapter-unlocking logic (voyage.html now; map.html / host.html later).
// (PUBLISHED FILE: keep comments free of answers, passcodes and surprises.)
//
// "The answer is the key": a typed code is normalized and tried as the decryption key for
// every chapter that this device hasn't opened yet. A wrong code simply fails to decrypt.
// Unlocked answers are stored (normalized) in localStorage["ohana"].unlocked = { chNN: code }.

import { loadState, saveState, loadData } from './common.js';
import { normalize, secrets, tryDecryptJSON } from './crypto.js';

/** Chapter number from an id like "ch07" → 7. */
export const chNum = (id) => Number(String(id).replace(/\D/g, ''));

/**
 * Decrypt every chapter this device has unlocked.
 * Returns { chapters: Map<chId, data>, pub }.
 * A saved code that no longer opens its chapter (content was rebuilt with a new code) is dropped.
 */
export async function openUnlockedChapters() {
  const [pub, blobs] = await Promise.all([loadData('public.json'), loadData('chapters.json')]);
  const state = loadState();
  const unlocked = state.unlocked || {};
  const out = new Map();
  let dropped = false;

  await Promise.all(Object.keys(unlocked).map(async (id) => {
    if (!unlocked[id] || !blobs[id]) return; // chapter not published yet: keep the saved code
    const data = await tryDecryptJSON(secrets.chapter(unlocked[id]), blobs[id]);
    if (data) out.set(id, data);
    else { delete unlocked[id]; dropped = true; }
  }));

  if (dropped) { state.unlocked = unlocked; saveState(state); }
  return { chapters: out, pub };
}

/**
 * Try a typed code against every still-locked chapter.
 * Result: { status: 'empty' }                       nothing usable typed
 *         { status: 'already', ids: [chId…] }       this code was already entered here
 *         { status: 'ok', unlocked: [{ id, data }] } newly unlocked (saved to localStorage)
 *         { status: 'wrong' }                       nothing opened
 */
export async function tryCode(input) {
  const code = normalize(input);
  if (!code) return { status: 'empty' };

  const blobs = await loadData('chapters.json');
  const pub = await loadData('public.json');
  const state = loadState();
  const unlocked = state.unlocked || {};

  const already = Object.keys(unlocked).filter((id) => normalize(unlocked[id]) === code);
  if (already.length) return { status: 'already', ids: already.sort() };

  const order = (pub.chapterIds || Object.keys(blobs)).filter((id) => blobs[id] && !unlocked[id]);
  if (!order.length) return { status: 'wrong' };

  // Fast path: most of the time the crew types the code for the next chapter in line.
  const [first, ...rest] = order;
  let hits = [];
  const firstData = await tryDecryptJSON(secrets.chapter(code), blobs[first]);
  if (firstData) hits.push({ id: first, data: firstData });
  else {
    const results = await Promise.all(rest.map(async (id) => ({
      id, data: await tryDecryptJSON(secrets.chapter(code), blobs[id]),
    })));
    hits = results.filter((r) => r.data);
  }
  if (!hits.length) return { status: 'wrong' };

  const s = loadState();
  s.unlocked = { ...(s.unlocked || {}) };
  for (const h of hits) s.unlocked[h.id] = code;
  saveState(s);
  return { status: 'ok', unlocked: hits };
}

/** Which unlocked chapters have private orders for the logged-in crew member? → Set<chId> */
export async function chaptersWithMyOrders() {
  const { me, passcode } = loadState();
  if (!me || !passcode) return null; // not logged in on this device
  try {
    const priv = await loadData('private.json');
    return new Set(Object.keys(priv[me] || {}));
  } catch {
    return new Set();
  }
}

/**
 * Decrypt every hint whose starting chapter is unlocked on this device.
 * Returns Map<hintId, { id, puzzle, title, tiersHtml[3], solvedBy? }>.
 */
export async function openUnlockedHints() {
  const blobs = await loadData('hints.json');
  const unlocked = loadState().unlocked || {};
  const out = new Map();
  await Promise.all(Object.entries(blobs).map(async ([id, h]) => {
    const code = unlocked[h.unlockedBy];
    if (!code || !h.blob) return;
    const data = await tryDecryptJSON(secrets.chapter(code), h.blob);
    if (data) out.set(id, data);
  }));
  return out;
}

/** Test whether a key string is an unfilled placeholder. */
export const isPlaceholderKey = (v) => !v || /^[A-Z]+(_[A-Z]+)*_CODE$/.test(String(v)) || String(v).startsWith('TBD');

/**
 * Unlock all chapters up to chapter N using a keys mapping.
 * Writes normalized keys to localStorage["ohana"].unlocked.
 * Returns array of unlocked chapter IDs.
 */
export function unlockUpToChapter(targetN, keysMap) {
  const state = loadState();
  state.unlocked = { ...(state.unlocked || {}) };
  const unlocked = [];
  for (let i = 1; i <= targetN; i++) {
    const ch = `ch${String(i).padStart(2, '0')}`;
    const raw = keysMap?.[ch];
    if (raw && !isPlaceholderKey(raw)) {
      state.unlocked[ch] = normalize(raw);
      unlocked.push(ch);
    }
  }
  saveState(state);
  return unlocked;
}

/**
 * Unlock a specific chapter using a raw key string.
 */
export function unlockSpecificChapter(chId, rawKey) {
  if (!rawKey || isPlaceholderKey(rawKey)) return false;
  const state = loadState();
  state.unlocked = { ...(state.unlocked || {}) };
  state.unlocked[chId] = normalize(rawKey);
  saveState(state);
  return true;
}

/**
 * Reset all unlocked chapters on this device.
 */
export function resetUnlockedChapters() {
  const state = loadState();
  state.unlocked = {};
  saveState(state);
}

