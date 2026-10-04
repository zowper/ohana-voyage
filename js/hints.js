// Night of ʻOhana — hints.html: 3-tier progressive hints for every puzzle the crew has reached.
// (PUBLISHED FILE: keep comments free of answers, passcodes and surprises.)
//
// A puzzle's hints decrypt with the code of the chapter where that puzzle starts. Tiers open
// one at a time, each after an "Are you sure?" step. Extra state field:
//   `hintsShown: { pNN: <number of tiers revealed, 0–3> }` (this device only).
// A puzzle counts as solved once the chapter named in its (encrypted) `solvedBy` is unlocked.

import { loadState, saveState, esc, initFooter, initHeader } from './common.js';
import { openUnlockedHints } from './unlock.js';

initFooter();
initHeader();

const $ = (id) => document.getElementById(id);

const TIERS = [
  { name: 'a gentle nudge', ask: 'Give it one more try together first? If the crew is still stuck, this is just a small nudge.' },
  { name: 'a stronger hint', ask: 'This hint points the way more clearly. Ready for it?' },
  { name: 'almost the answer', ask: 'This one nearly gives the answer away. Is the whole crew ready?' },
];

let hints = new Map(); // hintId → decrypted hint
const confirming = {}; // hintId → tier index waiting for "Yes"

const puzzleNum = (h) => Number(String(h.puzzle || h.id).replace(/\D/g, '')) || 0;
const shownCount = (id) => Math.min(3, Math.max(0, Number(loadState().hintsShown?.[id]) || 0));
const isSolved = (h) => Boolean(h.solvedBy && loadState().unlocked?.[h.solvedBy]);

async function main() {
  const list = $('hint-list');
  if (!globalThis.crypto?.subtle) {
    list.innerHTML = '<p class="msg-error">This browser can’t open the hints here. Please use the https:// link the Carters sent you.</p>';
    return;
  }
  try {
    hints = await openUnlockedHints();
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="msg-error">The hints could not be loaded. Check your connection and refresh.</p>';
    return;
  }
  render();
  document.body.dataset.ready = 'true';

  const target = location.hash.slice(1);
  if (target) openAndScroll(target, false);
  window.addEventListener('hashchange', () => openAndScroll(location.hash.slice(1), true));
}

// ---------- rendering ----------
function render() {
  const list = $('hint-list');
  const sorted = [...hints.values()].sort((a, b) => puzzleNum(a) - puzzleNum(b));

  if (!sorted.length) {
    const started = Object.keys(loadState().unlocked || {}).length > 0;
    list.innerHTML = `<div class="card voyage-empty">${started
      ? '<p>🌟 No hints are open on this device yet.</p><p class="muted">Enter the latest code on the <a href="voyage.html">Voyage page</a>, then come back here.</p>'
      : '<p>🌅 The canoe is still on the shore.</p><p class="muted">Hints appear here once the voyage begins. Enter your first code on the <a href="voyage.html">Voyage page</a>.</p>'
    }</div>`;
    return;
  }

  const current = sorted.filter((h) => !isSolved(h));
  const solved = sorted.filter(isSolved);
  const items = [];

  if (current.length) {
    items.push(el('h2', 'hint-section-title', current.length > 1 ? 'Puzzles in progress' : 'Puzzle in progress'));
    for (const h of current) items.push(hintCard(h, false));
  } else {
    items.push(el('div', 'card voyage-empty',
      '<p>⛵ Every puzzle so far is solved. Well sailed!</p>' +
      '<p class="muted">When the next chapter opens on the <a href="voyage.html">Voyage page</a>, its hints will appear here.</p>'));
  }
  if (solved.length) {
    items.push(el('h2', 'hint-section-title', 'Solved puzzles'));
    for (const h of solved) items.push(hintCard(h, true));
  }
  list.replaceChildren(...items);
}

