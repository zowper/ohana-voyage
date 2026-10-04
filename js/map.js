// Night of ʻOhana — map.html: TV mode voyage map and big narration display.
// (PUBLISHED FILE: keep comments free of answers, passcodes and surprises.)
//
// Shows our voyage from Hawaiʻi to Carter Island on a large navigational chart.
// As chapters unlock, the voyaging vessel advances along the wayfinding track,
// and the current chapter narration renders in large, TV-friendly type.

import { loadState, loadData, esc, optionalImg, initFooter, initHeader } from './common.js';
import { openUnlockedChapters, tryCode, chNum } from './unlock.js';

initFooter();
initHeader();

const $ = (id) => document.getElementById(id);

// Waypoint coordinates and nautical mile benchmarks along the Pacific route.
// Follows the authentic voyaging arc: leaving Maui, easting through trade winds,
// crossing the Doldrums at the equator, then south toward Carter Island.
const WAYPOINTS = {
  ch00: { x: 430, y: 130, nm: 0, title: 'The Invitation', label: 'Honolua Bay' },
  ch01: { x: 430, y: 175, nm: 0, title: 'Boarding', label: 'Boarding' },
  ch02: { x: 475, y: 270, nm: 250, title: 'The Logbook Opens', label: 'The Logbook' },
  ch03: { x: 535, y: 380, nm: 500, title: 'Those Who Sailed Before', label: 'Sailed Before' },
  ch04: { x: 600, y: 510, nm: 800, title: 'The Landfall Feast', label: 'Trade Winds' },
  ch05: { x: 570, y: 680, nm: 1250, title: 'A Song for the Doldrums', label: 'The Doldrums' },
  ch06: { x: 510, y: 840, nm: 1600, title: 'Friends Who Sail With Us', label: 'South Pacific' },
  ch07: { x: 460, y: 980, nm: 1950, title: 'Reading the Stars', label: 'Southern Skies' },
  ch08: { x: 425, y: 1100, nm: 2250, title: 'A Voice From a Distant Island', label: 'Distant Island' },
  ch09: { x: 395, y: 1180, nm: 2450, title: 'Rebuilding the Canoe', label: 'Reef Waters' },
  ch10: { x: 375, y: 1250, nm: 2500, title: 'Landfall', label: 'Carter Island' },
};

const CHAPTER_ORDER = ['ch00', 'ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06', 'ch07', 'ch08', 'ch09', 'ch10'];

let pub = null;
let chapters = new Map(); // chId → decrypted data
const hintIndex = new Map(); // chId → [hintId…]

let selectedCh = 'ch00';
let furthestCh = 'ch00';
let isShortNarration = false;

// ---------- Initialization ----------
async function main() {
  try {
    ({ chapters, pub } = await openUnlockedChapters());
  } catch (err) {
    console.error(err);
    $('story-prose').innerHTML = '<p class="msg-error">The voyage records could not be loaded. Please refresh.</p>';
    return;
  }

  // Load hints index for the "Stuck?" links
  try {
    const hintBlobs = await loadData('hints.json');
    for (const [hid, h] of Object.entries(hintBlobs)) {
      if (!hintIndex.has(h.unlockedBy)) hintIndex.set(h.unlockedBy, []);
      hintIndex.get(h.unlockedBy).push(hid);
    }
  } catch { /* no hints */ }

  computeFurthest();
  selectedCh = furthestCh;

  initUI();
  renderAll();
  document.body.dataset.ready = 'true';

  // Listen for storage updates across tabs/devices on the same host
  window.addEventListener('storage', onStorageChange);
}

function computeFurthest() {
  furthestCh = 'ch00';
  for (const id of CHAPTER_ORDER) {
    if (id === 'ch00' || chapters.has(id)) {
      furthestCh = id;
    }
  }
}

function getChapterData(id) {
  if (id === 'ch00') {
    return pub?.ch00 || {
      id: 'ch00',
      title: 'The Invitation',
      narrationHtml: '<p>Our voyaging vessel waits at Carter Island. When the crew discovers their first code, type it in the box below to embark.</p>',
      narrationShortHtml: '<p>Our voyage waits at Carter Island. Enter your crew’s first code to begin.</p>',
    };
  }
  return chapters.get(id) || null;
}

