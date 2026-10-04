// Night of ʻOhana — public home page: hero, Ch 0 intro, crew grid.
// (PUBLISHED FILE: keep comments free of secrets/surprises. Any extra crew card comes
// only from decrypted chapter data that this device has already unlocked.)

import { loadState, loadData, crewCard, initFooter, initHeader } from './common.js';
import { secrets, tryDecryptJSON } from './crypto.js';

initFooter();
initHeader();

// Swap in the watercolor hero once it exists (TODO 6.1); the CSS/SVG sunset is the fallback.
const hero = document.getElementById('hero');
const heroImg = new Image();
heroImg.onload = () => {
  hero.style.setProperty('--hero-img', `url("${heroImg.src}")`);
  hero.classList.add('has-image');
};
heroImg.src = 'assets/img/ch00.webp';

async function main() {
  let pub;
  try {
    pub = await loadData('public.json');
  } catch (e) {
    document.getElementById('crew-grid').innerHTML =
      '<p class="msg-error">The crew list could not be loaded. Check your connection and refresh.</p>';
    console.error(e);
    return;
  }

  // Ch 0 (public). The static fallback in index.html stays if ch00 hasn't been written yet.
  if (pub.ch00) {
    if (pub.ch00.title) document.getElementById('intro-title').textContent = pub.ch00.title;
    if (pub.ch00.narrationHtml) document.getElementById('intro-body').innerHTML = pub.ch00.narrationHtml;
  }

  const grid = document.getElementById('crew-grid');
  grid.replaceChildren(...[...pub.roster].sort((a, b) => a.station - b.station).map((m) => crewCard(m)));
  document.getElementById('crew-count').textContent = String(pub.roster.length);

  await addSurpriseCrew(grid);
}

async function addSurpriseCrew(grid) {
  const unlocked = loadState().unlocked || {};
  const ids = Object.keys(unlocked).sort();
  if (!ids.length) return;
  try {
    const chapters = await loadData('chapters.json');
    for (const id of ids) {
      if (!chapters[id]) continue;
      const ch = await tryDecryptJSON(secrets.chapter(unlocked[id]), chapters[id]);
      if (!ch?.crewCard) continue;
      grid.append(crewCard(ch.crewCard, { special: true }));
      const count = document.getElementById('crew-count');
      count.textContent = String(Number(count.textContent) + 1);
    }
  } catch (e) {
    console.warn('Extra crew card unavailable:', e);
  }
}

main();
