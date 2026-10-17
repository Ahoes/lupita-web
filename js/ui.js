// Lupita · pantallas y eventos
import * as D from './datos.js';
import * as L from './logica.js';
import * as A from './avisos.js';
import { esIOS, instalada } from './pwa.js';
import { VAPID_PUBLICA } from './config.js';

const $ = (id) => document.getElementById(id);
const S = {
  yo: null, hogar: null, miembros: [], compra: [], tareas: [], eventos: [], deCompras: [],
  filtro: 'Todas', mes: null, dia: L.hoyISO(), canal: null, confirmando: null, editando: null,
  // menú: platos, personas sin cuenta, semana que se ve (su lunes) y lo elegido para añadir
  menu: [], comensales: [], semana: null, mDia: null, mMomento: 'comida', mQuienes: null, mQuienesTocado: false,
};

// ===== Utilidades =====
function el(tag, props = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null && h !== false) n.append(h);
  return n;
}

function vista(id) {
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('on', v.id === id));
}

let toastT;
function toast(msg, accion) {
  const t = $('toast');
  t.replaceChildren(el('span', {}, msg));
  if (accion) t.append(el('button', { type: 'button', onclick: () => { t.hidden = true; accion.fn(); } }, accion.texto));
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, accion ? 5000 : 3000);
}
function fallo(err) { console.error(err); toast(D.mensajeError(err)); }
function mensaje(id, txt, info = false) { const m = $(id); m.textContent = txt || ''; m.hidden = !txt; m.classList.toggle('info', info); }

const nombreDe = (uid) => S.miembros.find((m) => m.user_id === uid)?.nombre || 'Alguien';
const nombresCasa = () => S.miembros.map((m) => m.nombre);
// Quién come en casa: las personas con cuenta y las que solo salen en el menú (por ejemplo, una hija pequeña)
const personasMenu = () => [
  ...S.miembros.map((m) => ({ id: m.user_id, nombre: m.nombre, cuenta: true })),
  ...S.comensales.map((c) => ({ id: c.id, nombre: c.nombre, cuenta: false })),
];
const nombresMenu = () => personasMenu().map((p) => p.nombre);
const ordenQuienes = (set) => personasMenu().map((p) => p.id).filter((id) => set.has(id));
// Botones con los nombres para elegir quién come (se marcan y desmarcan al tocarlos)
function botonesQuienes(set, alCambiar) {
  return personasMenu().map((p) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(set.has(p.id)),
    onclick: (e) => {
      if (set.has(p.id)) set.delete(p.id); else set.add(p.id);
      e.currentTarget.setAttribute('aria-pressed', String(set.has(p.id)));
      if (alCambiar) alCambiar();
    } }, p.nombre));
}
const miNombre = () => S.miembros.find((m) => m.user_id === S.yo)?.nombre || '';
const deOtro = (fila) => fila.creado_por && fila.creado_por !== S.yo;

// ===== Arranque y cuenta =====
async function arrancar() {
  if (!D.configurado) return vista('v-config');
  D.sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') { D.borrarCopia(); D.desuscribir(S.canal); S.canal = null; S.hogar = null; modoLogin('entrar'); vista('v-login'); }
    if (evento === 'PASSWORD_RECOVERY') vista('v-clave');
  });
  try {
    const { data } = await D.sb.auth.getSession();
    if (D.enlaceCaducado) {
      modoLogin('olvido');
      mensaje('login-msg', 'El enlace ha caducado o ya se usó. Escribe tu correo y pide otro.');
    }
    // sin conexión, la sesión puede no poder renovarse: se abre la copia guardada en el móvil
    if (!data.session && !navigator.onLine && D.leerCopia()?.hogar) { S.conectado = false; return abrirCopia(D.leerCopia()); }
    if (!data.session) return vista('v-login');
    if (D.vieneDeRecuperar) return vista('v-clave');
    await entrarCon(data.session.user);
  } catch (err) {
    if (D.esDeRed(err) && D.leerCopia()?.hogar) { S.conectado = false; return abrirCopia(D.leerCopia()); }
    fallo(err); vista('v-login');
  }
}

// Abre la app con la copia guardada en el móvil y lo que quedó por subir encima
function abrirCopia(copia) {
  Object.assign(S, copia);
  L.aplicarCola(S, D.leerCola());
  vista('v-app');
  pintar();
  estadoRed();
}

async function entrarCon(user) {
  S.yo = user.id;
  // si hay copia en el móvil se enseña ya, sin esperar a internet (y sirve sin conexión)
  const copia = D.leerCopia();
  const hayCopia = copia?.yo === user.id && copia.hogar;
  if (hayCopia) abrirCopia(copia);
  let m;
  try {
    m = await D.conTiempo(D.miMiembro(user.id));
    if (m) await cargarTodo(m.hogar_id);
  } catch (err) {
    if (hayCopia && D.esDeRed(err)) { S.conectado = false; return; }
    throw err;
  }
  if (!m) { vista('v-hogar'); $('h-nombre').focus(); return; }
  S.conectado = true;
  vista('v-app');
  pintar();
  estadoRed();
  D.desuscribir(S.canal);
  S.canal = D.suscribir(S.hogar.id, alCambio);
  revisarAvisos();
  // el menú de hace más de 4 semanas ya no se ve: se borra
  D.borrarMenuViejo(L.sumarDias(L.lunesDe(L.hoyISO()), -28)).catch(() => {});
  await mostrarBandaPermiso();
  activarPush();
}

const activarPush = () => A.activarPush(VAPID_PUBLICA, D.guardarSuscripcion);
async function cerrarSesion() {
  await A.desactivarPush(D.borrarSuscripcion);
  D.borrarCopia();
  D.salir();
}

// La pantalla de entrar tiene tres modos: entrar, crear cuenta y recuperar la contraseña.
// Recuperar está apagado hasta configurar el correo en Supabase (remitente propio y dirección autorizada).
const RECUPERAR = false;
let modo = 'entrar';
function modoLogin(m) {
  modo = m;
  const f = $('f-login');
  const textos = {
    entrar: ['', 'Entrar', 'Crear cuenta nueva'],
    registro: ['Crear cuenta', 'Crear cuenta', 'Ya tengo cuenta'],
    olvido: ['Recuperar la contraseña', 'Enviar enlace', 'Volver'],
  }[m];
  $('login-titulo').textContent = textos[0];
  $('login-titulo').hidden = !textos[0];
  $('login-ok').textContent = textos[1];
  $('login-cambiar').textContent = textos[2];
  $('login-ayuda').hidden = m !== 'olvido';
  $('login-olvido').hidden = !RECUPERAR || m !== 'entrar';
  $('login-c1').hidden = m === 'olvido';
  f.clave.required = m !== 'olvido';
  f.clave.autocomplete = m === 'registro' ? 'new-password' : 'current-password';
  $('login-c2').hidden = m !== 'registro';
  f.clave2.required = m === 'registro';
  f.clave2.value = '';
  mensaje('login-msg', '');
}
$('login-cambiar').addEventListener('click', () => modoLogin(modo === 'entrar' ? 'registro' : 'entrar'));
$('login-olvido').addEventListener('click', () => { modoLogin('olvido'); $('f-login').email.focus(); });

