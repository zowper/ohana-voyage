// Night of ʻOhana — me.html: crew login, role card, pre-event teaser, private orders.
// Login check = decrypting the player's teaser blob with norm(passcode) (spec 06 §Keys).
// Private orders for chapter n decrypt with norm(passcode)|norm(answer_n), using answers
// stored in localStorage["ohana"].unlocked by the voyage page (TODO 5.1) or host page.
//
// Extra state fields (beyond spec §Client State): `seenOrders: { chNN: true }` drives the
// "NEW" badges; `lastPick` remembers the last name tapped. Tip: me.html?crew=<id> preselects a name.

import { loadState, saveState, loadData, esc, crewCard, initFooter, initHeader } from './common.js';
import { secrets, tryDecryptJSON } from './crypto.js';

initFooter();

const $ = (id) => document.getElementById(id);
const show = (id) => {
  for (const v of ['loading', 'login-view', 'me-view']) $(v).classList.toggle('hidden', v !== id);
};

let pub = null;
let selectedId = null;

async function main() {
  try {
    pub = await loadData('public.json');
  } catch (e) {
    console.error(e);
    $('loading').innerHTML = '<span class="msg-error">The crew list could not be loaded. Check your connection and refresh.</span>';
    return;
  }

  if (!globalThis.crypto?.subtle) {
    $('loading').innerHTML = '<span class="msg-error">This browser can’t open secret orders here. Please use the https:// link the Carters sent you.</span>';
    return;
  }

  const state = loadState();
  if (state.me && state.passcode) {
    const ok = await openOrders(state.me, state.passcode);
    if (ok) return;
    // Saved passcode no longer works (e.g. codes changed): forget it and show login.
    const s = loadState();
    delete s.me; delete s.passcode;
    saveState(s);
    renderLogin('Please log in again.');
    return;
  }
  renderLogin();
}

// ---------- login ----------
function renderLogin(message = '') {
  const grid = $('name-grid');
  const roster = [...pub.roster].sort((a, b) => a.station - b.station);
  grid.replaceChildren(...roster.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'name-tile';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.dataset.id = p.id;
    b.innerHTML = `<span class="name-tile-name">${esc(p.name)}</span><span class="name-tile-role">${esc(p.role)}</span>`;
    b.addEventListener('click', () => pick(p.id, true));
    return b;
  }));

  // Arrow-key support for the radio group.
  grid.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    const tiles = [...grid.querySelectorAll('.name-tile')];
    const i = Math.max(0, tiles.findIndex((t) => t.dataset.id === selectedId));
    const next = tiles[(i + keys[e.key] + tiles.length) % tiles.length];
    e.preventDefault();
    pick(next.dataset.id, false);
    next.focus();
  });

  const fromUrl = new URLSearchParams(location.search).get('crew');
  const initial = [fromUrl, loadState().lastPick].find((id) => id && roster.some((p) => p.id === id));
  if (initial) pick(initial, false);
  else syncTabStops();

  $('login-msg').textContent = message;
  $('login-form').addEventListener('submit', onLogin);
  show('login-view');
}

function pick(id, focusPasscode) {
  selectedId = id;
  for (const t of document.querySelectorAll('.name-tile')) {
    t.setAttribute('aria-checked', String(t.dataset.id === id));
  }
  syncTabStops();
  $('login-msg').textContent = '';
  if (focusPasscode) $('passcode').focus();
}

function syncTabStops() {
  const tiles = [...document.querySelectorAll('.name-tile')];
  const active = tiles.find((t) => t.dataset.id === selectedId) || tiles[0];
  for (const t of tiles) t.tabIndex = t === active ? 0 : -1;
}

