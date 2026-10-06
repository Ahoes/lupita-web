// Lupita · lectura y escritura en Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// Se mira antes de crear la conexión, porque Supabase borra de la dirección lo que trae el enlace del correo
const enlace = location.hash + location.search;
export const vieneDeRecuperar = /type=recovery/.test(enlace);
export const enlaceCaducado = /error_code=otp_expired|error=access_denied/.test(enlace);

export const configurado = /^https:\/\//.test(SUPABASE_URL) && SUPABASE_KEY.length > 20;
export const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
export const TABLAS = { compra: 'fam_compra', tareas: 'fam_tareas', eventos: 'fam_eventos', miembros: 'fam_miembros' };

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
export const insertar = async (tipo, filas) => ok(await sb.from(TABLAS[tipo]).insert(filas).select());
export const actualizar = async (tipo, id, cambios) => ok(await sb.from(TABLAS[tipo]).update(cambios).eq('id', id));
export const borrar = async (tipo, ids) => ok(await sb.from(TABLAS[tipo]).delete().in('id', [].concat(ids)));

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

// ===== Mensajes de error en español =====
export function mensajeError(err) {
  const m = String(err?.message || err || '');
  if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Falta confirmar el correo: abre el enlace que te hemos enviado.';
  if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene cuenta: pulsa Entrar.';
  if (/password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/should be different/i.test(m)) return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Demasiados intentos. Espera un poco y vuelve a probar.';
  if (/failed to fetch|network|load failed/i.test(m)) return 'No hay conexión. Prueba de nuevo en un momento.';
  if (/does not exist|schema cache/i.test(m)) return 'Falta preparar la base de datos (supabase/esquema.sql).';
  return m || 'Algo ha fallado. Prueba de nuevo.';
}