$('f-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const email = f.email.value.trim(), clave = f.clave.value;
  mensaje('login-msg', '');
  if (modo === 'registro' && clave !== f.clave2.value) {
    mensaje('login-msg', 'Las dos contraseñas no coinciden.');
    f.clave2.focus();
    return;
  }
  f.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    if (modo === 'olvido') {
      await D.pedirNuevaClave(email);
      mensaje('login-msg', 'Si ese correo tiene cuenta, te llegará un enlace en unos minutos. Mira también en correo no deseado.', true);
    } else if (modo === 'registro') {
      const r = await D.registrar(email, clave);
      if (!r.session) { mensaje('login-msg', 'Te hemos enviado un correo. Abre el enlace para confirmar la cuenta y después pulsa Entrar.', true); return; }
      await entrarCon(r.user);
    } else {
      const r = await D.entrar(email, clave);
      await entrarCon(r.user);
    }
  } catch (err) {
    mensaje('login-msg', D.mensajeError(err));
  } finally {
    f.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  }
});

// Al volver del enlace del correo: se pone la contraseña nueva y se entra
$('f-clave').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  mensaje('clave-msg', '');
  if (f.clave.value !== f.clave2.value) { mensaje('clave-msg', 'Las dos contraseñas no coinciden.'); f.clave2.focus(); return; }
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    const r = await D.cambiarClave(f.clave.value);
    f.reset();
    history.replaceState(null, '', location.pathname);
    toast('Contraseña cambiada');
    await entrarCon(r.user);
  } catch (err) {
    mensaje('clave-msg', D.mensajeError(err));
  } finally { btn.disabled = false; }
});

async function accionHogar(fn) {
  const nombre = $('h-nombre').value.trim();
  if (!nombre) { mensaje('hogar-msg', 'Escribe tu nombre primero.'); $('h-nombre').focus(); return; }
  mensaje('hogar-msg', '');
  try {
    const { data } = await D.sb.auth.getUser();
    await fn(nombre);
    await entrarCon(data.user);
    return true;
  } catch (err) { mensaje('hogar-msg', D.mensajeError(err)); return false; }
}
$('h-crear').addEventListener('click', async () => {
  if (await accionHogar((n) => D.crearHogar(n))) abrirAjustes();
});
$('h-unirse').addEventListener('click', () => {
  const codigo = $('h-codigo').value.trim().toUpperCase();
  if (codigo.length !== 6) { mensaje('hogar-msg', 'El código tiene 6 letras o números.'); return; }
  accionHogar((n) => D.unirse(codigo, n));
});
$('h-salir').addEventListener('click', cerrarSesion);

// ===== Datos =====
// Se lee todo de nuevo (antes se sube lo que quedó pendiente sin conexión)
async function cargarTodo(hogarId) {
  if (D.leerCola().length && await D.subirCola()) toast('Algún cambio hecho sin conexión no se pudo guardar.');
  const [hogar, miembros, compra, tareas, eventos, deCompras, menu, comensales] = await D.conTiempo(Promise.all([
    D.hogar(hogarId), D.miembros(hogarId), D.cargar('compra'), D.cargar('tareas'), D.cargar('eventos'),
    // si la base de datos aún no tiene "Voy a comprar" o el menú, la app sigue funcionando sin ello
    D.cargar('deCompras').catch(() => []), D.cargar('menu').catch(() => []), D.cargar('comensales').catch(() => []),
  ]));
  ponerDatos({ hogar, miembros, compra, tareas, eventos, deCompras, menu, comensales });
}
// Lo leído de Supabase, con lo que aún no se ha subido encima; y se guarda la copia para abrir sin conexión
function ponerDatos(datos) {
  Object.assign(S, datos);
  L.aplicarCola(S, D.leerCola());
  D.guardarCopia(S);
}

const esperas = {};
function recargar(tipo) {
  clearTimeout(esperas[tipo]);
  esperas[tipo] = setTimeout(async () => {
    try {
      ponerDatos({ [tipo]: tipo === 'miembros' ? await D.miembros(S.hogar.id) : await D.cargar(tipo) });
      pintar();
    } catch (err) { console.error(err); }
  }, 250);
}

function alCambio(tipo, p) {
  if (tipo === 'deCompras') avisarCompra(p);
  recargar(tipo);
  if (p.eventType === 'INSERT' && deOtro(p.new)) avisarNovedad(tipo, p.new);
}

function avisarNovedad(tipo, f) {
  const quien = nombreDe(f.creado_por);
  const hoy = L.hoyISO();
  // cada texto se calcula solo para su tipo (una compra no tiene fecha de cita)
  const [titulo, cuerpo] = ({
    compra: () => [`${quien} ha añadido a la compra`, f.texto + (f.fecha_limite ? ` · ${L.textoPlazo(f.fecha_limite, hoy)}` : '')],
    tareas: () => [`${quien} ha añadido una tarea`, f.texto],
    eventos: () => [`${quien} ha añadido al calendario`, `${f.titulo} · ${L.textoFecha(f.fecha, hoy)}${f.hora ? ' a las ' + L.textoHora(f.hora) : ''}`],
  }[tipo] || (() => []))();
  if (!titulo) return;
  if (document.visibilityState === 'visible') toast(`${titulo}: ${cuerpo}`);
  else if (!A.pushActivo) A.notificar(titulo, cuerpo, `nuevo:${f.id}`);
}

// "Ana va a la compra" / "Ana ha terminado la compra" (la notificación push la manda Supabase)
async function avisarCompra(p) {
  let titulo, cuerpo;
  if (p.eventType === 'DELETE') {
    const antes = L.comprandoAhora(S.deCompras).find((f) => f.user_id === p.old?.user_id);
    if (!antes || antes.user_id === S.yo) return;
    // la lista se lee de nuevo, por si lo último que marcó aún no había llegado a este móvil
    try { ponerDatos({ compra: await D.cargar('compra') }); } catch (err) { console.error(err); }
    titulo = `${nombreDe(antes.user_id)} ha terminado la compra`;
    cuerpo = L.textoResumen(L.resumenCompra(S.compra, antes.creado_en));
  } else {
    if (!p.new || p.new.user_id === S.yo || p.new.hogar_id !== S.hogar?.id) return;
    titulo = `${nombreDe(p.new.user_id)} va a la compra`;
    cuerpo = '¿Falta algo? Añádelo ahora y le aparecerá al momento.';
  }
  if (document.visibilityState === 'visible') toast(`${titulo}. ${cuerpo}`);
  else if (!A.pushActivo) A.notificar(titulo, cuerpo, 'compra');
}

// Lo urgente se avisa una vez al día. Con la app a la vista ya se ve en "Para hoy";
// con la app en segundo plano llega como notificación, pero solo las tareas y citas de hoy (la compra no).
function revisarAvisos() {
  if (!S.hogar) return;
  const hoy = L.hoyISO(), visible = document.visibilityState === 'visible';
  for (const a of L.avisosPendientes(S, new Date())) {
    if (a.tipo === 'compra' || a.estado !== 'hoy' || A.yaAvisado(a.clave)) continue;
    if (!visible) { if (!A.pushActivo) A.notificar(a.titulo, a.cuerpo, a.clave); }
    else if (a.tipo === 'pronto') toast(`${a.titulo} · ${a.cuerpo}`);
    A.marcar(a.clave, hoy);
  }
}
setInterval(() => { if (S.hogar) { pintar(); revisarAvisos(); } }, 5 * 60 * 1000);

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.hogar) return;
  mostrarBandaPermiso();
  await refrescar();
  revisarAvisos();
});

