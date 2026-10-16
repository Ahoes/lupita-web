// Lupita: funcionamiento sin conexión y avisos.
// Al publicar una versión nueva, cambia el número de VERSION.
const VERSION = 'lupita-v0.5.3';
const ARCHIVOS = ['./', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/ui.js', './js/datos.js', './js/logica.js', './js/avisos.js', './js/pwa.js', './js/config.js',
  './fonts/nunito.woff2', './fonts/bricolage.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  // "reload": se piden a internet, no a la copia de unos minutos que guarda el navegador
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS.map((a) => new Request(a, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

// Primero internet, preguntando siempre si hay algo nuevo ("no-cache"); si no contesta en 3 s
// (mala cobertura) o no hay conexión, la copia guardada. Lo que llega de internet se guarda para la próxima vez.
// Si internet ya ha tardado demasiado, durante 30 s el resto de archivos sale de la copia sin esperar.
const ESPERA = 3000;
let lentoHasta = 0;
function deInternet(pedir, clave) {
  const red = fetch(pedir, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copia = res.clone(); caches.open(VERSION).then((c) => c.put(clave, copia)); }
    return res;
  });
  return new Promise((resolver) => {
    let listo = false;
    const dar = (res) => { if (!listo && res) { listo = true; clearTimeout(t); resolver(res); } };
    const t = setTimeout(() => { lentoHasta = Date.now() + 30000; caches.match(clave).then(dar); },
      Date.now() < lentoHasta ? 0 : ESPERA);
    red.then(dar).catch(() => caches.match(clave).then((c) => { dar(c); if (!listo) resolver(Response.error()); }));
  });
}

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // la página y los archivos de la app: así cada versión nueva llega al abrir
  if (req.mode === 'navigate') { e.respondWith(deInternet(req.url, './index.html')); return; }
  if (url.origin === location.origin) { e.respondWith(deInternet(req, req)); return; }
  // los datos de Supabase nunca se guardan aquí
  if (url.hostname !== 'cdn.jsdelivr.net') return;
  // la librería de Supabase no cambia: la copia guardada y, si no está, internet
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copia = res.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
    return res;
  })));
});

// aviso push de Supabase (llega aunque la app esté cerrada)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Lupita', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'es',
    tag: d.tag, renotify: Boolean(d.tag), data: { url: d.url || './' },
  }));
});

// al tocar un aviso, se abre la app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
    for (const v of ventanas) if ('focus' in v) return v.focus();
    return self.clients.openWindow('./');
  }));
});
