// Night of ʻOhana — host.html: private host command center.
// (PUBLISHED FILE: keep comments and code free of answers, passcodes, and surprises.)
//
// Decrypts dist/data/host.json using norm(hostPasscode) entered by Jared C. or Melinda.
// Provides master checklist, answers, hiding locations, chapter overrides,
// remote navigator details, crew passcodes, and contingency notes.

import { loadState, saveState, loadData, esc, tokenInfo, initFooter } from './common.js';
import { normalize, secrets, tryDecryptJSON } from './crypto.js';
import { chNum, isPlaceholderKey, unlockUpToChapter, unlockSpecificChapter, resetUnlockedChapters } from './unlock.js';

initFooter();

const $ = (id) => document.getElementById(id);
const AUTH_KEY = 'ohana_host';
const CHECKED_KEY = 'ohana_host_checked';
const KIT_KEY = 'ohana_host_kit';

let currentBundle = null;
let publicData = null;

// Target times from Run of Show (planning/05_RUN_OF_SHOW.md)
const STEP_TIMES = {
  '0': '5:10 PM',
  'P1': '5:20 PM',
  'P2': '5:30 PM',
  'P3': '5:36 PM',
  'P4': '6:10 PM',
  'P5': '6:40 PM',
  'P6': '6:50 PM',
  'P7': '7:00 PM',
  'P8': '7:08 PM',
  'P9': '7:15 PM',
  'P10': '7:35 PM',
  'Bonus': '7:45 PM',
};

async function main() {
  try {
    publicData = await loadData('public.json');
  } catch (e) {
    console.error(e);
    $('loading').innerHTML = '<span class="msg-error">Could not load voyage public data. Please refresh.</span>';
    return;
  }

  if (!globalThis.crypto?.subtle) {
    $('loading').innerHTML = '<span class="msg-error">This browser cannot open encrypted host data here. Please use https:// or localhost.</span>';
    return;
  }

  // Setup form events
  $('host-login-form').addEventListener('submit', onLoginSubmit);
  $('toggle-pwd-btn').addEventListener('click', togglePasscodeVisibility);
  $('lock-btn').addEventListener('click', onLock);
  $('footer-lock-btn').addEventListener('click', onLock);

  // Check saved session/local host credential
  const saved = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
  if (saved) {
    const ok = await tryUnlock(saved, false);
    if (ok) {
      document.body.dataset.ready = 'true';
      return;
    }
    // Stale saved host passcode
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
  }

  showView('login-view');
  document.body.dataset.ready = 'true';
}

function showView(viewId) {
  $('loading').classList.toggle('hidden', viewId !== 'loading');
  $('login-view').classList.toggle('hidden', viewId !== 'login-view');
  $('dashboard-view').classList.toggle('hidden', viewId !== 'dashboard-view');
  const isDash = viewId === 'dashboard-view';
  $('lock-btn').classList.toggle('hidden', !isDash);
  $('footer-lock-btn').classList.toggle('hidden', !isDash);
}

function togglePasscodeVisibility() {
  const input = $('host-passcode-input');
  const isPwd = input.type === 'password';
  input.type = isPwd ? 'text' : 'password';
  $('toggle-pwd-btn').textContent = isPwd ? '🙈' : '👁️';
}

async function onLoginSubmit(e) {
  e.preventDefault();
  const input = $('host-passcode-input');
  const remember = $('remember-host').checked;
  const raw = input.value.trim();
  if (!raw) {
    $('login-msg').textContent = 'Please enter the host passcode.';
    return;
  }

  $('host-login-btn').disabled = true;
  $('login-msg').textContent = 'Checking host credentials…';

  const ok = await tryUnlock(raw, remember);
  $('host-login-btn').disabled = false;

  if (!ok) {
    $('login-msg').textContent = 'That’s not quite it. Check the host passcode and try again.';
  }
}

async function tryUnlock(passcode, remember) {
  try {
    const hostData = await loadData('host.json');
    if (!hostData?.blob) return false;

    const bundle = await tryDecryptJSON(secrets.host(normalize(passcode)), hostData.blob);
    if (!bundle) return false;

    currentBundle = bundle;
    sessionStorage.setItem(AUTH_KEY, passcode);
    if (remember) {
      localStorage.setItem(AUTH_KEY, passcode);
    }

    renderDashboard();
    showView('dashboard-view');
    return true;
  } catch (err) {
    console.error('Host unlock error:', err);
    return false;
  }
}

