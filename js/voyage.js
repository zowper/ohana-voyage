// Night of ʻOhana — voyage.html: code box, chapter list, narration, private-orders links.
// (PUBLISHED FILE: keep comments free of answers, passcodes and surprises.)
//
// Extra state field (beyond spec §Client State): `seenChapters: { chNN: true }` drives the
// "NEW" badges on this page. Private-order links use `seenOrders` written by me.html.

import { loadState, saveState, loadData, esc, crewCard, optionalImg, initFooter, initHeader } from './common.js';
import { openUnlockedChapters, tryCode, chaptersWithMyOrders, chNum } from './unlock.js';

initFooter();
initHeader();

const $ = (id) => document.getElementById(id);
let pub = null;
let chapters = new Map(); // chId → decrypted chapter data
let myOrders = null;      // Set<chId> with private orders for the logged-in player, or null
const hintIndex = new Map(); // chId → [hintId…] whose hints open with that chapter (for "Stuck?" links)

async function main() {
  if (!globalThis.crypto?.subtle) {
    $('chapter-list').innerHTML = '<p class="msg-error">This browser can’t open the chapters here. Please use the https:// link the Carters sent you.</p>';
    $('code-btn').disabled = true;
    return;
  }
  try {
    ({ chapters, pub } = await openUnlockedChapters());
    myOrders = await chaptersWithMyOrders();
  } catch (e) {
    console.error(e);
    $('chapter-list').innerHTML = '<p class="msg-error">The logbook could not be loaded. Check your connection and refresh.</p>';
    return;
  }
  try {
    const hintBlobs = await loadData('hints.json');
    for (const [hid, h] of Object.entries(hintBlobs)) {
      if (!hintIndex.has(h.unlockedBy)) hintIndex.set(h.unlockedBy, []);
      hintIndex.get(h.unlockedBy).push(hid);
    }
  } catch { /* no hint links */ }
  render();
  $('code-form').addEventListener('submit', onSubmit);
  document.body.dataset.ready = 'true';

  const target = location.hash.slice(1);
  if (target && $(target)) openAndScroll(target, false);
  window.addEventListener('hashchange', () => openAndScroll(location.hash.slice(1), true));
}

// ---------- code entry ----------
let busy = false;
async function onSubmit(e) {
  e.preventDefault();
  if (busy) return;
  const input = $('code-input');
  const msg = $('code-msg');
  const btn = $('code-btn');

  busy = true;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Checking…';
  setMsg('Checking the stars…', '');

  try {
    const res = await tryCode(input.value);
    if (res.status === 'empty') {
      setMsg('Type the code your crew found, then tap Unlock.', 'error');
      input.focus();
    } else if (res.status === 'already') {
      const n = res.ids.map(chNum).join(' & ');
      setMsg(`Your crew already unlocked Chapter ${n} with that code. ⛵`, 'ok');
      openAndScroll(res.ids[0], true);
      input.value = '';
    } else if (res.status === 'wrong') {
      setMsg('That’s not quite it. Check the spelling and try again.', 'error');
      shake($('code-form'));
      input.select();
    } else {
      for (const { id, data } of res.unlocked) chapters.set(id, data);
      myOrders = await chaptersWithMyOrders();
      const first = res.unlocked[0];
      setMsg(`🎉 Chapter ${chNum(first.id)} unlocked: ${first.data.title}`, 'ok');
      input.value = '';
      render();
      openAndScroll(first.id, true);
    }
  } catch (err) {
    console.error(err);
    setMsg('Something went wrong reaching the ship’s records. Check your connection and try again.', 'error');
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = label;
  }

  function setMsg(text, kind) {
    msg.textContent = text;
    msg.className = 'code-msg' + (kind === 'error' ? ' msg-error' : kind === 'ok' ? ' msg-ok' : ' muted');
  }
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth; // restart the animation
  el.classList.add('shake');
}

