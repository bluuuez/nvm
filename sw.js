/* NVM – Offline-Modus
 * Beim ersten Besuch werden alle Dateien gespeichert. Danach startet NVM ohne Netz.
 * Online wird im Hintergrund nachgeladen, so kommt eine neue Version beim nächsten Start an.
 * VERSION erhöhen, wenn sich die Dateiliste ändert. */
const VERSION = 'nvm-v3';
const FILES = [
  './', 'index.html', 'styles.css', 'fonts.css', 'manifest.webmanifest', 'icon.svg',
  'js/core.js', 'js/math.js', 'js/draw.js', 'js/app.js',
  'katex/katex.min.js', 'katex/katex.min.css',
  'katex/fonts/KaTeX_AMS-Regular.woff2',
  'katex/fonts/KaTeX_Main-Bold.woff2',
  'katex/fonts/KaTeX_Main-BoldItalic.woff2',
  'katex/fonts/KaTeX_Main-Italic.woff2',
  'katex/fonts/KaTeX_Main-Regular.woff2',
  'katex/fonts/KaTeX_Math-BoldItalic.woff2',
  'katex/fonts/KaTeX_Math-Italic.woff2',
  'katex/fonts/KaTeX_Size1-Regular.woff2',
  'katex/fonts/KaTeX_Size2-Regular.woff2',
  'katex/fonts/KaTeX_Size3-Regular.woff2',
  'katex/fonts/KaTeX_Size4-Regular.woff2',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'fonts/barlow-latin-400-normal.woff2', 'fonts/barlow-latin-500-normal.woff2', 'fonts/barlow-latin-600-normal.woff2',
  'fonts/barlow-latin-700-normal.woff2', 'fonts/barlow-latin-500-italic.woff2',
  'fonts/barlow-semi-condensed-latin-500-normal.woff2', 'fonts/barlow-semi-condensed-latin-600-normal.woff2',
  'fonts/barlow-semi-condensed-latin-700-normal.woff2', 'fonts/barlow-semi-condensed-latin-800-normal.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Aus dem Speicher antworten (schnell, offline) und parallel aktualisieren
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => hit || (req.mode === 'navigate' ? cache.match('index.html') : undefined));
        if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
        return net;
      })
    )
  );
});