// Sin conexión: se avisa arriba (con lo que falta por subir) y, al volver, se sube y se lee todo de nuevo
function estadoRed() {
  const texto = L.textoSinRed(D.leerCola().length, !navigator.onLine);
  $('sin-red').hidden = !texto;
  if (texto) $('sin-red').querySelector('span').textContent = texto;
}
D.alCambiarCola(estadoRed);
async function refrescar() {
  if (!S.hogar) return;
  try {
    if (S.conectado !== false) { await cargarTodo(S.hogar.id); pintar(); return; }
    // se abrió sin conexión: ahora se entra de verdad (sesión, datos y cambios en directo)
    const { data } = await D.sb.auth.getSession();
    if (data.session) await entrarCon(data.session.user);
    else if (navigator.onLine) vista('v-login');
  } catch (err) { console.error(err); }
}
window.addEventListener('offline', estadoRed);
window.addEventListener('online', () => { estadoRed(); refrescar(); });
// con cobertura mala el móvil cree que hay conexión pero no contesta: se reintenta cada 20 s
setInterval(() => { if (S.hogar && navigator.onLine && (D.leerCola().length || S.conectado === false)) refrescar(); }, 20000);

// Cambios hechos desde este móvil: se ven al momento y, si falla, se deshacen
// Cambios que aún se están guardando (para que "He terminado" espere a la última cosa marcada)
const enCamino = new Set();
function seguir(promesa) { enCamino.add(promesa); promesa.finally(() => enCamino.delete(promesa)); return promesa; }
function cambiar(tipo, fila, cambios) {
  const antes = { ...fila };
  Object.assign(fila, cambios);
  pintar();
  return seguir(D.actualizar(tipo, fila.id, cambios).catch((err) => { Object.assign(fila, antes); pintar(); fallo(err); }));
}

async function quitar(tipo, filas, texto) {
  filas = [].concat(filas);
  const ids = new Set(filas.map((f) => f.id));
  S[tipo] = S[tipo].filter((f) => !ids.has(f.id));
  pintar();
  try {
    await D.borrar(tipo, [...ids]);
    toast(texto);
  } catch (err) { S[tipo].push(...filas); pintar(); fallo(err); }
}

// ===== Pestañas =====
function irA(t) {
  document.querySelectorAll('nav.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === t)));
  document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('on', s.id === `t-${t}`));
  try { localStorage.setItem('fam-tab', t); } catch (e) { /* sin almacenamiento */ }
  ponerTitulo();
  window.scrollTo(0, 0);
}
// Arriba, en grande: en la compra el día de hoy; en las demás pestañas, su nombre
function ponerTitulo() {
  const t = document.querySelector('nav.tabs button[aria-selected="true"]')?.dataset.t || 'compra';
  const d = new Date();
  const dia = d.toLocaleDateString('es-ES', { weekday: 'long' });
  const pend = S.tareas.filter((x) => !x.hecho).length;
  const [titulo, sub] = {
    compra: [dia.charAt(0).toUpperCase() + dia.slice(1), `${d.getDate()} de ${L.MESES[d.getMonth()]}`],
    menu: ['Menú', 'de la semana'],
    tareas: ['Tareas', pend ? `${pend} ${pend === 1 ? 'pendiente' : 'pendientes'}` : 'Todo hecho'],
    cal: ['Calendario', 'citas y fechas'],
  }[t];
  $('titulo').firstChild.textContent = titulo;
  $('subtitulo').textContent = sub;
}
document.querySelectorAll('nav.tabs button').forEach((b) => b.addEventListener('click', () => irA(b.dataset.t)));
try { const t = localStorage.getItem('fam-tab'); if (t) irA(t); } catch (e) { /* sin almacenamiento */ }

// ===== Pintar =====
// Mientras se edita algo no se vuelve a pintar (se perdería lo que se está escribiendo):
// se pinta al guardar o cancelar.
function pintar() {
  if (S.editando && document.querySelector('.item.editar')) return;
  pintarYa();
}
// Lo que aparece nuevo en la lista entra con una pequeña animación (no al abrir la app)
let vistos = null;
const entra = (id) => (vistos && !vistos.has(id) ? ' entra' : '');
function pintarYa() {
  ponerTitulo();
  pintarHoy();
  pintarCompra();
  pintarTareas();
  pintarCalendario();
  pintarMenu();
  const hoy = L.hoyISO();
  const nCompra = S.compra.filter((c) => !c.hecho).length;
  const nTareas = S.tareas.filter((t) => !t.hecho).length;
  const nHoy = S.eventos.filter((e) => e.fecha === hoy).length;
  for (const [id, n] of [['n-compra', nCompra], ['n-tareas', nTareas], ['n-cal', nHoy]]) {
    $(id).textContent = n > 99 ? '99+' : n;
    $(id).hidden = !n;
  }
  A.ponerContador(nCompra);
  vistos = new Set([...S.compra, ...S.tareas, ...S.eventos, ...S.menu].map((f) => f.id));
}

function pintarHoy() {
  const av = L.avisosPendientes(S, new Date()).filter((a) => a.tipo !== 'pronto');
  // Lo de hoy (y lo atrasado) arriba; lo de mañana, debajo en "Próximamente"
  const prox = av.filter((a) => a.estado === 'manana'), hoy = av.filter((a) => a.estado !== 'manana');
  $('hoy').hidden = !av.length;
  for (const [id, lista] of [['hoy', hoy], ['prox', prox]]) {
    $(`${id}-t`).hidden = $(`${id}-lista`).hidden = !lista.length;
    $(`${id}-lista`).replaceChildren(...lista.map((a) => el('li', { class: `e-${a.estado}` },
      // un punto: rojo si es de hoy o está atrasado
      el('span', { class: 'ico', 'aria-hidden': 'true' }),
      el('span', {}, el('b', {}, a.titulo), el('small', {}, a.cuerpo)))));
  }
}

function check(hecho, etiqueta, onclick) {
  return el('button', { type: 'button', class: 'check', 'aria-pressed': String(hecho), 'aria-label': etiqueta, onclick });
}
const PAPELERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg>';
function borrarBtn(etiqueta, onclick) {
  const b = el('button', { type: 'button', class: 'borrar', 'aria-label': etiqueta, onclick });
  b.innerHTML = PAPELERA;
  return b;
}
const cuerpo = (...hijos) => el('div', { class: 'cuerpo' }, ...hijos);
// El lápiz, al lado de la papelera, abre la edición (tocar el texto no hace nada, para no editar sin querer)
const LAPIZ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
function editarBtn(id) {
  const b = el('button', { type: 'button', class: 'editar-btn', 'aria-label': 'Editar', onclick: () => abrirEdicion(id) });
  b.innerHTML = LAPIZ;
  return b;
}
function plazo(iso, hoy) {
  return el('span', { class: `e-${L.estadoFecha(iso, hoy)}` }, L.textoPlazo(iso, hoy));
}
function meta(...partes) {
  const p = partes.filter(Boolean);
  if (!p.length) return null;
  const m = el('span', { class: 'meta' });
  p.forEach((x, i) => { if (i) m.append(' · '); m.append(x); });
  return m;
}

// ----- Confirmar antes de marcar o borrar -----
// Para no marcar ni borrar nada sin querer, primero se pregunta. Lo de marcar se cancela solo a los 5 s;
// lo de borrar (botón rojo) se queda hasta que se diga Sí o No.
let confirmarT;
const confirmando = (clave) => S.confirmando === clave;
function pedirConfirmar(clave, solo5s = false) {
  S.confirmando = clave;
  S.editando = null;
  pintar();
  clearTimeout(confirmarT);
  if (solo5s) confirmarT = setTimeout(() => { if (S.confirmando === clave) { S.confirmando = null; pintar(); } }, 5000);
}
function noConfirmar() { S.confirmando = null; pintar(); }
function filaConfirmar(texto, pregunta, textoSi, si, rojo = false) {
  const li = el('li', { class: `item confirmar${rojo ? ' peligro' : ''}` },
    el('div', { class: 'cuerpo' }, el('span', { class: 'txt' }, texto), el('span', { class: 'meta' }, pregunta)),
    el('button', { type: 'button', class: 'mini no', onclick: noConfirmar }, 'No'),
    el('button', { type: 'button', class: 'mini si', onclick: () => {
      // se va deslizando y después se marca o se borra
      S.confirmando = null;
      li.classList.add('sale');
      li.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const espera = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
      seguir(new Promise((listo) => setTimeout(() => Promise.resolve(si()).finally(listo), espera)));
    } }, textoSi));
  return li;
}

