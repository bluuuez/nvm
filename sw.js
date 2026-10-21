/* NVM – Offline-Modus
 * Beim ersten Besuch werden alle Dateien gespeichert. Danach startet NVM ohne Netz.
 * Seite, Code und Stile: mit Netz immer die neueste Version (Speicher nur als Rückfall).
 * Schriften, Icons und KaTeX ändern sich nicht: direkt aus dem Speicher.
 * VERSION erhöhen, wenn sich Dateien ändern, damit alte Speicherstände gelöscht werden.
 * Dieselbe Nummer steht als ?v= an Skripten und Stilen in index.html: So lädt eine neue Seite nie alte Skripte. */
const VERSION = 'nvm-v27';
const FILES = [
  './',
  'fonts.css',
  'icon.svg',
  'index.html',
  'manifest.webmanifest',
  'styles.css',
  'js/app.js',
  'js/board.js',
  'js/config.js',
  'js/core.js',
  'js/draw.js',
  'js/math.js',
  'js/explain.js',
  'js/frame.js',
  'js/framegen.js',
  'js/drawframe.js',
  'katex/katex.min.css',
  'katex/katex.min.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'fonts/barlow-semi-condensed-latin-800-normal.woff2',
  'fonts/source-sans-3-latin-400-italic.woff2',
  'fonts/source-sans-3-latin-400-normal.woff2',
  'fonts/source-sans-3-latin-600-normal.woff2',
  'fonts/source-sans-3-latin-700-normal.woff2',
  'fonts/source-serif-4-latin-600-normal.woff2',
  'fonts/source-serif-4-latin-700-normal.woff2',
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
  'katex/fonts/KaTeX_Size4-Regular.woff2'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neue Version gespeichert wird
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const STATIC = /\.(woff2|png|svg)$|\/katex\//;
const NET_TIMEOUT = 4000;   // bei sehr langsamem Netz nach 4 s die gespeicherte Version nehmen

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const fallback = () => hit || (req.mode === 'navigate' ? cache.match('index.html') : undefined);
    if (hit && STATIC.test(url.pathname)) return hit;
    // Netz zuerst; 'no-cache' fragt den Server, statt eine alte Kopie aus dem Browser-Cache zu nehmen
    const net = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });
    if (!hit) return net.catch(fallback);
    const timer = new Promise((ok) => setTimeout(() => ok(null), NET_TIMEOUT));
    const res = await Promise.race([net.catch(() => null), timer]);
    if (!res) e.waitUntil(net.catch(() => {}));
    return res || hit;
  }));
});