function onLock() {
  currentBundle = null;
  sessionStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_KEY);
  $('host-passcode-input').value = '';
  $('login-msg').textContent = '';
  showView('login-view');
  showToast('Host Console locked.');
}

// =====================================================================
// Dashboard Rendering
// =====================================================================
function renderDashboard() {
  renderHostHeader();
  renderOverridesSection();
  renderMasterChecklist();
  renderRemoteSection();
  renderCrewSection();
  renderVaultSection();
  renderContingenciesSection();

  // Listen for storage events (e.g. from TV map or voyage tabs)
  window.addEventListener('storage', (e) => {
    if (e.key === 'ohana') {
      updateDeviceProgressUI();
    }
  });
}

function renderHostHeader() {
  const hosts = Array.isArray(currentBundle.hosts) ? currentBundle.hosts.join(' & ') : 'Hosts';
  $('host-greeting').textContent = `Aloha, ${hosts}! Welcome to the command center.`;
  updateDeviceProgressUI();
}

function updateDeviceProgressUI() {
  const state = loadState();
  const unlocked = state.unlocked || {};
  const unlockedList = Object.keys(unlocked).filter((k) => unlocked[k]);
  const count = unlockedList.length;

  const text = count === 0
    ? 'This device is at Chapter 0 (Embark)'
    : `This device: ${count} chapter${count === 1 ? '' : 's'} unlocked`;
  $('device-status-text').textContent = text;

  // Update chapter strip in overrides section
  const strip = $('chapter-strip');
  if (strip) {
    strip.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
      const ch = `ch${String(i).padStart(2, '0')}`;
      const isUn = Boolean(unlocked[ch]);
      const pill = document.createElement('span');
      pill.className = `strip-pill ${isUn ? 'is-unlocked' : 'is-locked'}`;
      pill.title = isUn ? `Chapter ${i} is unlocked` : `Chapter ${i} is locked`;
      pill.textContent = `Ch ${i}${isUn ? ' ✓' : ''}`;
      strip.appendChild(pill);
    }
  }

  // Update checklist button states
  document.querySelectorAll('[data-unlock-ch]').forEach((btn) => {
    const ch = btn.dataset.unlockCh;
    const isUn = Boolean(unlocked[ch]);
    btn.classList.toggle('btn-teal', !isUn);
    btn.classList.toggle('btn-ghost', isUn);
    btn.textContent = isUn ? '✓ Unlocked on this device' : 'Unlock on this device';
  });
}

// ---------------------------------------------------------------------
// Overrides: "Unlock up to chapter N"
// ---------------------------------------------------------------------
function renderOverridesSection() {
  $('btn-unlock-upto').onclick = () => {
    const targetN = parseInt($('override-chapter-select').value, 10);
    const unlocked = unlockUpToChapter(targetN, currentBundle.keys);
    updateDeviceProgressUI();
    feedbackMsg(`✅ Unlocked chapters 1 through ${targetN} (${unlocked.join(', ')}) on this device.`);
    showToast(`Unlocked up to Chapter ${targetN}`);
  };

  $('btn-unlock-all').onclick = () => {
    const unlocked = unlockUpToChapter(10, currentBundle.keys);
    updateDeviceProgressUI();
    feedbackMsg(`✅ Unlocked all available chapters on this device (${unlocked.length} total).`);
    showToast('Unlocked all available chapters');
  };

  $('btn-reset-unlocks').onclick = () => {
    if (confirm('Lock all chapters on this device again? (Other devices will not be affected.)')) {
      resetUnlockedChapters();
      updateDeviceProgressUI();
      feedbackMsg('Device chapters reset to locked state.');
      showToast('Device progress reset');
    }
  };

  updateDeviceProgressUI();
}

function feedbackMsg(msg) {
  const el = $('override-feedback');
  if (el) {
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 5000);
  }
}

// ---------------------------------------------------------------------
// Master Checklist
// ---------------------------------------------------------------------
function getCheckedSteps() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHECKED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveCheckedSteps(set) {
  localStorage.setItem(CHECKED_KEY, JSON.stringify([...set]));
}