// ----- Editar lo apuntado -----
// Al tocar el texto, la fila se convierte en un pequeño formulario (texto y, según el tipo, lista, persona, fecha u hora).
function abrirEdicion(id) {
  S.confirmando = null;
  S.editando = id;
  pintarYa();
  const inp = document.querySelector('section.tab.on .item.editar .txt-edit') || document.querySelector('.item.editar .txt-edit');
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
function cerrarEdicion() { S.editando = null; pintar(); }

const opciones = (pares, valor) => pares.map(([v, t]) => el('option', { value: v, selected: v === valor }, t));
function filaEditar(tipo, fila) {
  const campoTexto = tipo === 'eventos' ? 'titulo' : 'texto';
  const texto = el('input', { class: 'txt-edit', value: fila[campoTexto], maxLength: 200, autocomplete: 'off', enterKeyHint: 'done',
    'aria-label': tipo === 'eventos' ? 'Título' : 'Texto' });
  const extra = [];
  const pastilla = (etiqueta, control) => { extra.push(el('label', { class: 'pastilla' }, el('span', {}, etiqueta), control)); return control; };
  let lista, para, fecha, hora, cant, dia, momento, quienes;
  let abajo = null;
  if (tipo === 'menu') {
    cant = pastilla('Cantidad', el('input', { value: fila.cantidad || '', maxLength: 40, autocomplete: 'off' }));
    dia = pastilla('Día', el('select', {}, opciones(L.DIAS_MENU.map((d, i) => [String(i + 1), d]), String(fila.dia))));
    momento = pastilla('Para', el('select', {}, opciones(L.MOMENTOS, fila.momento)));
    quienes = new Set(fila.quienes || []);
    abajo = el('div', { class: 'quienes', role: 'group', 'aria-label': 'Quién come' }, botonesQuienes(quienes));
  } else if (tipo === 'compra') {
    const nombres = L.LISTAS.includes(fila.lista) ? L.LISTAS : [...L.LISTAS, fila.lista];
    lista = pastilla('Lista', el('select', {}, opciones(nombres.map((l) => [l, l]), fila.lista)));
  } else if (tipo === 'tareas') {
    para = pastilla('Para', el('select', {}, opciones([['', 'Cualquiera'],
      ...S.miembros.map((m) => [m.user_id, m.user_id === S.yo ? `${m.nombre} (tú)` : m.nombre])], fila.para || '')));
    fecha = pastilla('Cuándo', el('input', { type: 'date', value: fila.fecha || '' }));
  } else if (tipo === 'eventos') {
    fecha = pastilla('Día', el('input', { type: 'date', value: fila.fecha, required: true }));
    hora = pastilla('Hora', el('input', { type: 'time', value: fila.hora ? fila.hora.slice(0, 5) : '' }));
  }
  const guardar = (e) => {
    e.preventDefault();
    const nuevo = L.mayuscula(texto.value.trim(), nombresMenu());
    if (!nuevo) { texto.focus(); return; }
    const cambios = {};
    const poner = (k, v) => { if ((fila[k] ?? null) !== v) cambios[k] = v; };
    poner(campoTexto, nuevo);
    if (lista) poner('lista', lista.value);
    if (para) poner('para', para.value || null);
    if (tipo === 'tareas') poner('fecha', fecha.value || null);
    if (tipo === 'eventos') {
      if (fecha.value) poner('fecha', fecha.value);
      // la hora se guarda como HH:MM:SS; solo cuenta como cambio si es otra hora
      if ((fila.hora ? fila.hora.slice(0, 5) : '') !== hora.value) cambios.hora = hora.value || null;
    }
    if (tipo === 'menu') {
      poner('cantidad', cant.value.trim() || null);
      poner('dia', Number(dia.value));
      poner('momento', momento.value);
      const ids = ordenQuienes(quienes);
      if (ids.join() !== (fila.quienes || []).join()) cambios.quienes = ids;
    }
    S.editando = null;
    if (Object.keys(cambios).length) cambiar(tipo, fila, cambios); else pintar();
  };
  return el('li', { class: 'item editar' },
    el('form', { onsubmit: guardar, onkeydown: (e) => { if (e.key === 'Escape') cerrarEdicion(); } },
      texto,
      extra.length ? el('div', { class: 'opciones' }, extra) : null,
      abajo,
      el('div', { class: 'botones' },
        el('button', { type: 'button', class: 'mini no', onclick: cerrarEdicion }, 'Cancelar'),
        el('button', { type: 'submit', class: 'mini si' }, 'Guardar'))));
}
const marcarHecho = (tipo, fila) => () => cambiar(tipo, fila, { hecho: true, hecho_en: new Date().toISOString() });
const filaBorrar = (tipo, fila, texto, aviso) =>
  filaConfirmar(texto, '¿Seguro que quieres borrarlo?', 'Sí, borrar', () => quitar(tipo, fila, aviso), true);

// ----- Compra -----
const miCompra = () => L.comprandoAhora(S.deCompras).find((f) => f.user_id === S.yo);
const esNuevo = (c) => {
  const yo = miCompra();
  return yo && !c.hecho && deOtro(c) && new Date(c.creado_en) >= new Date(yo.creado_en);
};

function itemCompra(c, conLista = true) {
  const hoy = L.hoyISO();
  if (!c.hecho && confirmando(`hecho:${c.id}`)) return filaConfirmar(c.texto, '¿Ya está comprado?', 'Sí, comprado', marcarHecho('compra', c));
  if (confirmando(`borrar:${c.id}`)) return filaBorrar('compra', c, c.texto, `«${c.texto}» borrado`);
  if (S.editando === c.id) return filaEditar('compra', c);
  const nuevo = esNuevo(c);
  return el('li', { class: `item${c.hecho ? ' hecho' : ''}${nuevo ? ' nuevo' : ''}${entra(c.id)}` },
    check(c.hecho, c.hecho ? 'Volver a la lista' : 'Marcar como comprado',
      () => (c.hecho ? cambiar('compra', c, { hecho: false, hecho_en: null }) : pedirConfirmar(`hecho:${c.id}`, true))),
    cuerpo(el('span', { class: 'txt' }, c.texto),
      meta(conLista && c.lista, !c.hecho && c.fecha_limite && plazo(c.fecha_limite, hoy), deOtro(c) && nombreDe(c.creado_por))),
    nuevo && el('span', { class: 'etiqueta-nuevo' }, 'Nuevo'),
    editarBtn(c.id),
    borrarBtn('Borrar', () => pedirConfirmar(`borrar:${c.id}`)));
}

// ----- Voy a comprar -----
const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
function pintarVoy() {
  const activas = L.comprandoAhora(S.deCompras);
  const yo = activas.find((f) => f.user_id === S.yo);
  const otros = activas.filter((f) => f.user_id !== S.yo);
  const partes = [];
  for (const o of otros) {
    const r = L.resumenCompra(S.compra, o.creado_en);
    partes.push(el('div', { class: 'voy otro' },
      el('div', { class: 'voy-txt' }, el('b', {}, `${nombreDe(o.user_id)} está de compras`),
        el('small', {}, `Desde las ${horaDe(o.creado_en)} · lleva ${r.compradas} de ${r.total}. Lo que añadas le llega ya.`))));
  }
  if (yo) {
    const r = L.resumenCompra(S.compra, yo.creado_en);
    if (confirmando('terminar')) {
      partes.push(el('div', { class: 'voy mio' },
        el('div', { class: 'voy-txt' }, el('b', {}, '¿Has terminado la compra?'), el('small', {}, `${L.textoResumen(r, true)}. Lo que queda sigue en la lista.`)),
        el('div', { class: 'voy-botones' },
          el('button', { type: 'button', class: 'mini no', onclick: noConfirmar }, 'Sigo comprando'),
          el('button', { type: 'button', class: 'mini si', onclick: terminarCompra }, 'Sí, he terminado'))));
    } else {
      partes.push(el('div', { class: 'voy mio' },
        el('div', { class: 'voy-txt' }, el('b', {}, 'Estás de compras'),
          el('small', {}, `Desde las ${horaDe(yo.creado_en)} · llevas ${r.compradas} de ${r.total}`)),
        el('button', { type: 'button', class: 'mini si', onclick: () => pedirConfirmar('terminar') }, 'He terminado')));
    }
  } else if (!otros.length) {
    const resto = S.miembros.filter((m) => m.user_id !== S.yo).map((m) => m.nombre);
    partes.push(el('button', { type: 'button', class: 'voy boton', onclick: empezarCompra },
      el('span', { class: 'voy-txt' }, el('b', {}, 'Voy a comprar'),
        el('small', {}, resto.length ? `${resto.join(' y ')} lo verá y podrá añadir lo que falte` : 'Avisa a la casa de que sales a comprar'))));
  }
  $('c-voy').replaceChildren(...partes);
}
async function empezarCompra() {
  const fila = { user_id: S.yo, hogar_id: S.hogar.id, creado_en: new Date().toISOString() };
  S.deCompras = [...S.deCompras.filter((f) => f.user_id !== S.yo), fila];
  pintar();
  try { await D.empezarCompra(S.yo, S.hogar.id); } catch (err) { S.deCompras = S.deCompras.filter((f) => f !== fila); pintar(); fallo(err); }
}
async function terminarCompra() {
  S.confirmando = null;
  const antes = S.deCompras;
  S.deCompras = S.deCompras.filter((f) => f.user_id !== S.yo);
  pintar();
  // primero se guarda lo último que se marcó; si no, el resumen de la otra persona podría no incluirlo
  await Promise.allSettled([...enCamino]);
  await D.subirCola();
  try { await D.terminarCompra(S.yo); toast('Compra terminada. ¡Gracias!'); } catch (err) { S.deCompras = antes; pintar(); fallo(err); }
}

function pintarCompra() {
  pintarVoy();
  const sel = $('c-lista');
  if (!sel.options.length) sel.append(...L.LISTAS.map((l) => el('option', { value: l }, l)));
  const pend = S.compra.filter((c) => !c.hecho);
  const filtros = ['Todas', ...L.LISTAS, ...new Set(pend.map((c) => c.lista).filter((l) => !L.LISTAS.includes(l)))];
  if (!filtros.includes(S.filtro)) S.filtro = 'Todas';
  $('c-filtro').replaceChildren(...filtros.map((f) => {
    const n = f === 'Todas' ? pend.length : pend.filter((c) => c.lista === f).length;
    if (f !== 'Todas' && !n && S.filtro !== f) return null;
    return el('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.filtro === f),
      onclick: () => { S.filtro = f; if (L.LISTAS.includes(f)) sel.value = f; pintarCompra(); } },
    f, n ? el('b', {}, String(n)) : null);
  }).filter(Boolean));
  $('c-filtro').hidden = $('c-filtro').children.length <= 2;

  const enFiltro = (c) => S.filtro === 'Todas' || c.lista === S.filtro;
  const lista = pend.filter(enFiltro);
  // Agrupado por categorías (fruta, panadería, congelados...); el título solo si hay más de un grupo
  const grupos = L.agruparCompra(lista);
  $('c-pend').replaceChildren(...grupos.flatMap((g) => [
    grupos.length > 1 ? el('li', { class: 'grupo' }, `${g.icono} ${g.nombre}`) : null,
    ...g.items.map((c) => itemCompra(c, S.filtro === 'Todas')),
  ]).filter(Boolean));
  $('c-vacio').hidden = lista.length > 0;

  const hechos = S.compra.filter((c) => c.hecho && enFiltro(c))
    .sort((x, y) => String(y.hecho_en).localeCompare(String(x.hecho_en)));
  const det = $('c-hechos');
  det.hidden = !hechos.length;
  det.querySelector('summary span').textContent = hechos.length;
  det.querySelector('ul').replaceChildren(...hechos.map((c) => itemCompra(c, S.filtro === 'Todas')));
  $('c-vaciar').hidden = confirmando('vaciar:compra');
  $('c-vaciar-pregunta').hidden = !confirmando('vaciar:compra');
}

