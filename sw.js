// Lupita: funcionamiento sin conexión y avisos.
// Al publicar una versión nueva, cambia el número de VERSION.
const VERSION = 'lupita-v0.2-7';
const ARCHIVOS = ['./', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/ui.js', './js/datos.js', './js/logica.js', './js/avisos.js', './js/pwa.js', './js/config.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // la página: primero internet (para recibir actualizaciones); sin conexión, la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copia = res.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copia));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  // archivos de la app: primero internet (así cada versión nueva llega al abrir); sin conexión, la copia
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req)));
    return;
  }
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