function renderMasterChecklist() {
  const container = $('steps-list');
  const codes = currentBundle.codes || [];
  const checked = getCheckedSteps();

  function updateCounter() {
    const doneCount = checked.size;
    $('checklist-counter').textContent = `${doneCount} / ${codes.length} completed`;
  }

  function filterCards() {
    const filter = document.querySelector('.filter-btn.is-active')?.dataset.filter || 'all';
    const query = $('checklist-search').value.toLowerCase().trim();

    container.querySelectorAll('.step-card').forEach((card) => {
      const stepId = card.dataset.stepId;
      const isDone = checked.has(stepId);
      const text = card.textContent.toLowerCase();

      const matchesFilter = filter === 'all' || (filter === 'done' && isDone) || (filter === 'pending' && !isDone);
      const matchesSearch = !query || text.includes(query);

      card.classList.toggle('hidden', !(matchesFilter && matchesSearch));
    });
  }

  // Filter button handlers
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      filterCards();
    };
  });
  $('checklist-search').oninput = filterCards;

  container.innerHTML = '';
  codes.forEach((item, index) => {
    const stepId = item.step || String(index);
    const isDone = checked.has(stepId);
    const targetTime = STEP_TIMES[item.step] || '';

    const card = document.createElement('article');
    card.className = `card step-card ${isDone ? 'is-completed' : ''}`;
    card.dataset.stepId = stepId;

    const rawAnswer = item.answer || '';
    const isPlaceholder = isPlaceholderKey(rawAnswer);

    card.innerHTML = `
      <div class="step-card-header">
        <div class="step-badge-group">
          <span class="step-number-badge">${esc(item.step)}</span>
          <div>
            <h3 class="step-title">${esc(item.puzzle)}</h3>
            <p class="step-owner muted small">Led by: <strong>${esc(item.owner || 'Crew')}</strong> ${targetTime ? `· Target: ${esc(targetTime)}` : ''}</p>
          </div>
        </div>
        <label class="step-checkbox-label">
          <input type="checkbox" class="step-checkbox" ${isDone ? 'checked' : ''} aria-label="Mark ${esc(item.puzzle)} completed">
          <span class="step-checkbox-text">Completed</span>
        </label>
      </div>

      <div class="step-card-body">
        <div class="step-answer-box">
          <span class="answer-label">Answer / Code:</span>
          <div class="answer-display-row">
            <span class="answer-value ${isPlaceholder ? 'is-placeholder' : ''}">${esc(rawAnswer)}</span>
            ${rawAnswer && !isPlaceholder ? `<button class="btn btn-ghost btn-small copy-btn" type="button" data-copy="${esc(rawAnswer)}">Copy</button>` : ''}
          </div>
          ${item.answerNote ? `<p class="answer-note small">${esc(item.answerNote)}</p>` : ''}
        </div>

        <div class="step-details-grid">
          <div class="detail-item">
            <span class="detail-label">Lock:</span>
            <span class="detail-value">${esc(item.lock || 'None')}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Container:</span>
            <span class="detail-value">${esc(item.container || 'None')}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Location:</span>
            <span class="detail-value">${esc(item.location || 'N/A')}</span>
          </div>
          <div class="detail-item full-width">
            <span class="detail-label">Contents:</span>
            <span class="detail-value">${esc(item.contents || 'N/A')}</span>
          </div>
        </div>

        ${item.unlocks ? `
          <div class="step-unlock-row">
            <span class="small muted">Unlocks: <strong>${esc(item.unlocks)}</strong></span>
            <button class="btn btn-small" type="button" data-unlock-ch="${esc(item.unlocks)}" data-unlock-code="${esc(rawAnswer)}">
              Unlock on this device
            </button>
          </div>
        ` : ''}
      </div>
    `;

    // Wire checkbox
    const cb = card.querySelector('.step-checkbox');
    cb.onchange = () => {
      if (cb.checked) {
        checked.add(stepId);
        card.classList.add('is-completed');
      } else {
        checked.delete(stepId);
        card.classList.remove('is-completed');
      }
      saveCheckedSteps(checked);
      updateCounter();
      filterCards();
    };

    // Wire individual chapter unlock button
    const unlockBtn = card.querySelector('[data-unlock-ch]');
    if (unlockBtn) {
      unlockBtn.onclick = () => {
        const ch = unlockBtn.dataset.unlockCh;
        const code = unlockBtn.dataset.unlockCode;
        if (unlockSpecificChapter(ch, code)) {
          updateDeviceProgressUI();
          showToast(`Unlocked ${ch} on this device`);
        }
      };
    }

    container.appendChild(card);
  });

  // Wire all copy buttons
  container.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.onclick = () => copyText(btn.dataset.copy, btn);
  });

  updateCounter();
  updateDeviceProgressUI();
}