$('f-compra').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('c-texto'), texto = inp.value;
  const textos = texto.split(/[,\n]/).map((t) => L.mayuscula(t.trim(), nombresCasa())).filter(Boolean);
  if (!textos.length) return;
  const lista = $('c-lista').value;
  inp.value = '';
  inp.focus();
  try {
    S.compra.push(...await D.insertar('compra', textos.map((t) => ({ hogar_id: S.hogar.id, texto: t, lista })), S.yo));
    pintar();
  } catch (err) { inp.value = texto; fallo(err); }
});

$('c-vaciar').addEventListener('click', () => pedirConfirmar('vaciar:compra'));
$('c-vaciar-no').addEventListener('click', noConfirmar);
$('c-vaciar-si').addEventListener('click', () => {
  S.confirmando = null;
  const hechos = S.compra.filter((c) => c.hecho && (S.filtro === 'Todas' || c.lista === S.filtro));
  if (hechos.length) quitar('compra', hechos, `${hechos.length} ${hechos.length === 1 ? 'cosa borrada' : 'cosas borradas'}`);
  else pintar();
});

// ----- Tareas -----
function itemTarea(t) {
  const hoy = L.hoyISO();
  const para = t.para ? (t.para === S.yo ? 'Para ti' : `Para ${nombreDe(t.para)}`) : null;
  if (!t.hecho && confirmando(`hecho:${t.id}`)) return filaConfirmar(t.texto, '¿Ya está hecha?', 'Sí, hecha', marcarHecho('tareas', t));
  if (confirmando(`borrar:${t.id}`)) return filaBorrar('tareas', t, t.texto, `«${t.texto}» borrada`);
  if (S.editando === t.id) return filaEditar('tareas', t);
  return el('li', { class: `item${t.hecho ? ' hecho' : ''}${entra(t.id)}` },
    check(t.hecho, t.hecho ? 'Marcar como pendiente' : 'Marcar como hecha',
      () => (t.hecho ? cambiar('tareas', t, { hecho: false, hecho_en: null }) : pedirConfirmar(`hecho:${t.id}`, true))),
    cuerpo(el('span', { class: 'txt' }, t.texto),
      meta(!t.hecho && t.fecha && plazo(t.fecha, hoy), para, deOtro(t) && `Añadida por ${nombreDe(t.creado_por)}`)),
    editarBtn(t.id),
    borrarBtn('Borrar', () => pedirConfirmar(`borrar:${t.id}`)));
}