// ---------- UI Setup & Listeners ----------
function initUI() {
  // Watercolor map backdrop (TODO 6.2)
  const bgImg = $('svg-bg-img');
  if (bgImg) {
    const testImg = new Image();
    testImg.onload = () => { bgImg.style.display = 'inline'; };
    testImg.onerror = () => { bgImg.style.display = 'none'; };
    testImg.src = 'assets/img/map.webp';
  }

  // Top toolbar controls
  $('fullscreen-toggle-btn')?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenBtn);

  $('audio-toggle-btn')?.addEventListener('click', toggleOceanAudio);

  // Mobile tabs
  $('tab-map')?.addEventListener('click', () => switchTab('map'));
  $('tab-story')?.addEventListener('click', () => switchTab('story'));

  // Stepper buttons
  $('prev-ch-btn')?.addEventListener('click', () => stepChapter(-1));
  $('next-ch-btn')?.addEventListener('click', () => stepChapter(1));
  $('latest-ch-btn')?.addEventListener('click', () => {
    selectedCh = furthestCh;
    renderAll();
    scrollStoryTop();
  });

  $('chapter-select')?.addEventListener('change', (e) => {
    selectedCh = e.target.value;
    renderAll();
    scrollStoryTop();
  });

  // Short narration toggle
  $('story-toggle-btn')?.addEventListener('click', () => {
    isShortNarration = !isShortNarration;
    renderStoryText();
  });

  // Waypoints click & keyboard handling
  for (const id of CHAPTER_ORDER) {
    const wp = $(`wp-${id}`);
    if (!wp) continue;
    wp.addEventListener('click', () => onWaypointClick(id));
    wp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onWaypointClick(id);
      }
    });
  }

  // Corner Answer Dock Form
  $('dock-form')?.addEventListener('submit', onCodeSubmit);
  $('dock-toggle-btn')?.addEventListener('click', toggleDock);

  // Keyboard navigation for TV remotes / keyboards
  window.addEventListener('keydown', onKeyDown);
}

function onWaypointClick(id) {
  const isAvailable = id === 'ch00' || chapters.has(id);
  if (isAvailable) {
    selectedCh = id;
    renderAll();
    // On small screens, auto-switch to story view when a waypoint is tapped
    if (window.innerWidth < 900) switchTab('story');
    scrollStoryTop();
  } else {
    setDockMsg(`Chapter ${chNum(id)} is still over the horizon. Solve earlier puzzles to sail here!`, 'muted');
    shake($('map-card'));
  }
}

function stepChapter(dir) {
  const unlocked = CHAPTER_ORDER.filter((id) => id === 'ch00' || chapters.has(id));
  const idx = unlocked.indexOf(selectedCh);
  if (idx === -1) return;
  const nextIdx = idx + dir;
  if (nextIdx >= 0 && nextIdx < unlocked.length) {
    selectedCh = unlocked[nextIdx];
    renderAll();
    scrollStoryTop();
  }
}

function scrollStoryTop() {
  const card = $('narration-card');
  if (card) card.scrollTop = 0;
}

function onKeyDown(e) {
  // Don't intercept if user is typing into an input
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    stepChapter(-1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    stepChapter(1);
  } else if (e.key === 'Home') {
    e.preventDefault();
    selectedCh = 'ch00';
    renderAll();
  } else if (e.key === 'End') {
    e.preventDefault();
    selectedCh = furthestCh;
    renderAll();
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
  } else if (e.key === 'm' || e.key === 'M') {
    toggleOceanAudio();
  } else if (e.key === 's' || e.key === 'S') {
    isShortNarration = !isShortNarration;
    renderStoryText();
  }
}

// ---------- Render Functions ----------
function renderAll() {
  renderMap();
  renderNarration();
  renderProgress();
  renderDropdown();
}