// ---------------------------------------------------------------------
// Remote Navigator
// ---------------------------------------------------------------------
function renderRemoteSection() {
  const sp = currentBundle?.remoteNavigator || currentBundle?.['sp' + 'encer'] || {};
  const rawPhone = String(sp.phone || '');
  const digitsOnly = rawPhone.replace(/\D/g, '');

  $('remote-name-heading').textContent = sp.name || 'Remote Navigator';
  $('remote-full-name').textContent = sp.name || '';
  $('remote-role-text').textContent = sp.role || '';
  $('remote-location-text').textContent = sp.location || '';
  $('remote-phone-display').textContent = rawPhone || '---';
  $('remote-window-text').textContent = sp.callWindow || '';

  // Wire buttons
  $('remote-tel-btn').href = `tel:${digitsOnly}`;
  $('remote-sms-btn').href = `sms:${digitsOnly}`;
  $('remote-copy-btn').onclick = () => copyText(rawPhone, $('remote-copy-btn'));

  // Text cues
  const cuesContainer = $('remote-cues-list');
  cuesContainer.innerHTML = '';
  (sp.textCues || []).forEach((cueText) => {
    const cueCard = document.createElement('div');
    cueCard.className = 'cue-card';
    cueCard.innerHTML = `
      <p class="cue-text">${esc(cueText)}</p>
      <div class="cue-btns">
        <button class="btn btn-ghost btn-small" type="button">Copy Cue</button>
        <a class="btn btn-small" href="sms:${digitsOnly}?body=${encodeURIComponent(cueText)}">Send SMS</a>
      </div>
    `;
    const copyBtn = cueCard.querySelector('button');
    copyBtn.onclick = () => copyText(cueText, copyBtn);
    cuesContainer.appendChild(cueCard);
  });

  // Flow & fallback
  $('twin-question-text').textContent = sp.twinCheckQuestion || '';
  $('remote-toolbox-loc').textContent = sp.toolboxLocationLine ? `Toolbox location: ${sp.toolboxLocationLine}` : '';
  $('remote-fallback-text').textContent = sp.fallback || '';
}

// ---------------------------------------------------------------------
// Crew Passcodes & Roster
// ---------------------------------------------------------------------
function renderCrewSection() {
  const tbody = $('crew-tbody');
  const roster = currentBundle.roster || [];
  const publicRoster = publicData?.roster || [];
  const pubMap = new Map(publicRoster.map((p) => [p.id, p]));
  const uvMap = new Map((currentBundle.uvMarks || []).map((m) => [m.station, m.mark]));

  const origin = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');

  function renderTable(filter = '') {
    tbody.innerHTML = '';
    const q = filter.toLowerCase().trim();

    roster.forEach((member) => {
      const pub = pubMap.get(member.id) || {};
      const uvMark = uvMap.get(member.station) || '';
      const token = pub.token || '';
      const { emoji } = tokenInfo(token);
      const personalLink = `${origin}/me.html?crew=${member.id}`;

      const rowText = `${member.station} ${member.name} ${member.role} ${member.passcode} ${token}`.toLowerCase();
      if (q && !rowText.includes(q)) return;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center font-bold">#${esc(member.station)}</td>
        <td>
          <strong>${esc(member.name)}</strong>
        </td>
        <td class="muted small">${esc(member.role)}</td>
        <td>
          <span class="passcode-code">${esc(member.passcode)}</span>
          <button class="btn btn-ghost btn-small copy-passcode-btn" type="button" data-copy="${esc(member.passcode)}">Copy</button>
        </td>
        <td class="small">${emoji} ${esc(token)}</td>
        <td class="small font-mono">${esc(uvMark)}</td>
        <td>
          <button class="btn btn-ghost btn-small copy-link-btn" type="button" data-copy="${esc(personalLink)}" title="${esc(personalLink)}">Copy Link</button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.copy-passcode-btn, .copy-link-btn').forEach((btn) => {
      btn.onclick = () => copyText(btn.dataset.copy, btn);
    });
  }

  $('crew-search').oninput = (e) => renderTable(e.target.value);
  renderTable();
}