function pintarTareas() {
  const sel = $('t-para'), valor = sel.value;
  sel.replaceChildren(el('option', { value: '' }, 'Cualquiera'),
    ...S.miembros.map((m) => el('option', { value: m.user_id }, m.user_id === S.yo ? `${m.nombre} (tú)` : m.nombre)));
  sel.value = S.miembros.some((m) => m.user_id === valor) ? valor : '';

  const pend = L.ordenarPendientes(S.tareas.filter((t) => !t.hecho), 'fecha');
  $('t-pend').replaceChildren(...pend.map(itemTarea));
  $('t-vacio').hidden = pend.length > 0;
  const hechas = S.tareas.filter((t) => t.hecho).sort((x, y) => String(y.hecho_en).localeCompare(String(x.hecho_en)));
  const det = $('t-hechas');
  det.hidden = !hechas.length;
  det.querySelector('summary span').textContent = hechas.length;
  det.querySelector('ul').replaceChildren(...hechas.map(itemTarea));
  $('t-vaciar').hidden = confirmando('vaciar:tareas');
  $('t-vaciar-pregunta').hidden = !confirmando('vaciar:tareas');
}

$('f-tarea').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('t-texto'), texto = L.mayuscula(inp.value.trim(), nombresCasa());
  if (!texto) return;
  const fila = { hogar_id: S.hogar.id, texto, para: $('t-para').value || null, fecha: $('t-fecha').value || null };
  inp.value = ''; $('t-fecha').value = '';
  inp.focus();
  try { S.tareas.push(...await D.insertar('tareas', fila, S.yo)); pintar(); } catch (err) { inp.value = texto; fallo(err); }
});

$('t-vaciar').addEventListener('click', () => pedirConfirmar('vaciar:tareas'));
$('t-vaciar-no').addEventListener('click', noConfirmar);
$('t-vaciar-si').addEventListener('click', () => {
  S.confirmando = null;
  const hechas = S.tareas.filter((t) => t.hecho);
  if (hechas.length) quitar('tareas', hechas, `${hechas.length} ${hechas.length === 1 ? 'tarea borrada' : 'tareas borradas'}`);
  else pintar();
});

// ----- Menú de la semana -----
function itemMenu(f) {
  if (confirmando(`borrar:${f.id}`)) return filaBorrar('menu', f, f.texto, `«${f.texto}» borrado`);
  if (S.editando === f.id) return filaEditar('menu', f);
  const porId = new Map(personasMenu().map((p) => [p.id, p]));
  const gente = (f.quienes || []).map((id) => porId.get(id)).filter(Boolean);
  return el('li', { class: `item plato${entra(f.id)}` },
    cuerpo(el('span', { class: 'txt' }, f.texto),
      gente.length ? el('span', { class: 'gente' }, gente.map((p) => el('span', { class: p.cuenta ? null : 'peque' }, p.nombre))) : null),
    f.cantidad ? el('span', { class: 'cant' }, f.cantidad) : null,
    editarBtn(f.id),
    borrarBtn('Borrar', () => pedirConfirmar(`borrar:${f.id}`)));
}

function pintarMenu() {
  const hoy = L.hoyISO(), estaSemana = L.lunesDe(hoy);
  if (!S.semana) S.semana = L.semanaMenu(hoy);
  $('m-titulo').textContent = L.textoSemana(S.semana);

  // lo elegido para añadir: el día (hoy si es de lunes a viernes de esta semana), comida o cena y quién come
  const sel = $('m-dia');
  if (!sel.options.length) sel.append(...L.DIAS_MENU.map((d, i) => el('option', { value: String(i + 1) }, d)));
  if (!S.mDia) S.mDia = (S.semana === estaSemana && L.diaMenu(hoy)) || 1;
  sel.value = String(S.mDia);
  $('m-momento').replaceChildren(...L.MOMENTOS.map(([clave, titulo]) => el('button', { type: 'button', 'aria-pressed': String(S.mMomento === clave),
    onclick: () => { S.mMomento = clave; pintarMenu(); } }, titulo)));
  const ids = new Set(personasMenu().map((p) => p.id));
  // mientras no se toquen, comen todas las personas con cuenta (también quien se una después);
  // lo que ya no existe se quita
  if (!S.mQuienesTocado) S.mQuienes = new Set(S.miembros.map((m) => m.user_id));
  for (const id of S.mQuienes) if (!ids.has(id)) S.mQuienes.delete(id);
  $('m-quienes').replaceChildren(...botonesQuienes(S.mQuienes, () => { S.mQuienesTocado = true; }));

  const dias = L.agruparMenu(S.menu, S.semana);
  const conAlgo = new Set(dias.map((d) => d.dia));
  const hoyDia = S.semana === estaSemana ? L.diaMenu(hoy) : 0;
  // la tira de los 5 días: los vacíos, apagados; tocar uno con platos lleva a él, uno vacío abre "Añadir plato"
  $('m-tira').replaceChildren(...L.DIAS_MENU.map((nombre, i) => {
    const dia = i + 1, fecha = L.deISO(L.sumarDias(S.semana, i));
    return el('button', { type: 'button', class: [dia === hoyDia ? 'hoy' : '', conAlgo.has(dia) ? '' : 'vacio-dia'].join(' ').trim() || null,
      'aria-label': `${nombre} ${fecha.getDate()}${conAlgo.has(dia) ? '' : ', sin nada'}`,
      onclick: () => (conAlgo.has(dia) ? $(`m-d${dia}`).scrollIntoView({ behavior: 'smooth', block: 'start' }) : abrirMenu(dia)) },
    el('b', {}, String(fecha.getDate())), el('small', {}, nombre.slice(0, 3)), el('i'));
  }));
  // cada día con algo: su nombre y una hoja con la comida y la cena
  $('m-dias').replaceChildren(...dias.flatMap((d) => [
    el('h3', { class: 'dia-menu', id: `m-d${d.dia}` }, d.nombre, d.dia === hoyDia ? el('span', { class: 'hoy-et' }, 'Hoy') : null),
    el('ul', { class: 'lista' }, d.momentos.flatMap((m) => [el('li', { class: 'momento' }, m.titulo), ...m.platos.map(itemMenu)])),
  ]));
  $('m-vacio').hidden = dias.length > 0;
}

// Añadir plato: se abre una hoja desde abajo y se pueden añadir varios seguidos
function abrirMenu(dia) {
  if (dia) S.mDia = dia;
  pintarMenu();
  $('s-menu').hidden = false;
  $('m-texto').focus();
}
const cerrarMenu = () => { $('s-menu').hidden = true; };
$('m-abrir').addEventListener('click', () => abrirMenu());
$('m-cerrar').addEventListener('click', cerrarMenu);
$('m-cancelar').addEventListener('click', cerrarMenu);
$('s-menu').addEventListener('click', (e) => { if (e.target.id === 's-menu') cerrarMenu(); });
$('s-menu').addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });

$('m-dia').addEventListener('change', (e) => { S.mDia = Number(e.target.value); });
$('m-ant').addEventListener('click', () => { S.semana = L.sumarDias(S.semana, -7); pintarMenu(); });
$('m-sig').addEventListener('click', () => { S.semana = L.sumarDias(S.semana, 7); pintarMenu(); });
// Intro en la comida pasa a la cantidad (si está vacía); Intro en la cantidad añade
$('m-texto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !$('m-cant').value.trim()) { e.preventDefault(); $('m-cant').focus(); }
});
$('f-menu').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('m-texto'), cant = $('m-cant');
  const texto = L.mayuscula(inp.value.trim(), nombresMenu()), cantidad = cant.value.trim();
  if (!texto) { inp.focus(); return; }
  const fila = { hogar_id: S.hogar.id, semana: S.semana, dia: S.mDia, momento: S.mMomento, texto,
    cantidad: cantidad || null, quienes: ordenQuienes(S.mQuienes) };
  // un plato cada vez: al añadirlo se cierra la hoja (si falla, vuelve a abrirse con lo escrito)
  inp.value = ''; cant.value = '';
  cerrarMenu();
  try {
    S.menu.push(...await D.insertar('menu', fila, S.yo)); pintar();
    toast(`«${texto}» añadido: ${L.DIAS_MENU[fila.dia - 1].toLowerCase()}, ${fila.momento}`);
  } catch (err) { inp.value = texto; cant.value = cantidad; $('s-menu').hidden = false; fallo(err); }
});