function renderProgress() {
  const wp = WAYPOINTS[furthestCh] || WAYPOINTS.ch00;
  const num = chNum(furthestCh);
  const chip = $('voyage-progress-chip');
  if (!chip) return;

  if (furthestCh === 'ch00') {
    chip.textContent = '🌅 Honolua Bay · Ready to Sail';
  } else if (furthestCh === 'ch10') {
    chip.textContent = '🎉 Carter Island · Landfall Reached (2,500 nm)';
  } else {
    chip.textContent = `Chapter ${num} of 10 · ${wp.nm} / 2,500 nm`;
  }
}

function renderDropdown() {
  const sel = $('chapter-select');
  if (!sel) return;
  const unlocked = CHAPTER_ORDER.filter((id) => id === 'ch00' || chapters.has(id));
  sel.innerHTML = unlocked.map((id) => {
    const data = getChapterData(id);
    const n = chNum(id);
    const label = id === 'ch00' ? 'Ch 0: The Invitation' : `Ch ${n}: ${data?.title || WAYPOINTS[id]?.title || id}`;
    return `<option value="${id}" ${id === selectedCh ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function renderMap() {
  // Update waypoints visual states
  for (const id of CHAPTER_ORDER) {
    const wpEl = $(`wp-${id}`);
    if (!wpEl) continue;
    const isUnlocked = id === 'ch00' || chapters.has(id);
    const isSelected = id === selectedCh;
    const isFurthest = id === furthestCh;

    wpEl.classList.toggle('is-unlocked', isUnlocked);
    wpEl.classList.toggle('is-locked', !isUnlocked);
    wpEl.classList.toggle('is-selected', isSelected);
    wpEl.classList.toggle('is-furthest', isFurthest);
    wpEl.setAttribute('aria-pressed', String(isSelected));
  }

  // Update sailed track path
  const sailedPath = $('route-sailed');
  if (sailedPath) {
    const points = [];
    for (const id of CHAPTER_ORDER) {
      if (id === 'ch00' || chapters.has(id)) {
        points.push(WAYPOINTS[id]);
        if (id === furthestCh) break;
      }
    }
    if (points.length <= 1) {
      sailedPath.setAttribute('d', `M ${WAYPOINTS.ch00.x} ${WAYPOINTS.ch00.y}`);
    } else {
      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        d += ` Q ${midX} ${midY} ${curr.x} ${curr.y}`;
      }
      sailedPath.setAttribute('d', d);
    }
  }

  // Advance the voyaging canoe to selected waypoint
  const canoe = $('canoe-marker');
  const targetPt = WAYPOINTS[selectedCh] || WAYPOINTS.ch00;
  if (canoe && targetPt) {
    canoe.setAttribute('transform', `translate(${targetPt.x}, ${targetPt.y})`);
  }
}

function renderNarration() {
  const data = getChapterData(selectedCh);
  const n = chNum(selectedCh);

  // Kicker
  const kicker = $('story-kicker');
  if (kicker) {
    kicker.textContent = selectedCh === 'ch00'
      ? 'The Invitation · Honolua Bay'
      : `Chapter ${n} · The Voyage Home`;
  }

  // Title
  const title = $('story-title');
  if (title) title.textContent = data?.title || WAYPOINTS[selectedCh]?.title || 'Our Voyage';

  // Artwork
  const artWrap = $('story-art-wrap');
  if (artWrap) {
    artWrap.innerHTML = '';
    const imgUrl = data?.image || `assets/img/${selectedCh}.webp`;
    const img = optionalImg(imgUrl, '', () => { artWrap.style.display = 'none'; });
    artWrap.append(img);
    artWrap.style.display = 'block';
  }

  renderStoryText();

  // Short version button row
  const toggleRow = $('story-toggle-row');
  const toggleBtn = $('story-toggle-btn');
  if (toggleRow && toggleBtn) {
    if (data?.narrationShortHtml) {
      toggleRow.style.display = 'block';
      toggleBtn.textContent = isShortNarration ? 'Show the full story' : 'Show the short version';
      toggleBtn.setAttribute('aria-pressed', String(isShortNarration));
    } else {
      toggleRow.style.display = 'none';
    }
  }

  // "On deck now" crew action box
  const deckBox = $('story-on-deck');
  if (deckBox) {
    if (data?.bodyHtml) {
      deckBox.innerHTML = data.bodyHtml;
      deckBox.style.display = 'block';
    } else {
      deckBox.innerHTML = '';
      deckBox.style.display = 'none';
    }
  }

  // Hint link
  const hintRow = $('story-hint-row');
  const hintLink = $('story-hint-link');
  if (hintRow && hintLink) {
    const hintIds = hintIndex.get(selectedCh);
    if (hintIds?.length) {
      hintRow.style.display = 'block';
      hintLink.href = `hints.html#${esc(hintIds.slice().sort()[0])}`;
    } else {
      hintRow.style.display = 'none';
    }
  }

  // Stepper Prev/Next button states
  const unlocked = CHAPTER_ORDER.filter((id) => id === 'ch00' || chapters.has(id));
  const curIdx = unlocked.indexOf(selectedCh);
  const prevBtn = $('prev-ch-btn');
  const nextBtn = $('next-ch-btn');
  if (prevBtn) prevBtn.disabled = curIdx <= 0;
  if (nextBtn) nextBtn.disabled = curIdx >= unlocked.length - 1;
}

