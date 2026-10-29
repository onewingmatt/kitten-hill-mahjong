/**
 * Offline shell for Kitten Hill.
 *
 * A train tunnel should not be a blank screen. The shell, the icons and all 42
 * tile faces are cached on install; the hashed bundle is cached on first sight.
 * Assets are immutable (content-hashed, served `max-age=31536000`), so they are
 * cache-first. The document is network-first, because a stale shell pointing at
 * a deleted asset is exactly the failure this is meant to prevent.
 *
 * The tile art is *not* content-hashed, so it cannot be cache-first forever:
 * `khm-v1` precached the original sprites and matched them with `ignoreSearch`,
 * which made every later repaint invisible to installed clients — the `?v=` bump
 * on the URL was discarded by the lookup. The cache name now carries the art
 * version, tiles are looked up with the query intact, and bumping the constant
 * re-installs the worker (refetching every tile) while `activate` drops the old
 * cache.
 */
const TILES_VERSION = '4'; // must equal TILE_SPRITE_VERSION in src/engine/tiles.ts
const VERSION = `khm-v${TILES_VERSION}`;
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png'];
const TILES = (() => {
  const names = [];
  for (const suit of ['dots', 'bamboo', 'chars']) for (let n = 1; n <= 9; n++) names.push(`/tiles/${suit}_${n}.png`);
  for (let n = 1; n <= 4; n++) names.push(`/tiles/winds_${n}.png`);
  for (let n = 1; n <= 3; n++) names.push(`/tiles/dragons_${n}.png`);
  for (let n = 1; n <= 4; n++) names.push(`/tiles/flowers_${n}.png`);
  for (let n = 1; n <= 4; n++) names.push(`/tiles/seasons_${n}.png`);
  return names;
})();
const tileUrl = (path) => `${path}?v=${TILES_VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // one missing file must not abandon the whole install
      await Promise.all([...SHELL, ...TILES.map(tileUrl)].map((url) => cache.add(url).catch(() => null)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const isHashedAsset = (url) =>
  url.pathname.startsWith('/assets/') || /\.(png|svg|woff2?)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // the socket and the room API are not cacheable
  if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/room') || url.pathname.startsWith('/profile')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(VERSION);
          cache.put('/', fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match('/');
          if (cached) return cached;
          return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
        }
      })(),
    );
    return;
  }

  // tiles are not content-hashed: `?v=` IS their identity, so look up the exact
  // URL. An art repaint must miss here, never serve the previous drawing.
  if (url.pathname.startsWith('/tiles/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(VERSION);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      })(),
    );
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        // content-hashed names: the query string (if any) is not part of the identity
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(VERSION);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      })(),
    );
  }
});
