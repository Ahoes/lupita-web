// Lupita · app instalable (service worker y botón Instalar)
const $p = (id) => document.getElementById(id);

export const instalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

(() => {
  const btn = $p('instalar'), hoja = $p('s-instalar'), pasos = $p('inst-pasos');
  if (instalada) return;
  let aviso = null;
  if (esIOS) btn.hidden = false;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); aviso = e; btn.hidden = false; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; hoja.hidden = true; });
  btn.addEventListener('click', async () => {
    if (aviso) { aviso.prompt(); try { await aviso.userChoice; } catch (e) { /* cancelado */ } aviso = null; btn.hidden = true; return; }
    pasos.innerHTML = esIOS
      ? '<li>Abre esta página en <b>Safari</b>.</li><li>Pulsa <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li><li>Elige <b>Añadir a pantalla de inicio</b> y pulsa <b>Añadir</b>.</li><li>Abre la app desde el icono nuevo.</li>'
      : '<li>Abre el menú del navegador (⋮).</li><li>Pulsa <b>Instalar app</b> o <b>Añadir a pantalla de inicio</b>.</li>';
    hoja.hidden = false;
  });
  $p('inst-ok').addEventListener('click', () => { hoja.hidden = true; });
  hoja.addEventListener('click', (e) => { if (e.target === hoja) hoja.hidden = true; });
})();