function renderStoryText() {
  const data = getChapterData(selectedCh);
  const prose = $('story-prose');
  if (!prose) return;

  const html = isShortNarration && data?.narrationShortHtml
    ? data.narrationShortHtml
    : (data?.narrationHtml || '<p class="muted">No log entry found for this station.</p>');

  prose.innerHTML = html;
}

// ---------- Corner Answer Dock ----------
let busy = false;
async function onCodeSubmit(e) {
  e.preventDefault();
  if (busy) return;

  const input = $('dock-input');
  const btn = $('dock-btn');
  if (!input || !btn) return;

  busy = true;
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Checking…';
  setDockMsg('Checking the stars…', 'muted');

  try {
    const res = await tryCode(input.value);
    if (res.status === 'empty') {
      setDockMsg('Type a code discovered by the crew.', 'error');
      input.focus();
    } else if (res.status === 'already') {
      const n = res.ids.map(chNum).join(' & ');
      setDockMsg(`Your crew already unlocked Chapter ${n}. ⛵`, 'ok');
      selectedCh = res.ids[0];
      renderAll();
      input.value = '';
    } else if (res.status === 'wrong') {
      setDockMsg('That’s not quite it. Check your code and try again.', 'error');
      shake($('code-dock'));
      input.select();
    } else {
      // Success: newly unlocked chapters!
      for (const { id, data } of res.unlocked) chapters.set(id, data);
      computeFurthest();
      const first = res.unlocked[0];
      selectedCh = first.id;
      setDockMsg(`🎉 Chapter ${chNum(first.id)} unlocked: ${first.data.title}!`, 'ok');
      input.value = '';
      renderAll();
      scrollStoryTop();
    }
  } catch (err) {
    console.error(err);
    setDockMsg('Could not verify with the logbook. Check your connection.', 'error');
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

function setDockMsg(msg, kind) {
  const el = $('dock-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'dock-msg' + (kind === 'error' ? ' msg-error' : kind === 'ok' ? ' msg-ok' : ' muted');
}

function toggleDock() {
  const dock = $('code-dock');
  const btn = $('dock-toggle-btn');
  const icon = $('dock-toggle-icon');
  if (!dock || !btn) return;
  const isCollapsed = dock.classList.toggle('is-collapsed');
  btn.setAttribute('aria-expanded', String(!isCollapsed));
  if (icon) icon.textContent = isCollapsed ? '+' : '−';
}

function shake(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

// ---------- Cross-Tab Storage Sync ----------
async function onStorageChange(e) {
  if (e.key !== 'ohana') return;
  try {
    const { chapters: reloaded } = await openUnlockedChapters();
    chapters = reloaded;
    const oldFurthest = furthestCh;
    computeFurthest();
    if (furthestCh !== oldFurthest) {
      selectedCh = furthestCh;
      renderAll();
      setDockMsg(`⛵ Progress on another device advanced our journey to Chapter ${chNum(furthestCh)}!`, 'ok');
    }
  } catch (err) {
    console.warn('Could not sync storage:', err);
  }
}

// ---------- Mobile Tab Switcher ----------
function switchTab(tab) {
  const mapCard = $('map-card');
  const storyCard = $('narration-card');
  const tabMap = $('tab-map');
  const tabStory = $('tab-story');

  if (tab === 'map') {
    mapCard?.classList.remove('tab-hidden');
    storyCard?.classList.add('tab-hidden');
    tabMap?.classList.add('is-active');
    tabMap?.setAttribute('aria-selected', 'true');
    tabStory?.classList.remove('is-active');
    tabStory?.setAttribute('aria-selected', 'false');
  } else {
    storyCard?.classList.remove('tab-hidden');
    mapCard?.classList.add('tab-hidden');
    tabStory?.classList.add('is-active');
    tabStory?.setAttribute('aria-selected', 'true');
    tabMap?.classList.remove('is-active');
    tabMap?.setAttribute('aria-selected', 'false');
  }
}

// ---------- Fullscreen Mode (TV presentation) ----------
function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

function updateFullscreenBtn() {
  const isFs = Boolean(document.fullscreenElement);
  const btn = $('fullscreen-toggle-btn');
  const label = $('fs-btn-label');
  if (btn) btn.setAttribute('aria-pressed', String(isFs));
  if (label) label.textContent = isFs ? 'Exit Fullscreen' : 'Fullscreen';
  document.body.classList.toggle('is-fullscreen', isFs);
}

// ---------- Web Audio API: Ambient Ocean Surf ----------
let audioCtx = null;
let oceanGain = null;
let isAudioPlaying = false;

function toggleOceanAudio() {
  if (isAudioPlaying) {
    stopOceanAudio();
  } else {
    startOceanAudio();
  }
}

function startOceanAudio() {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // Build synthesized rhythmic ocean surf
    // 1. Generate 5 seconds of pinkish noise
    const bufferSize = audioCtx.sampleRate * 5;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0555179;
      b1 = 0.96300 * b1 + white * 0.0750759;
      b2 = 0.57000 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2) * 0.5;
    }

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // 2. Lowpass and Bandpass filters simulating deep water swells
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(320, audioCtx.currentTime);

    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(450, audioCtx.currentTime);
    bandpass.Q.setValueAtTime(1.2, audioCtx.currentTime);

    // 3. Modulate filter frequency to simulate swells washing up and receding
    const lfo = audioCtx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, audioCtx.currentTime); // ~8 sec per wave cycle
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.setValueAtTime(180, audioCtx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);

    // 4. Modulate wave volume in sync
    const waveGain = audioCtx.createGain();
    waveGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    const ampLfoGain = audioCtx.createGain();
    ampLfoGain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    lfo.connect(ampLfoGain);
    ampLfoGain.connect(waveGain.gain);

    // 5. Master volume node with smooth fade-in
    oceanGain = audioCtx.createGain();
    oceanGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    oceanGain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 1.5);

    // Routing
    whiteNoise.connect(lowpass);
    lowpass.connect(bandpass);
    bandpass.connect(waveGain);
    waveGain.connect(oceanGain);
    oceanGain.connect(audioCtx.destination);

    whiteNoise.start();
    lfo.start();

    isAudioPlaying = true;
    updateAudioBtn(true);
  } catch (e) {
    console.warn('Could not start ambient ocean audio:', e);
  }
}

function stopOceanAudio() {
  if (!audioCtx || !oceanGain) return;
  try {
    oceanGain.gain.setValueAtTime(oceanGain.gain.value, audioCtx.currentTime);
    oceanGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.0);
    setTimeout(() => {
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.suspend();
      isAudioPlaying = false;
      updateAudioBtn(false);
    }, 1000);
  } catch {
    isAudioPlaying = false;
    updateAudioBtn(false);
  }
}

function updateAudioBtn(playing) {
  const btn = $('audio-toggle-btn');
  const label = $('audio-btn-label');
  if (btn) {
    btn.setAttribute('aria-pressed', String(playing));
    btn.classList.toggle('is-playing', playing);
  }
  if (label) label.textContent = playing ? 'Ocean Sound: On' : 'Ocean Sound: Off';
}

main();