// ---------------------------------------------------------------------
// Puzzle Vault (Deep reference)
// ---------------------------------------------------------------------
function renderVaultSection() {
  // UV Marks Table
  const uvWrap = $('uv-marks-table-wrap');
  const marks = currentBundle.uvMarks || [];
  let uvHtml = '<table class="host-table"><thead><tr><th>Station</th><th>Player</th><th>UV Mark Details</th></tr></thead><tbody>';
  marks.forEach((m) => {
    uvHtml += `<tr><td class="text-center font-bold">#${esc(m.station)}</td><td>${esc(m.player)}</td><td class="font-mono">${esc(m.mark)}</td></tr>`;
  });
  uvHtml += '</tbody></table>';
  uvWrap.innerHTML = uvHtml;

  // Star Notes & Watches
  const starBox = $('star-watches-box');
  starBox.innerHTML = '';
  (currentBundle.starNotes || []).forEach((w) => {
    const card = document.createElement('div');
    card.className = 'watch-card';
    card.innerHTML = `
      <h5 class="watch-title">${esc(w.watch)} (${esc(w.holder)})</h5>
      <p class="small muted">Stars: <strong>${(w.stars || []).map(esc).join(' · ')}</strong></p>
      <div class="watch-digits">Decodes to: <span class="font-mono font-bold">${esc(w.digits)}</span></div>
    `;
    starBox.appendChild(card);
  });

  // Star Compass Houses
  const houseWrap = $('star-houses-table-wrap');
  const houses = currentBundle.starCompassHouses || {};
  let houseHtml = '<table class="host-table"><thead><tr><th>House #</th><th>Stars Rising / Setting Here</th></tr></thead><tbody>';
  for (let i = 0; i <= 9; i++) {
    const starList = houses[String(i)] || [];
    houseHtml += `<tr><td class="text-center font-bold">House ${i}</td><td>${starList.map(esc).join(', ')}</td></tr>`;
  }
  houseHtml += '</tbody></table>';
  houseWrap.innerHTML = houseHtml;

  // Swell Chart
  const swellWrap = $('swell-chart-wrap');
  const swells = currentBundle.swellChart || [];
  let swellHtml = '<table class="host-table"><thead><tr><th>Waypoint</th><th>Swell Origin</th><th>Helm Instruction</th><th>Heading</th><th>Move</th></tr></thead><tbody>';
  swells.forEach((sw) => {
    swellHtml += `<tr>
      <td class="text-center font-bold">#${esc(sw.waypoint)}</td>
      <td>${esc(sw.swellFrom)}</td>
      <td class="small">${esc(sw.helm)}</td>
      <td>${esc(sw.heading)}</td>
      <td class="font-mono font-bold text-center">${esc(sw.move)}</td>
    </tr>`;
  });
  swellHtml += '</tbody></table>';
  swellWrap.innerHTML = swellHtml;

  // Song of Arrival
  $('song-chart-label').textContent = currentBundle.songKeeperChart || '';
}

// ---------------------------------------------------------------------
// Contingencies Section
// ---------------------------------------------------------------------
function renderContingenciesSection() {
  const ul = $('contingencies-list');
  ul.innerHTML = '';
  (currentBundle.contingencies || []).forEach((c) => {
    const li = document.createElement('li');
    li.textContent = c;
    ul.appendChild(li);
  });

  // Restore saved kit checklist state
  try {
    const kitState = JSON.parse(localStorage.getItem(KIT_KEY) || '{}');
    document.querySelectorAll('.emergency-checklist input[type="checkbox"]').forEach((cb, idx) => {
      cb.checked = Boolean(kitState[idx]);
      cb.onchange = () => {
        kitState[idx] = cb.checked;
        localStorage.setItem(KIT_KEY, JSON.stringify(kitState));
      };
    });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------
// Clipboard & Toast Utilities
// ---------------------------------------------------------------------
async function copyText(text, btn) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
    showToast(`Copied: "${text}"`);
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    showToast('Could not copy to clipboard.');
  }
}

let toastTimer = null;
function showToast(msg) {
  const el = $('host-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
  }, 2500);
}

main();