// ----- Calendario -----
function itemEvento(ev, conFecha = false) {
  const hoy = L.hoyISO();
  // la fecha va sola al principio de la línea: con mayúscula ("Mañana · 18:00", "Vie 9 oct")
  const fecha = conFecha ? L.textoFecha(ev.fecha, hoy) : '';
  const cuando = conFecha ? `${fecha.charAt(0).toUpperCase() + fecha.slice(1)}${ev.hora ? ' · ' + L.textoHora(ev.hora) : ''}` : (ev.hora ? L.textoHora(ev.hora) : 'Todo el día');
  if (confirmando(`borrar:${ev.id}`)) return filaBorrar('eventos', ev, ev.titulo, `«${ev.titulo}» borrado`);
  if (S.editando === ev.id) return filaEditar('eventos', ev);
  return el('li', { class: `item evento${entra(ev.id)}` },
    el('span', { class: 'hora' }, cuando),
    cuerpo(el('span', { class: 'txt' }, ev.titulo), meta(deOtro(ev) && nombreDe(ev.creado_por))),
    editarBtn(ev.id),
    borrarBtn('Borrar', () => pedirConfirmar(`borrar:${ev.id}`)));
}

function pintarCalendario() {
  const hoy = L.hoyISO();
  if (!S.mes) { const d = new Date(); S.mes = { a: d.getFullYear(), m: d.getMonth() }; }
  const { a, m } = S.mes;
  $('cal-titulo').textContent = `${L.MESES[m].charAt(0).toUpperCase() + L.MESES[m].slice(1)} ${a}`;

  const marcas = {};
  const poner = (iso, tipo) => { (marcas[iso] ||= new Set()).add(tipo); };
  S.eventos.forEach((e) => poner(e.fecha, 'ev'));
  S.tareas.forEach((t) => { if (!t.hecho && t.fecha) poner(t.fecha, 'otro'); });
  S.compra.forEach((c) => { if (!c.hecho && c.fecha_limite) poner(c.fecha_limite, 'otro'); });

  $('cal-dias').replaceChildren(...L.cuadriculaMes(a, m).map((d) => {
    const clases = ['dia', d.delMes ? '' : 'fuera', d.iso === hoy ? 'hoy' : '', d.iso === S.dia ? 'sel' : ''].filter(Boolean).join(' ');
    const puntos = marcas[d.iso] ? el('span', { class: 'puntos' }, [...marcas[d.iso]].map((t) => el('i', { class: t }))) : null;
    return el('button', { type: 'button', class: clases, 'aria-label': L.tituloDia(d.iso, hoy), 'aria-pressed': String(d.iso === S.dia),
      onclick: () => elegirDia(d.iso) }, el('span', {}, String(d.dia)), puntos);
  }));

  $('cal-dia-titulo').textContent = L.tituloDia(S.dia, hoy);
  const dd = L.delDia(S, S.dia);
  const items = [...dd.eventos.map((e) => itemEvento(e)), ...dd.tareas.map(itemTarea), ...dd.compra.map((c) => itemCompra(c))];
  $('cal-dia-lista').replaceChildren(...items);
  $('cal-dia-vacio').hidden = items.length > 0;
  $('e-boton').textContent = `Añadir ${L.diasEntre(hoy, S.dia) === 0 ? 'hoy' : L.diasEntre(hoy, S.dia) === 1 ? 'mañana' : 'el ' + L.textoFecha(S.dia, hoy)}`;

  const fin = L.sumarDias(hoy, 14);
  const prox = L.ordenarEventos(S.eventos.filter((e) => e.fecha > hoy && e.fecha <= fin)).slice(0, 10);
  $('cal-proximos').replaceChildren(...prox.map((e) => itemEvento(e, true)));
  $('cal-prox-vacio').hidden = prox.length > 0;
}

function elegirDia(iso) {
  S.dia = iso;
  const d = L.deISO(iso);
  S.mes = { a: d.getFullYear(), m: d.getMonth() };
  pintarCalendario();
}
function moverMes(n) {
  const d = new Date(S.mes.a, S.mes.m + n, 1);
  S.mes = { a: d.getFullYear(), m: d.getMonth() };
  pintarCalendario();
}
$('cal-ant').addEventListener('click', () => moverMes(-1));
$('cal-sig').addEventListener('click', () => moverMes(1));
$('cal-hoy').addEventListener('click', () => elegirDia(L.hoyISO()));

$('f-evento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('e-titulo'), titulo = L.mayuscula(inp.value.trim(), nombresCasa());
  if (!titulo) return;
  const fila = { hogar_id: S.hogar.id, titulo, fecha: S.dia, hora: $('e-hora').value || null };
  inp.value = ''; $('e-hora').value = '';
  try { S.eventos.push(...await D.insertar('eventos', fila, S.yo)); pintar(); } catch (err) { inp.value = titulo; fallo(err); }
});

// ===== Avisos: permiso =====
// La banda solo sale si nunca se han pedido los avisos en este móvil
async function mostrarBandaPermiso() {
  let descartado = false;
  try { descartado = localStorage.getItem('fam-perm-no') === '1'; } catch (e) { /* sin almacenamiento */ }
  const p = await A.comprobarPermiso();
  $('aviso-perm').hidden = descartado || p !== 'default';
}
async function activarAvisos() {
  $('aviso-perm').hidden = true;
  try { localStorage.setItem('fam-perm-no', '1'); } catch (e) { /* sin almacenamiento */ }
  const r = await A.pedirPermiso();
  if (r === 'granted') { toast('Avisos activados'); A.notificar('Lupita', 'Así te llegarán los avisos.', 'prueba'); activarPush(); }
  else if (r === 'denied') toast('Avisos bloqueados. Puedes activarlos en los ajustes del navegador.');
  if (!$('s-ajustes').hidden) abrirAjustes();
}
$('b-perm').addEventListener('click', activarAvisos);
$('b-perm-no').addEventListener('click', () => {
  $('aviso-perm').hidden = true;
  try { localStorage.setItem('fam-perm-no', '1'); } catch (e) { /* sin almacenamiento */ }
});

function textoPermiso() {
  const p = A.permiso();
  if (p === 'granted') return 'Activados en este móvil: te aviso cuando la otra persona añade algo y te recuerdo lo de hoy.';
  if (p === 'denied') return 'Bloqueados. Actívalos en los ajustes del navegador para esta página.';
  if (p === 'no') return esIOS && !instalada
    ? 'En iPhone, primero instala la app (Compartir › Añadir a pantalla de inicio) y ábrela desde el icono.'
    : 'Este navegador no permite avisos.';
  return 'Desactivados en este dispositivo.';
}

// ===== Ajustes =====
async function compartirCodigo() {
  const texto = `Únete a nuestra casa en Lupita con este código: ${S.hogar.codigo}`;
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) { await navigator.share({ title: 'Lupita', text: texto, url }); return; }
    await navigator.clipboard.writeText(`${texto}\n${url}`);
    toast('Código copiado');
  } catch (e) { /* cancelado */ }
}

