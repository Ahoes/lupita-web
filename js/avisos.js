// Lupita · avisos del sistema (notificaciones)
const CLAVE = 'fam-avisados';

const OK = 'fam-perm-ok';
let estado = null; // lo último que se supo del permiso

export const soportado = () => 'Notification' in window;

function recordado() { try { return localStorage.getItem(OK) === '1'; } catch (e) { return false; } }
function recordar(si) { try { if (si) localStorage.setItem(OK, '1'); else localStorage.removeItem(OK); } catch (e) { /* sin almacenamiento */ } }

// Algunos móviles (sobre todo iPhone con la app instalada) siguen diciendo "default"
// aunque ya se hayan aceptado los avisos: se mira también el sistema de permisos y lo recordado.
export async function comprobarPermiso() {
  if (!soportado()) return (estado = 'no');
  let p = Notification.permission;
  if (p === 'default' && navigator.permissions?.query) {
    try {
      const r = await navigator.permissions.query({ name: 'notifications' });
      if (r.state === 'granted' || r.state === 'denied') p = r.state;
    } catch (e) { /* no soportado */ }
  }
  if (p === 'default' && recordado()) p = 'granted';
  if (p === 'denied') recordar(false);
  if (p === 'granted') recordar(true);
  return (estado = p);
}
export const permiso = () => estado || (soportado() ? Notification.permission : 'no');

export async function pedirPermiso() {
  if (!soportado()) return 'no';
  let r;
  try { r = await Notification.requestPermission(); } catch (e) { r = Notification.permission; }
  if (r === 'granted') recordar(true);
  return comprobarPermiso();
}

export async function notificar(titulo, cuerpo, etiqueta) {
  if (permiso() === 'denied' || permiso() === 'no') return false;
  const opciones = { body: cuerpo, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: etiqueta, lang: 'es' };
  // En Android solo funciona a través del service worker
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(titulo, opciones); return true; }
  } catch (e) { /* se prueba de la otra forma */ }
  try { new Notification(titulo, opciones); return true; } catch (e) { return false; }
}

// ===== Avisos push (los manda Supabase y llegan con la app cerrada) =====
export let pushActivo = false;
const clave = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
// Da de alta este móvil para recibir avisos y lo guarda con guardar({ endpoint, p256dh, auth })
export async function activarPush(vapid, guardar) {
  pushActivo = false;
  if (permiso() !== 'granted' || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave(vapid) });
    const j = sub.toJSON();
    await guardar({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
    pushActivo = true;
  } catch (e) { console.error('push', e); }
  return pushActivo;
}
// Al cerrar sesión: este móvil deja de recibir avisos de esta cuenta
export async function desactivarPush(borrar) {
  pushActivo = false;
  try {
    const sub = await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription();
    if (!sub) return;
    await borrar(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  } catch (e) { /* sin push */ }
}

// Recuerda qué avisos ya se dieron hoy para no repetirlos
function leer() { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } }
export const yaAvisado = (clave) => Boolean(leer()[clave]);
export function marcar(clave, hoy) {
  const todos = leer();
  for (const k of Object.keys(todos)) if (!k.endsWith(hoy)) delete todos[k];
  todos[clave] = 1;
  try { localStorage.setItem(CLAVE, JSON.stringify(todos)); } catch (e) { /* sin almacenamiento */ }
}

export function ponerContador(n) {
  try { if (n > 0) navigator.setAppBadge?.(n); else navigator.clearAppBadge?.(); } catch (e) { /* no soportado */ }
}
