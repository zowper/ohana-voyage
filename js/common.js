// Night of ʻOhana — small helpers shared by all pages (no secrets here).
// Client state per planning/06_WEBSITE_SPEC.md §Client State:
//   localStorage["ohana"] = { me: playerId, passcode, unlocked: { chNN: "<answer the crew entered>", … } }

const STORE_KEY = 'ohana';

export function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { me: s.me || null, passcode: s.passcode || null, unlocked: s.unlocked || {}, ...s };
  } catch {
    return { me: null, passcode: null, unlocked: {} };
  }
}

export function saveState(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(STORE_KEY);
}

/** Fetch a JSON file from dist/data/ (always revalidate so live updates show up). */
const jsonCache = new Map();
export function loadData(name) {
  if (!jsonCache.has(name)) {
    jsonCache.set(name, fetch(`data/${name}`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${name} (${r.status})`);
      return r.json();
    }));
  }
  return jsonCache.get(name);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Map a roster token label ("Tree (shared with Julie)") to an icon slug + emoji fallback. */
const TOKENS = [
  [/paddle/i, 'paddle', '🚣'],
  [/bird/i, 'bird', '🐦'],
  [/tree/i, 'tree', '🌳'],
  [/wave/i, 'wave', '🌊'],
  [/conch|shell/i, 'conch', '🐚'],
  [/flower|flute/i, 'flower', '🌺'],
  [/star/i, 'star', '⭐'],
  [/island/i, 'island', '🏝️'],
  [/canoe/i, 'canoe', '🛶'],
];
export function tokenInfo(label) {
  for (const [re, slug, emoji] of TOKENS) if (re.test(label || '')) return { slug, emoji };
  return { slug: null, emoji: '✦' };
}

/** <img> that removes itself if the file doesn't exist yet (illustrations arrive in TODO 6.1). */
export function optionalImg(src, alt, onFail) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => { img.remove(); onFail?.(); });
  return img;
}

/** Build one crew card element. `member` = { id, name, role, station?, publicText, token? } */
export function crewCard(member, { special = false } = {}) {
  const card = document.createElement('article');
  card.className = 'card crew-card' + (special ? ' special' : '');
  card.id = `crew-${member.id}`;

  const top = document.createElement('div');
  top.className = 'crew-top';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = (member.name || '?').trim().charAt(0).toUpperCase();
  avatar.append(optionalImg(`assets/crew/${member.id}.webp`, ''));
  const head = document.createElement('div');
  head.innerHTML = `<h3 class="crew-name">${esc(member.name)}</h3><p class="crew-role">${esc(member.role)}</p>`;
  top.append(avatar, head);
  card.append(top);

  if (member.publicText) {
    const p = document.createElement('p');
    p.className = 'crew-text';
    p.textContent = member.publicText;
    card.append(p);
  }

  const meta = document.createElement('div');
  meta.className = 'crew-meta';
  if (member.station != null) {
    meta.insertAdjacentHTML('beforeend', `<span class="chip chip-station" title="Station number">Station ${esc(member.station)}</span>`);
  }
  if (member.token) {
    const { slug, emoji } = tokenInfo(member.token);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.title = 'Shell token';
    const ico = document.createElement('span');
    ico.className = 'ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = emoji;
    if (slug) {
      const img = optionalImg(`assets/tokens/${slug}.webp`, '', () => {
        const svg = optionalImg(`assets/tokens/${slug}.svg`, '', () => chip.prepend(ico));
        chip.prepend(svg);
      });
      chip.append(img);
    } else {
      chip.append(ico);
    }
    chip.append(document.createTextNode(member.token));
    meta.append(chip);
  }
  if (meta.childElementCount) card.append(meta);
  return card;
}

/** Wire the footer "Reset this device" button (present on every page). */
export function initFooter() {
  const btn = document.getElementById('reset-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (confirm('Reset this device? This forgets your login and every unlocked chapter on this phone/computer. (Your crew\'s progress on other devices is not affected.)')) {
      resetState();
      location.reload();
    }
  });
}

/** Header login link: "Log in" → "Name's orders" once logged in. */
export async function initHeader() {
  const link = document.getElementById('login-link');
  if (!link) return;
  const { me } = loadState();
  if (!me) return;
  try {
    const pub = await loadData('public.json');
    const p = pub.roster.find((r) => r.id === me);
    if (p) link.textContent = `${p.name}'s orders`;
  } catch { /* keep default label */ }
}