// ---------- rendering ----------
function render() {
  const ids = pub.chapterIds || [];
  const list = $('chapter-list');
  const state = loadState();
  const seen = state.seenChapters || {};
  const seenOrders = state.seenOrders || {};
  const openIds = ids.filter((id) => chapters.has(id));
  const newest = openIds[openIds.length - 1];

  $('progress').textContent = openIds.length
    ? `${openIds.length} of ${ids.length} chapters unlocked`
    : '';

  const items = [];
  if (!openIds.length) {
    items.push(el('div', 'card voyage-empty',
      '<p>🌅 The canoe is still on the shore.</p>' +
      '<p class="muted">When the crew finds its first code, type it in the box above to begin the voyage.</p>'));
  }

  let shownNext = false;
  for (const id of ids) {
    const data = chapters.get(id);
    if (data) {
      items.push(chapterCard(id, data, {
        isNew: !seen[id],
        open: id === newest,
        orders: orderLink(id, id === newest, seenOrders),
      }));
    } else {
      const next = !shownNext;
      shownNext = true;
      const row = el('div', 'chapter-locked' + (next ? ' is-next' : ''),
        `<span class="lock" aria-hidden="true">${next ? '🧭' : '🔒'}</span>` +
        `<span><strong>Chapter ${chNum(id)}</strong> · ${next ? 'Next! Solve the puzzle, then enter its code above.' : 'Still over the horizon'}</span>`);
      row.id = id;
      items.push(row);
    }
  }
  list.replaceChildren(...items);

  // Everything rendered once counts as seen (the NEW badge stays until the next visit).
  const s = loadState();
  s.seenChapters = { ...(s.seenChapters || {}) };
  for (const id of openIds) s.seenChapters[id] = true;
  saveState(s);
}

function orderLink(id, isNewest, seenOrders) {
  if (myOrders === null) {
    return isNewest
      ? `<a class="orders-link" href="me.html">Log in to see if you have private orders →</a>`
      : '';
  }
  if (!myOrders.has(id)) return '';
  return seenOrders[id]
    ? `<a class="orders-link" href="me.html#order-${id}">Your private orders for this chapter →</a>`
    : `<a class="orders-link is-new" href="me.html#order-${id}"><span class="badge badge-new">New</span> Private orders for you →</a>`;
}

function chapterCard(id, data, { isNew, open, orders }) {
  const det = document.createElement('details');
  det.className = 'card chapter-card';
  det.id = id;
  det.open = open;

  const sum = document.createElement('summary');
  sum.innerHTML =
    `<span class="chapter-label">Chapter ${chNum(id)}${isNew ? ' <span class="badge badge-new">New</span>' : ''}</span>` +
    `<span class="chapter-title">${esc(data.title)}</span>`;
  det.append(sum);

  const body = document.createElement('div');
  body.className = 'chapter-body';

  const fig = document.createElement('div');
  fig.className = 'chapter-art';
  fig.append(optionalImg(data.image || `assets/img/${id}.webp`, '', () => fig.remove()));
  body.append(fig);

  const story = el('div', 'story prose', data.narrationHtml || '');
  body.append(story);

  if (data.narrationShortHtml) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-small short-toggle';
    btn.textContent = 'Show the short version';
    btn.setAttribute('aria-pressed', 'false');
    let short = false;
    btn.addEventListener('click', () => {
      short = !short;
      story.innerHTML = short ? data.narrationShortHtml : data.narrationHtml;
      btn.textContent = short ? 'Show the full story' : 'Show the short version';
      btn.setAttribute('aria-pressed', String(short));
    });
    body.append(btn);
  }

  if (data.crewCard) {
    const wrap = el('div', 'chapter-crew', '<p class="chapter-label">A new crew member!</p>');
    wrap.append(crewCard(data.crewCard, { special: true }));
    body.append(wrap);
  }

  if (data.bodyHtml) body.append(el('div', 'on-deck prose', data.bodyHtml));
  if (orders) body.append(el('p', 'orders-row', orders));
  const hintIds = hintIndex.get(id);
  if (hintIds?.length) {
    body.append(el('p', 'hint-link',
      `<a class="orders-link" href="hints.html#${esc(hintIds.slice().sort()[0])}">🌟 Stuck? Get a hint →</a>`));
  }

  det.append(body);
  return det;
}

function openAndScroll(id, smooth) {
  const target = $(id);
  if (!target) return;
  if (target.tagName === 'DETAILS') target.open = true;
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

function el(tag, className, html) {
  const n = document.createElement(tag);
  n.className = className;
  n.innerHTML = html;
  return n;
}

main();
