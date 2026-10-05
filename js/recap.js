// Night of ʻOhana — Post-event Voyage Recap & Crew Mahalo.
// Displays the story of the voyage, crew reflections, and photo gallery placeholders.
// Strictly secret-free in plaintext: any surprise crew card is read from decrypted chapter data.

import { loadState, loadData, esc, crewCard, initHeader, initFooter, initServiceWorker } from './common.js';
import { secrets, tryDecryptJSON } from './crypto.js';

// Station reflections for each public voyager (matching public.json)
const STATION_REFLECTIONS = {
  vicki: 'Mustered the crew, kept everyone united under every sky, and wielded the Captain\'s Lantern with wisdom to reveal what was hidden in plain sight.',
  glen: 'Read the 1976 Hōkūleʻa Logbook aloud with deep reverence, and taught the crew which seabirds fly out to feed and return home to land.',
  dave: 'Reconstructed four generations of our kūpuna, honoring our family heritage and showing that every voyager stands on the shoulders of ancestors.',
  julie: 'Piece by piece, connected generations across time and uncovered the jigsaw key hidden beneath the pineapple on the captain\'s table.',
  tyson: 'Felt the deep ocean swells in the dark, deciphered the wave directions, and called out the headings that guided our canoe south.',
  sharon: 'Held the steering sweep steady through five ocean waypoints, and verified the voice of her faraway brother on the speakerphone.',
  kevin: 'Sounded the ceremonial call to embark, and filled the canoe deck with joy by playing the Song of Arrival on trumpet and piano.',
  jessie: 'Kept the tempo of our voyage, decoded the musical notes into the song-box code, and cracked the Friendship Box alongside Melinda.',
  jaredw: 'Reconstructed the 10-house Star Compass from the crew\'s celestial notes, finding the exact coordinates to reach our distant navigator.',
  daniel: 'Unlashed 100 screws with blazing speed and unmatched cheer, retrieving the master chart just in time for the final approach to Carter Island.',
};

// 12 Gallery story moments from departure to the grand reveal
const GALLERY_MOMENTS = [
  {
    title: '1. Boarding the Canoe',
    caption: 'Nelson greeting every voyager at the door with fragrant plumeria leis and Welcome Cards.',
    fallbackImg: 'assets/img/ch01.webp',
  },
  {
    title: '2. The Captain\'s Sea Chest',
    caption: 'Captain Vicki aligning the crew in station order and opening the first lock on the living room deck.',
    fallbackImg: 'assets/img/ch02.webp',
  },
  {
    title: '3. Reading the Seabirds',
    caption: 'Glen consulting the Voyage Logbook and identifying the manu-o-Kū and noio that fly towards land.',
    fallbackImg: 'assets/img/ch03.webp',
  },
  {
    title: '4. Ancestral Kūpuna Tree',
    caption: 'Dave and Julie piecing together four generations of family history to uncover the hidden key.',
    fallbackImg: 'assets/img/ch04.webp',
  },
  {
    title: '5. Navigating the Cross-Swells',
    caption: 'Tyson and Sharon feeling the wind and swells, steering the canoe true through five directional changes.',
    fallbackImg: 'assets/img/ch05.webp',
  },
  {
    title: '6. Sounding the Song of Arrival',
    caption: 'Kevin sounding the melody and Jessie deciphering the notes into the harmonious four-digit code.',
    fallbackImg: 'assets/img/ch06.webp',
  },
  {
    title: '7. The Friendship Box',
    caption: 'Jessie and Melinda reminiscing over high school memories to open the secret wooden puzzle box.',
    fallbackImg: 'assets/img/ch07.webp',
  },
  {
    title: '8. Calling the Faraway Navigator',
    caption: 'Calling our distant navigator on speakerphone! Sharon answering the secret question to learn the word for the toolbox.',
    fallbackImg: 'assets/img/ch08.webp',
  },
  {
    title: '9. 100 Screws Unlashed',
    caption: 'Daniel and his helper racing against time to unscrew the heavy toolbox with tools and cheers.',
    fallbackImg: 'assets/img/ch09.webp',
  },
  {
    title: '10. Charting Carter Island',
    caption: 'The crew arranging nine shell tokens across the master map to triangulate the final coordinates.',
    fallbackImg: 'assets/img/ch10.webp',
  },
  {
    title: '11. The Treasure Chest Unlocked',
    caption: 'Nelson helping turn the dials on the Treasure Chest — revealing the ultrasound and offline message!',
    fallbackImg: 'assets/img/map.webp',
  },
  {
    title: '12. One United ʻOhana',
    caption: 'Ten voyagers, our distant navigator, two hosts, and one proud big brother celebrating together.',
    fallbackImg: 'assets/img/ch00.webp',
  },
];