/** One puzzle: an open card (in progress) or a collapsed <details> (solved). */
function hintCard(h, solved) {
  const wrap = document.createElement(solved ? 'details' : 'section');
  wrap.className = 'card hint-card' + (solved ? ' is-solved' : '');
  wrap.id = h.id;

  const headHtml =
    `<span class="chapter-label">Puzzle ${puzzleNum(h) || esc(h.puzzle)}` +
    `${solved ? ' <span class="badge badge-solved">✓ Solved</span>' : ''}</span>` +
    `<span class="hint-title">${esc(h.title)}</span>`;

  let head;
  if (solved) {
    head = document.createElement('summary');
    head.innerHTML = headHtml;
  } else {
    head = document.createElement('h3');
    head.className = 'hint-head';
    head.innerHTML = headHtml;
  }
  wrap.append(head);

  const body = document.createElement('div');
  body.className = 'hint-body';
  fillTiers(body, h);
  wrap.append(body);
  return wrap;
}

function fillTiers(body, h) {
  const shown = shownCount(h.id);
  const ol = document.createElement('ol');
  ol.className = 'tier-list';

  TIERS.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'tier';
    const label = `Hint ${i + 1} · ${t.name}`;

    if (i < shown) {
      li.classList.add('is-open');
      li.innerHTML = `<p class="tier-label">${esc(label)}</p><div class="tier-text prose" tabindex="-1">${h.tiersHtml?.[i] || ''}</div>`;
    } else if (i === shown && confirming[h.id] === i) {
      li.classList.add('is-confirm');
      li.innerHTML = `<p class="tier-label">${esc(label)}</p><p class="tier-ask"><strong>Are you sure?</strong> ${esc(t.ask)}</p>`;
      const row = document.createElement('div');
      row.className = 'tier-actions';
      const yes = button(`Yes, show hint ${i + 1}`, 'btn btn-teal', () => reveal(h, i));
      const no = button('Not yet', 'btn btn-ghost not-yet', () => { delete confirming[h.id]; refresh(h, `tier-btn-${h.id}`); });
      row.append(yes, no);
      li.append(row);
    } else if (i === shown) {
      const b = button(`Show hint ${i + 1}`, 'btn tier-btn', () => { confirming[h.id] = i; refresh(h, `tier-yes-${h.id}`); });
      b.id = `tier-btn-${h.id}`;
      b.insertAdjacentHTML('beforeend', ` <span class="tier-sub">(${esc(t.name)})</span>`);
      li.append(b);
    } else {
      li.classList.add('is-locked');
      li.innerHTML = `<span aria-hidden="true">🔒</span> ${esc(label)} <span class="muted small">(open hint ${i} first)</span>`;
    }
    ol.append(li);
  });

  // the confirm "Yes" button gets a stable id for focus handling
  const yes = ol.querySelector('.is-confirm .btn-teal');
  if (yes) yes.id = `tier-yes-${h.id}`;
  body.replaceChildren(ol);
}

function reveal(h, i) {
  const s = loadState();
  s.hintsShown = { ...(s.hintsShown || {}) };
  s.hintsShown[h.id] = Math.max(Number(s.hintsShown[h.id]) || 0, i + 1);
  saveState(s);
  delete confirming[h.id];
  refresh(h, null, i);
}

/** Re-render one puzzle's tiers in place (keeps scroll position), then move focus sensibly. */
function refresh(h, focusId, revealedIndex) {
  const card = $(h.id);
  const body = card?.querySelector('.hint-body');
  if (!body) return render();
  fillTiers(body, h);
  if (revealedIndex != null) {
    const txt = body.querySelectorAll('.tier-text')[revealedIndex];
    txt?.closest('.tier')?.classList.add('just-opened');
    txt?.focus({ preventScroll: true });
    txt?.closest('.tier')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (focusId) {
    $(focusId)?.focus();
  }
}

function button(text, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function openAndScroll(id, smooth) {
  const target = id && $(id);
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
