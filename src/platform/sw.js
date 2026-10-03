// Service worker (plan §12.1): precache the whole game so it plays offline once installed.
// Hashed assets are cache-first; the page itself is network-first so updates arrive promptly.
// vite.config.ts fills in VERSION and PRECACHE at build time.

const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `jimothy-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("jimothy-") && k !== CACHE).map((k) => caches.delete(k))))
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
  // ignoreVary: servers vary on Origin or encoding, which would make precached module scripts miss.
  event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit ?? fetch(req)));
});
