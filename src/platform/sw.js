// Service worker (plan §12.1): precache the whole game so it plays offline once installed.
// Hashed assets are cache-first; the page itself is network-first so updates arrive promptly.
// Audio is cached the first time it's fetched instead (each browser wants only one of its two
// formats), in a cache that outlives versions since its file names carry content hashes.
// vite.config.ts fills in VERSION, PRECACHE and MEDIA at build time.

const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const MEDIA = new Set(__MEDIA__);
const CACHE = `jimothy-${VERSION}`;
const MEDIA_CACHE = "jimothy-media";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("jimothy-") && k !== CACHE && k !== MEDIA_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => caches.open(MEDIA_CACHE))
      .then((c) =>
        // drop sounds this version no longer ships
        c.keys().then((reqs) => Promise.all(reqs.filter((r) => !MEDIA.has(mediaPath(r.url))).map((r) => c.delete(r)))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./", { ignoreVary: true })),
    );
    return;
  }
  const media = mediaPath(req.url);
  if (MEDIA.has(media)) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then((c) =>
        c.match(req, { ignoreVary: true }).then(
          (hit) =>
            hit ??
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }
  // ignoreVary: servers vary on Origin or encoding, which would make precached module scripts miss.
  event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit ?? fetch(req)));
});

/** A URL's path relative to the worker's scope, like "audio/ui-click.f30e504c.ogg". */
function mediaPath(url) {
  return url.slice(self.registration.scope.length);
}
