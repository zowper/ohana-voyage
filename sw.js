// Night of ʻOhana — Service Worker for offline voyaging.
// (PUBLISHED FILE: keep comments and code completely free of answers, passcodes, and secrets.)

const CACHE_NAME = 'ohana-voyage-20261010-mv2kuq2k';

// Default precache asset list. In production, scripts/build.mjs injects the exact list of built files.
const PRECACHE_ASSETS = [
  "./",
  "assets/birds/kaupu.webp",
  "assets/birds/kolea.webp",
  "assets/birds/manu-o-ku.webp",
  "assets/birds/noio.webp",
  "assets/birds/uau-kani.webp",
  "assets/crew/daniel.webp",
  "assets/crew/dave.webp",
  "assets/crew/glen.webp",
  "assets/crew/jaredw.webp",
  "assets/crew/jessie.webp",
  "assets/crew/julie.webp",
  "assets/crew/kevin.webp",
  "assets/crew/sharon.webp",
  "assets/crew/tyson.webp",
  "assets/crew/vicki.webp",
  "assets/img/ch00.webp",
  "assets/img/ch01.webp",
  "assets/img/ch02.webp",
  "assets/img/ch03.webp",
  "assets/img/ch04.webp",
  "assets/img/ch05.webp",
  "assets/img/ch06.webp",
  "assets/img/ch07.webp",
  "assets/img/ch08.webp",
  "assets/img/ch09.webp",
  "assets/img/ch10.webp",
  "assets/img/key-hiding-spot.webp",
  "assets/img/map.webp",
  "assets/tokens/bird.webp",
  "assets/tokens/canoe.webp",
  "assets/tokens/conch.webp",
  "assets/tokens/flower.webp",
  "assets/tokens/island.webp",
  "assets/tokens/paddle.webp",
  "assets/tokens/star.webp",
  "assets/tokens/tree.webp",
  "assets/tokens/wave.webp",
  "css/style.css",
  "data/chapters.json",
  "data/hints.json",
  "data/host.json",
  "data/private.json",
  "data/public.json",
  "data/teasers.json",
  "hints.html",
  "host.html",
  "index.html",
  "js/common.js",
  "js/crypto.js",
  "js/hints.js",
  "js/host.js",
  "js/index.js",
  "js/map.js",
  "js/me.js",
  "js/recap.js",
  "js/unlock.js",
  "js/voyage.js",
  "manifest.json",
  "map.html",
  "me.html",
  "recap.html",
  "voyage.html"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Fetch each asset individually so one transient 404 does not fail installation
      await Promise.all(
        PRECACHE_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload' });
            if (res.ok) {
              await cache.put(url, res);
            }
          } catch (err) {
            // Silently continue if an optional asset is not yet available
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Navigation requests (HTML pages)
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2500);
          try {
            const netRes = await fetch(req, { signal: controller.signal });
            clearTimeout(timer);
            if (netRes && netRes.ok) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(req, netRes.clone());
              return netRes;
            }
          } catch (netErr) {
            clearTimeout(timer);
          }

          // Network failed or timed out: fall back to cached page
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;

          // If looking for a directory or unknown page, fall back to index.html
          const fallback = (await caches.match('./index.html')) || (await caches.match('index.html')) || (await caches.match('./'));
          if (fallback) return fallback;

          return new Response('Voyage materials offline. Please reload when ready.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        } catch {
          const fallback = (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html'));
          return fallback || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // 2. Data JSON requests (/data/*.json): Network first with cache fallback
  if (url.pathname.includes('/data/') || url.pathname.endsWith('.json')) {
    event.respondWith(
      (async () => {
        try {
          const netRes = await fetch(req);
          if (netRes && netRes.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, netRes.clone());
            return netRes;
          }
        } catch {
          // Offline / network failure: serve from cache
        }

        const cached = await caches.match(req);
        if (cached) return cached;

        return new Response(JSON.stringify({ error: 'offline', message: 'Resource not available offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      })()
    );
    return;
  }

  // 3. Static assets (CSS, JS, WebP, SVG, Fonts): Cache first with network fallback
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        // Background revalidation for code assets
        if (req.destination === 'script' || req.destination === 'style') {
          fetch(req)
            .then(async (res) => {
              if (res && res.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(req, res);
              }
            })
            .catch(() => {});
        }
        return cached;
      }

      try {
        const netRes = await fetch(req);
        if (netRes && (netRes.ok || netRes.type === 'opaque')) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, netRes.clone());
        }
        return netRes;
      } catch (err) {
        // Return 404 or empty response on complete failure
        return new Response('', { status: 404, statusText: 'Not found or offline' });
      }
    })()
  );
});