let busy = false;
async function onLogin(e) {
  e.preventDefault();
  if (busy) return;
  const msg = $('login-msg');
  const passcode = $('passcode').value.trim();
  if (!selectedId) { msg.textContent = 'First, tap your name.'; return; }
  if (!passcode) { msg.textContent = 'Now type your passcode.'; $('passcode').focus(); return; }

  busy = true;
  const btn = $('login-btn');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking…';
  msg.textContent = '';
  try {
    const s = loadState();
    s.lastPick = selectedId;
    saveState(s);
    const ok = await openOrders(selectedId, passcode, { saveOnSuccess: true });
    if (!ok) {
      msg.textContent = 'That’s not quite it. Check your passcode and try again.';
      $('passcode').select();
    }
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ---------- logged in ----------
/** Decrypt the teaser (= login check). On success render the page and return true. */
async function openOrders(id, passcode, { saveOnSuccess = false } = {}) {
  let teasers;
  try {
    teasers = await loadData('teasers.json');
  } catch (e) {
    console.error(e);
    $('login-msg').textContent = 'Could not reach the ship’s records. Check your connection and try again.';
    return false;
  }
  const teaser = await tryDecryptJSON(secrets.teaser(passcode), teasers[id]);
  if (!teaser) return false;

  if (saveOnSuccess) {
    const s = loadState();
    s.me = id;
    s.passcode = passcode;
    saveState(s);
  }
  renderMe(id, teaser);
  initHeader();
  await renderOrders(id, passcode);
  return true;
}

function renderMe(id, teaser) {
  const pubMember = pub.roster.find((r) => r.id === id) || {};
  const member = { ...pubMember, ...(teaser.player || {}) };
  $('me-title').textContent = teaser.title || `Aloha, ${member.name}!`;
  document.title = `${member.name}'s Orders · Night of ʻOhana`;

  const card = crewCard(member);
  if (member.prop && !teaser.isDefault) {
    const p = document.createElement('p');
    p.className = 'crew-prop';
    p.innerHTML = `<strong>Bring if you like:</strong> ${esc(member.prop)}`;
    const meta = card.querySelector('.crew-meta');
    if (meta) meta.before(p); else card.append(p);
  }
  $('role-card').replaceChildren(card);

  $('teaser').innerHTML = teaser.html || '';
  $('logout-btn').onclick = logout;
  show('me-view');
}

async function renderOrders(id, passcode) {
  const box = $('orders');
  const state = loadState();
  const unlocked = state.unlocked || {};
  const unlockedIds = Object.keys(unlocked).filter((ch) => unlocked[ch]);

  let mine = {};
  try {
    mine = (await loadData('private.json'))[id] || {};
  } catch (e) {
    console.error(e);
    box.innerHTML = '<p class="msg-error">Your orders could not be loaded. Check your connection and refresh.</p>';
    return;
  }

  const candidates = unlockedIds.filter((ch) => mine[ch]).sort().reverse(); // newest first
  if (!candidates.length) {
    box.innerHTML = unlockedIds.length
      ? '<p class="muted">No private orders for you yet. Keep sailing, and check back after each new chapter!</p>'
      : '<div class="card orders-empty"><p>🌙 The canoe hasn’t left the shore yet.</p><p class="muted">On voyage night, each time the crew unlocks a chapter, any secret orders meant just for you will appear here.</p></div>';
    return;
  }

  box.innerHTML = '<p class="muted">Opening your orders…</p>';
  const results = await Promise.all(candidates.map(async (ch) => ({
    ch,
    data: await tryDecryptJSON(secrets.private(passcode, unlocked[ch]), mine[ch]),
  })));

  const seen = state.seenOrders || {};
  const cards = results.filter((r) => r.data).map(({ ch, data }) => {
    const art = document.createElement('article');
    art.className = 'card prose order-card';
    art.id = `order-${ch}`;
    const num = Number(ch.replace(/\D/g, ''));
    const isNew = !seen[ch];
    art.innerHTML =
      `<p class="chapter-label">Chapter ${num}${isNew ? ' <span class="badge badge-new">New</span>' : ''}</p>` +
      (data.title ? `<h3>${esc(data.title)}</h3>` : '') +
      `<div class="order-body">${data.html || ''}</div>`;
    return art;
  });

  if (!cards.length) {
    box.innerHTML = '<p class="muted">No private orders for you yet. Keep sailing!</p>';
    return;
  }
  box.replaceChildren(...cards);

  // Mark as seen so the "NEW" badge only shows on the first visit after unlocking.
  const s = loadState();
  s.seenOrders = { ...(s.seenOrders || {}) };
  for (const r of results) if (r.data) s.seenOrders[r.ch] = true;
  saveState(s);

  if (location.hash.startsWith('#order-')) $(location.hash.slice(1))?.scrollIntoView();
}

function logout() {
  const s = loadState();
  delete s.me;
  delete s.passcode;
  delete s.seenOrders;
  saveState(s); // keep unlocked chapters: they belong to the crew, not the person
  location.href = 'me.html';
}

main();
