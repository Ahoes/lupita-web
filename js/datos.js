// Lupita · lectura y escritura en Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// Se mira antes de crear la conexión, porque Supabase borra de la dirección lo que trae el enlace del correo
const enlace = location.hash + location.search;
export const vieneDeRecuperar = /type=recovery/.test(enlace);
export const enlaceCaducado = /error_code=otp_expired|error=access_denied/.test(enlace);

export const configurado = /^https:\/\//.test(SUPABASE_URL) && SUPABASE_KEY.length > 20;
export const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
export const TABLAS = { compra: 'fam_compra', tareas: 'fam_tareas', eventos: 'fam_eventos', miembros: 'fam_miembros', deCompras: 'fam_de_compras',
  menu: 'fam_menu', comensales: 'fam_comensales' };

const ok = ({ data, error }) => { if (error) throw error; return data; };

// ===== Cuenta =====
export const entrar = async (email, password) => ok(await sb.auth.signInWithPassword({ email, password }));
export const registrar = async (email, password) => ok(await sb.auth.signUp({
  email, password, options: { emailRedirectTo: location.origin + location.pathname },
}));
export const salir = () => sb.auth.signOut();
// Manda el correo con el enlace; al abrirlo vuelve a la app para poner la contraseña nueva
export const pedirNuevaClave = async (email) => ok(await sb.auth.resetPasswordForEmail(email, {
  redirectTo: location.origin + location.pathname,
}));
export const cambiarClave = async (password) => ok(await sb.auth.updateUser({ password }));

// ===== Casa =====
export const miMiembro = async (uid) => ok(await sb.from('fam_miembros').select('*').eq('user_id', uid).maybeSingle());
export const hogar = async (id) => ok(await sb.from('fam_hogares').select('*').eq('id', id).single());
export const miembros = async (hogarId) => ok(await sb.from('fam_miembros').select('user_id, nombre')
  .eq('hogar_id', hogarId).order('creado_en'));
export const crearHogar = async (miNombre) => ok(await sb.rpc('fam_crear_hogar', { mi_nombre: miNombre }));
export const unirse = async (codigo, miNombre) => ok(await sb.rpc('fam_unirse', { codigo_hogar: codigo, mi_nombre: miNombre }));
export const cambiarNombre = async (uid, nombre) => ok(await sb.from('fam_miembros').update({ nombre }).eq('user_id', uid));

// ===== Avisos push: qué móviles los reciben =====
export const guardarSuscripcion = async (fila) => ok(await sb.from('fam_suscripciones').upsert(fila, { onConflict: 'endpoint' }));
export const borrarSuscripcion = async (endpoint) => ok(await sb.from('fam_suscripciones').delete().eq('endpoint', endpoint));

// ===== Compra, tareas y calendario =====
export async function cargar(tipo) {
  let q = sb.from(TABLAS[tipo]).select('*');
  q = tipo === 'eventos' ? q.order('fecha').order('hora', { nullsFirst: true }) : q.order('creado_en');
  return ok(await q);
}
// Añadir, cambiar y borrar funcionan también sin conexión (ver "Sin conexión" más abajo)
export const insertar = (tipo, filas, yo) => {
  // el id se pone aquí, así lo apuntado sin conexión ya tiene el mismo id que tendrá en Supabase
  const enviar = [].concat(filas).map((f) => ({ id: f.id || crypto.randomUUID(), ...f }));
  const ahora = new Date().toISOString();
  const locales = enviar.map((f) => ({ ...(tipo === 'compra' || tipo === 'tareas' ? { hecho: false } : {}),
    creado_por: yo, creado_en: ahora, ...f }));
  return guardar({ tipo, op: 'insertar', filas: enviar, locales });
};
export const actualizar = (tipo, id, cambios) => guardar({ tipo, op: 'actualizar', id, cambios });
export const borrar = (tipo, ids) => guardar({ tipo, op: 'borrar', ids: [].concat(ids) });

async function ejecutar(op) {
  const t = sb.from(TABLAS[op.tipo]);
  if (op.op === 'insertar') return ok(await t.insert(op.filas).select());
  if (op.op === 'actualizar') return ok(await t.update(op.cambios).eq('id', op.id));
  return ok(await t.delete().in('id', op.ids));
}

// Menú: lo de hace más de 4 semanas ya no se ve y se borra
export const borrarMenuViejo = async (antesDe) => ok(await sb.from('fam_menu').delete().lt('semana', antesDe));

// "Voy a comprar" / "He terminado"
export const empezarCompra = async (uid, hogarId) => ok(await sb.from('fam_de_compras')
  .upsert({ user_id: uid, hogar_id: hogarId, creado_en: new Date().toISOString() }, { onConflict: 'user_id' }));
export const terminarCompra = async (uid) => ok(await sb.from('fam_de_compras').delete().eq('user_id', uid));