async function initRecap() {
  initHeader();
  initFooter();
  initServiceWorker();

  let pub = { roster: [] };
  try {
    pub = await loadData('public.json');
  } catch (err) {
    console.warn('Could not load public roster:', err);
  }

  // Render Crew Mahalo Cards
  const crewContainer = document.getElementById('recap-crew-grid');
  if (crewContainer) {
    const list = [];

    // 10 Roster players from public.json
    for (const player of pub.roster || []) {
      list.push({
        id: player.id,
        name: player.name,
        role: player.role,
        station: `Station ${player.station}`,
        tokenSlug: player.token ? player.token.toLowerCase().split(' ')[0] : 'paddle',
        tokenLabel: player.token || 'Voyager',
        avatar: `assets/crew/${player.id}.webp`,
        reflection: STATION_REFLECTIONS[player.id] || player.publicText,
      });
    }

    // Nelson (Keiki Deckhand)
    list.push({
      id: 'nelson',
      name: 'Nelson Carter',
      station: 'Keiki Deckhand & Big Brother',
      role: 'Official Greeter & Chest Helper',
      tokenSlug: 'flower',
      tokenLabel: 'Flower',
      avatar: 'assets/crew/nelson.webp',
      reflection: 'Welcomed every voyager aboard with sweet plumeria leis, cheered on the rowers, and helped turn the final key to open the Treasure Chest!',
    });

    // Check for decrypted surprise crew card from unlocked chapters
    const unlocked = loadState().unlocked || {};
    const ids = Object.keys(unlocked).sort();
    if (ids.length) {
      try {
        const chapters = await loadData('chapters.json');
        for (const id of ids) {
          if (!chapters[id]) continue;
          const ch = await tryDecryptJSON(secrets.chapter(unlocked[id]), chapters[id]);
          if (!ch?.crewCard) continue;
          list.push({
            id: ch.crewCard.id || 'extra',
            name: ch.crewCard.name,
            station: 'Remote Navigator',
            role: ch.crewCard.role,
            tokenSlug: 'island',
            tokenLabel: ch.crewCard.token || 'Island',
            avatar: ch.crewCard.avatar || 'assets/tokens/island.webp',
            reflection: 'Answered the crew\'s speakerphone call from over a thousand miles away, tested his sister, and spoke the secret word that opened the builder\'s toolbox.',
          });
        }
      } catch (e) {
        console.warn('Extra crew member decrypt error:', e);
      }
    }

    // Hosts (Jared & Melinda)
    list.push({
      id: 'hosts',
      name: 'Jared C. & Melinda Carter',
      station: 'Voices of the Voyage',
      role: 'Hosts, Storytellers & Parents',
      tokenSlug: 'star',
      tokenLabel: 'Star',
      avatar: 'assets/tokens/star.webp',
      reflection: 'Steered the evening\'s story, guided each chapter\'s voyage, guarded the secret chest, and shared the unforgettable reveal with the ʻohana.',
    });

    crewContainer.innerHTML = list.map((c) => `
      <article class="recap-crew-card">
        <div class="recap-crew-header">
          <div class="recap-avatar-wrap">
            <img src="${esc(c.avatar)}" alt="${esc(c.name)}" class="recap-avatar" onerror="this.src='assets/tokens/${esc(c.tokenSlug || 'canoe')}.webp'; this.onerror=null;">
          </div>
          <div class="recap-crew-meta">
            <span class="recap-station-tag">${esc(c.station)}</span>
            <h3 class="recap-name">${esc(c.name)}</h3>
            <div class="recap-role">${esc(c.role)}</div>
          </div>
        </div>
        <p class="recap-moment">${esc(c.reflection)}</p>
      </article>
    `).join('');
  }

  // Render Photo Gallery Cards
  const galleryContainer = document.getElementById('recap-gallery-grid');
  if (galleryContainer) {
    galleryContainer.innerHTML = GALLERY_MOMENTS.map((m, idx) => {
      const realPhoto = `assets/recap/photo${String(idx + 1).padStart(2, '0')}.jpg`;
      return `
        <figure class="recap-photo-card">
          <div class="recap-img-wrap">
            <img src="${realPhoto}" alt="${esc(m.title)}" class="recap-photo" onerror="this.src='${esc(m.fallbackImg)}'; this.classList.add('is-fallback'); this.onerror=null;">
          </div>
          <figcaption class="recap-photo-caption">
            <div class="recap-photo-title">${esc(m.title)}</div>
            <p class="recap-photo-text">${esc(m.caption)}</p>
          </figcaption>
        </figure>
      `;
    }).join('');
  }

  document.body.dataset.ready = 'true';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRecap);
} else {
  initRecap();
}