// Quién come en casa: las personas sin cuenta (por ejemplo, una hija pequeña) solo salen en el menú.
// Quitar a alguien pide confirmación (el botón pasa a "Quitar").
let quitandoComensal = null;
function bloqueComensales() {
  const input = el('input', { placeholder: 'Añadir persona (solo menú)…', 'aria-label': 'Nombre', maxLength: 30, autocomplete: 'off', enterKeyHint: 'done' });
  const añadir = async (e) => {
    e.preventDefault();
    const nombre = L.mayuscula(input.value.trim(), nombresMenu());
    if (!nombre) { input.focus(); return; }
    try {
      S.comensales.push(...await D.insertar('comensales', { hogar_id: S.hogar.id, nombre }, S.yo));
      pintar(); abrirAjustes();
    } catch (err) { fallo(err); }
  };
  const quitar = async (c) => {
    if (quitandoComensal !== c.id) { quitandoComensal = c.id; abrirAjustes(); return; }
    quitandoComensal = null;
    try {
      await D.borrar('comensales', c.id);
      S.comensales = S.comensales.filter((x) => x.id !== c.id);
      pintar(); abrirAjustes(); toast(`${c.nombre} ya no sale en el menú`);
    } catch (err) { fallo(err); }
  };
  return el('div', { class: 'bloque' }, el('h3', {}, 'Quién come en casa'),
    el('p', { class: 'mut' }, 'Para elegir quién come cada plato del menú. Las personas sin cuenta solo salen en el menú.'),
    S.miembros.map((m) => el('div', { class: 'fila-persona' }, el('span', {}, m.nombre, el('small', {}, 'con cuenta')))),
    S.comensales.map((c) => el('div', { class: 'fila-persona' }, el('span', {}, c.nombre, el('small', {}, 'solo menú')),
      quitandoComensal === c.id
        ? el('button', { type: 'button', class: 'mini si', onclick: () => quitar(c) }, 'Quitar')
        : borrarBtn(`Quitar a ${c.nombre}`, () => quitar(c)))),
    el('form', { class: 'nuevo', onsubmit: añadir }, input, el('button', { class: 'mas', type: 'submit', 'aria-label': 'Añadir persona' }, '+')));
}

// Tema: automático (sigue al móvil), claro u oscuro. Se recuerda en este móvil.
function temaGuardado() { try { return localStorage.getItem('fam-tema') || 'auto'; } catch (e) { return 'auto'; } }
function ponerTema(t) {
  try { if (t === 'auto') localStorage.removeItem('fam-tema'); else localStorage.setItem('fam-tema', t); } catch (e) { /* sin almacenamiento */ }
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const oscuro = t === 'dark' || (t === 'auto' && m.media.includes('dark'));
    m.content = oscuro ? '#151a22' : '#eceff0';
  });
}
function bloqueTema() {
  const seg = el('div', { class: 'seg tres', role: 'group', 'aria-label': 'Tema' });
  const pintarSeg = () => seg.replaceChildren(...[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, txt]) =>
    el('button', { type: 'button', 'aria-pressed': String(temaGuardado() === v), onclick: () => { ponerTema(v); pintarSeg(); } }, txt)));
  pintarSeg();
  return el('div', { class: 'bloque' }, el('h3', {}, 'Tema'), el('p', { class: 'mut' }, 'Automático usa el mismo que el móvil.'), seg);
}

// Recordatorios de las 9:00, 13:30 y 17:30 (con lo de ese día): cada persona decide si los recibe
function bloqueRecordatorios() {
  const yo = S.miembros.find((m) => m.user_id === S.yo);
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Recordatorios de las 9:00, 13:30 y 17:30' });
  const pintarSeg = () => seg.replaceChildren(...[[true, 'Sí'], [false, 'No']].map(([v, txt]) =>
    el('button', { type: 'button', 'aria-pressed': String((yo?.recordatorios !== false) === v), onclick: async () => {
      if (!yo || (yo.recordatorios !== false) === v) return;
      const antes = yo.recordatorios;
      yo.recordatorios = v; pintarSeg();
      try { await D.cambiarRecordatorios(S.yo, v); toast(v ? 'Recordatorios encendidos' : 'Recordatorios apagados'); }
      catch (err) { yo.recordatorios = antes; pintarSeg(); fallo(err); }
    } }, txt)));
  pintarSeg();
  return el('div', { class: 'recordatorios' },
    el('p', { class: 'mut' }, 'Recordatorios a las 9:00, 13:30 y 17:30 con lo de ese día'), seg);
}

async function abrirAjustes() {
  const p = await A.comprobarPermiso();
  $('aj-cont').replaceChildren(
    el('label', { class: 'campo' }, el('span', {}, 'Tu nombre'),
      el('input', { value: miNombre(), maxLength: 30, onchange: async (e) => {
        const nombre = e.target.value.trim();
        if (!nombre) { e.target.value = miNombre(); return; }
        try { await D.cambiarNombre(S.yo, nombre); S.miembros.find((m) => m.user_id === S.yo).nombre = nombre; pintar(); toast('Nombre guardado'); } catch (err) { fallo(err); }
      } })),
    el('div', { class: 'bloque' }, el('h3', {}, 'Código de vuestra casa'),
      el('p', { class: 'mut' }, 'La otra persona crea su cuenta, elige «Ya tengo un código» y escribe este:'),
      el('div', { class: 'codigo' }, S.hogar.codigo),
      el('button', { type: 'button', class: 'btn sec', onclick: compartirCodigo }, 'Enviar el código')),
    el('div', { class: 'bloque' }, el('h3', {}, 'En esta casa'),
      el('ul', { class: 'miembros' }, S.miembros.map((m) => el('li', {}, m.user_id === S.yo ? `${m.nombre} (tú)` : m.nombre)))),
    bloqueComensales(),
    bloqueTema(),
    el('div', { class: 'bloque' }, el('h3', {}, 'Avisos'), el('p', { class: 'mut' }, textoPermiso()),
      p === 'default' ? el('button', { type: 'button', class: 'btn', onclick: activarAvisos }, 'Activar avisos') : null,
      p === 'granted' ? el('button', { type: 'button', class: 'btn sec', onclick: () => A.notificar('Lupita', 'Los avisos funcionan.', 'prueba') }, 'Probar un aviso') : null,
      el('p', { class: 'pista' }, A.pushActivo
        ? 'Llegan aunque la app esté cerrada. Las citas con hora se avisan 1 hora antes.'
        : 'Ahora mismo solo llegan con la app abierta o en segundo plano.'),
      bloqueRecordatorios()),
    el('button', { type: 'button', class: 'btn peligro', onclick: () => { $('s-ajustes').hidden = true; cerrarSesion(); } }, 'Cerrar sesión'),
    el('p', { class: 'pista centro' }, `Versión ${L.VERSION}`));
  $('s-ajustes').hidden = false;
}
$('b-ajustes').addEventListener('click', abrirAjustes);
$('aj-cerrar').addEventListener('click', () => { $('s-ajustes').hidden = true; });
$('s-ajustes').addEventListener('click', (e) => { if (e.target.id === 's-ajustes') $('s-ajustes').hidden = true; });

// Mientras el teclado está abierto, la barra de abajo se esconde (si no, en Android se sube encima del teclado).
// Se mira el tamaño de la pantalla visible: así vuelve también al cerrar el teclado con el botón "atrás".
if (window.visualViewport) {
  const vv = window.visualViewport;
  const ajustar = () => document.body.classList.toggle('escribiendo', vv.height < window.innerHeight - 150);
  vv.addEventListener('resize', ajustar);
  window.addEventListener('resize', ajustar);
}

arrancar();