// Avisa de cada cambio que haga cualquiera de la casa.
// Los borrados no se pueden filtrar por casa en Supabase, así que llegan todos (solo traen el id).
export function suscribir(hogarId, alCambio) {
  const canal = sb.channel(`fam-${hogarId}`);
  for (const [tipo, table] of Object.entries(TABLAS)) {
    const filter = `hogar_id=eq.${hogarId}`;
    canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, (p) => alCambio(tipo, p));
    canal.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, (p) => alCambio(tipo, p));
    canal.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => alCambio(tipo, p));
  }
  canal.subscribe();
  return canal;
}
export const desuscribir = (canal) => canal && sb.removeChannel(canal);

// ===== Sin conexión =====
// Lo que se cambia sin conexión (o con tan poca cobertura que no contesta) se guarda en una cola en el móvil
// y se sube solo, en el mismo orden, cuando vuelve la conexión. También se guarda una copia de los datos
// para poder abrir la app sin conexión.
const COLA = 'fam-cola', COPIA = 'fam-copia', ESPERA = 10000;
export function leerCola() { try { return JSON.parse(localStorage.getItem(COLA)) || []; } catch (e) { return []; } }
function ponerCola(cola) {
  try { if (cola.length) localStorage.setItem(COLA, JSON.stringify(cola)); else localStorage.removeItem(COLA); } catch (e) { /* sin almacenamiento */ }
  avisoCola();
}
let avisoCola = () => {};
export const alCambiarCola = (fn) => { avisoCola = fn; };

export const esDeRed = (err) => !navigator.onLine
  || /failed to fetch|networkerror|network request|load failed|sin respuesta/i.test(String(err?.message || err || ''));
export const conTiempo = (promesa, ms = ESPERA) => Promise.race([promesa,
  new Promise((_, no) => setTimeout(() => no(new Error('Sin respuesta a tiempo')), ms))]);

// Si ya hay algo esperando, lo nuevo va detrás (para respetar el orden). Si no hay conexión, a la cola.
// Un error que no es de conexión (por ejemplo, un texto demasiado largo) sí se avisa como siempre.
async function guardar(op) {
  const devolver = () => (op.op === 'insertar' ? op.locales : null);
  if (leerCola().length || !navigator.onLine) { ponerCola([...leerCola(), op]); subirCola(); return devolver(); }
  try { return await conTiempo(ejecutar(op)); } catch (err) {
    if (!esDeRed(err)) throw err;
    // repetirlo no hace daño: un añadido que sí llegó tiene el mismo id y no se duplica
    ponerCola([...leerCola(), op]);
    return devolver();
  }
}

// Sube lo pendiente de uno en uno. Devuelve cuántos cambios no se pudieron guardar (no por la conexión).
let subiendo = null;
export function subirCola() {
  if (subiendo) return subiendo;
  subiendo = (async () => {
    let fallidos = 0;
    while (sb && navigator.onLine) {
      const [op] = leerCola();
      if (!op) break;
      try { await conTiempo(ejecutar(op)); } catch (err) {
        if (esDeRed(err)) break;
        // 23505: ese añadido ya había llegado (se repitió tras quedarse sin respuesta)
        if (err?.code !== '23505') { fallidos++; console.error(err); }
      }
      ponerCola(leerCola().slice(1));
    }
    return fallidos;
  })().finally(() => { subiendo = null; });
  return subiendo;
}

const EN_COPIA = ['yo', 'hogar', 'miembros', 'compra', 'tareas', 'eventos', 'deCompras', 'menu', 'comensales'];
export function guardarCopia(S) {
  try { localStorage.setItem(COPIA, JSON.stringify(Object.fromEntries(EN_COPIA.map((k) => [k, S[k]])))); } catch (e) { /* sin almacenamiento */ }
}
export function leerCopia() { try { return JSON.parse(localStorage.getItem(COPIA)); } catch (e) { return null; } }
// al cerrar sesión no queda nada de la casa en el móvil
export function borrarCopia() {
  try { localStorage.removeItem(COPIA); localStorage.removeItem(COLA); } catch (e) { /* sin almacenamiento */ }
  avisoCola();
}

// ===== Mensajes de error en español =====
export function mensajeError(err) {
  const m = String(err?.message || err || '');
  if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Falta confirmar el correo: abre el enlace que te hemos enviado.';
  if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene cuenta: pulsa Entrar.';
  if (/password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/should be different/i.test(m)) return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Demasiados intentos. Espera un poco y vuelve a probar.';
  if (/failed to fetch|network|load failed|sin respuesta/i.test(m)) return 'No hay conexión. Prueba de nuevo en un momento.';
  if (/does not exist|schema cache/i.test(m)) return 'Falta preparar la base de datos (supabase/esquema.sql).';
  return m || 'Algo ha fallado. Prueba de nuevo.';
}
