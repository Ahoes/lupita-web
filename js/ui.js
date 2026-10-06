// Lupita · pantallas y eventos
import * as D from './datos.js';
import * as L from './logica.js';
import * as A from './avisos.js';
import { esIOS, instalada } from './pwa.js';
import { VAPID_PUBLICA } from './config.js';

const $ = (id) => document.getElementById(id);
const S = {
  yo: null, hogar: null, miembros: [], compra: [], tareas: [], eventos: [],
  filtro: 'Todas', mes: null, dia: L.hoyISO(), canal: null, confirmando: null,
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
const miNombre = () => S.miembros.find((m) => m.user_id === S.yo)?.nombre || '';
const deOtro = (fila) => fila.creado_por && fila.creado_por !== S.yo;

// ===== Arranque y cuenta =====
async function arrancar() {
  if (!D.configurado) return vista('v-config');
  D.sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') { D.desuscribir(S.canal); S.canal = null; S.hogar = null; vista('v-login'); }
    if (evento === 'PASSWORD_RECOVERY') vista('v-clave');
  });
  try {
    const { data } = await D.sb.auth.getSession();
    if (D.enlaceCaducado) {
      modoLogin('olvido');
      mensaje('login-msg', 'El enlace ha caducado o ya se usó. Escribe tu correo y pide otro.');
    }
    if (!data.session) return vista('v-login');
    if (D.vieneDeRecuperar) return vista('v-clave');
    await entrarCon(data.session.user);
  } catch (err) { fallo(err); vista('v-login'); }
}

async function entrarCon(user) {
  S.yo = user.id;
  const m = await D.miMiembro(user.id);
  if (!m) { vista('v-hogar'); $('h-nombre').focus(); return; }
  await cargarTodo(m.hogar_id);
  vista('v-app');
  pintar();
  D.desuscribir(S.canal);
  S.canal = D.suscribir(S.hogar.id, alCambio);
  revisarAvisos();
  await mostrarBandaPermiso();
  activarPush();
}

const activarPush = () => A.activarPush(VAPID_PUBLICA, D.guardarSuscripcion);
async function cerrarSesion() {
  await A.desactivarPush(D.borrarSuscripcion);
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
async function cargarTodo(hogarId) {
  const [hogar, miembros, compra, tareas, eventos] = await Promise.all([
    D.hogar(hogarId), D.miembros(hogarId), D.cargar('compra'), D.cargar('tareas'), D.cargar('eventos'),
  ]);
  Object.assign(S, { hogar, miembros, compra, tareas, eventos });
}

const esperas = {};
function recargar(tipo) {
  clearTimeout(esperas[tipo]);
  esperas[tipo] = setTimeout(async () => {
    try {
      S[tipo] = tipo === 'miembros' ? await D.miembros(S.hogar.id) : await D.cargar(tipo);
      pintar();
    } catch (err) { console.error(err); }
  }, 250);
}

function alCambio(tipo, p) {
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

// Lo urgente se avisa una vez al día. Con la app a la vista ya se ve en "Para hoy";
// con la app en segundo plano llega como notificación.
function revisarAvisos() {
  if (!S.hogar) return;
  const hoy = L.hoyISO(), visible = document.visibilityState === 'visible';
  for (const a of L.avisosPendientes(S, new Date())) {
    if (A.yaAvisado(a.clave)) continue;
    if (!visible) { if (!A.pushActivo) A.notificar(a.titulo, a.cuerpo, a.clave); }
    else if (a.tipo === 'pronto') toast(`${a.titulo} · ${a.cuerpo}`);
    A.marcar(a.clave, hoy);
  }
}
setInterval(() => { if (S.hogar) { pintar(); revisarAvisos(); } }, 5 * 60 * 1000);

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.hogar) return;
  mostrarBandaPermiso();
  try { await cargarTodo(S.hogar.id); pintar(); revisarAvisos(); } catch (err) { console.error(err); }
});

// Cambios hechos desde este móvil: se ven al momento y, si falla, se deshacen
async function cambiar(tipo, fila, cambios) {
  const antes = { ...fila };
  Object.assign(fila, cambios);
  pintar();
  try { await D.actualizar(tipo, fila.id, cambios); } catch (err) { Object.assign(fila, antes); pintar(); fallo(err); }
}

async function quitar(tipo, filas, texto) {
  filas = [].concat(filas);
  const ids = new Set(filas.map((f) => f.id));
  S[tipo] = S[tipo].filter((f) => !ids.has(f.id));
  pintar();
  try {
    await D.borrar(tipo, [...ids]);
    toast(texto, { texto: 'Deshacer', fn: () => volverAPoner(tipo, filas) });
  } catch (err) { S[tipo].push(...filas); pintar(); fallo(err); }
}
async function volverAPoner(tipo, filas) {
  try { S[tipo].push(...await D.insertar(tipo, filas)); pintar(); } catch (err) { fallo(err); }
}

// ===== Pestañas =====
function irA(t) {
  document.querySelectorAll('nav.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === t)));
  document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('on', s.id === `t-${t}`));
  try { localStorage.setItem('fam-tab', t); } catch (e) { /* sin almacenamiento */ }
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav.tabs button').forEach((b) => b.addEventListener('click', () => irA(b.dataset.t)));
try { const t = localStorage.getItem('fam-tab'); if (t) irA(t); } catch (e) { /* sin almacenamiento */ }

// ===== Pintar =====
function pintar() {
  pintarHoy();
  pintarCompra();
  pintarTareas();
  pintarCalendario();
  const hoy = L.hoyISO();
  const nCompra = S.compra.filter((c) => !c.hecho).length;
  const nTareas = S.tareas.filter((t) => !t.hecho).length;
  const nHoy = S.eventos.filter((e) => e.fecha === hoy).length;
  for (const [id, n] of [['n-compra', nCompra], ['n-tareas', nTareas], ['n-cal', nHoy]]) {
    $(id).textContent = n > 99 ? '99+' : n;
    $(id).hidden = !n;
  }
  A.ponerContador(nCompra);
}

const ICONO = { compra: '🛒', tarea: '✔', evento: '📅' };
function pintarHoy() {
  const av = L.avisosPendientes(S, new Date()).filter((a) => a.tipo !== 'pronto');
  $('hoy').hidden = !av.length;
  $('hoy-lista').replaceChildren(...av.map((a) => el('li', { class: `e-${a.estado}` },
    el('span', { class: 'ico', 'aria-hidden': 'true' }, ICONO[a.tipo]),
    el('span', {}, el('b', {}, a.titulo), el('small', {}, a.cuerpo)))));
}

function check(hecho, etiqueta, onclick) {
  return el('button', { type: 'button', class: 'check', 'aria-pressed': String(hecho), 'aria-label': etiqueta, onclick });
}
function borrarBtn(etiqueta, onclick) {
  return el('button', { type: 'button', class: 'borrar', 'aria-label': etiqueta, onclick }, '×');
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

// ----- Compra -----
// Para no marcar algo sin querer, al tocar el círculo se pregunta antes (y se cancela solo a los 5 s)
let confirmarT;
function pedirConfirmar(c) {
  S.confirmando = c.id;
  pintar();
  clearTimeout(confirmarT);
  confirmarT = setTimeout(() => { if (S.confirmando === c.id) { S.confirmando = null; pintar(); } }, 5000);
}

function itemCompra(c, conLista = true) {
  const hoy = L.hoyISO();
  if (!c.hecho && S.confirmando === c.id) {
    return el('li', { class: 'item confirmar' },
      el('div', { class: 'cuerpo' }, el('span', { class: 'txt' }, c.texto), el('span', { class: 'meta' }, '¿Ya está comprado?')),
      el('button', { type: 'button', class: 'mini no', onclick: () => { S.confirmando = null; pintar(); } }, 'No'),
      el('button', { type: 'button', class: 'mini si', onclick: () => {
        S.confirmando = null;
        cambiar('compra', c, { hecho: true, hecho_en: new Date().toISOString() });
      } }, 'Sí, comprado'));
  }
  return el('li', { class: `item${c.hecho ? ' hecho' : ''}` },
    check(c.hecho, c.hecho ? 'Volver a la lista' : 'Marcar como comprado',
      () => (c.hecho ? cambiar('compra', c, { hecho: false, hecho_en: null }) : pedirConfirmar(c))),
    el('div', { class: 'cuerpo' }, el('span', { class: 'txt' }, c.texto),
      meta(conLista && c.lista, !c.hecho && c.fecha_limite && plazo(c.fecha_limite, hoy), deOtro(c) && nombreDe(c.creado_por))),
    borrarBtn('Borrar', () => quitar('compra', c, `«${c.texto}» borrado`)));
}

function pintarCompra() {
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
}

$('f-compra').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('c-texto'), texto = inp.value;
  const textos = texto.split(/[,\n]/).map((t) => L.mayuscula(t.trim())).filter(Boolean);
  if (!textos.length) return;
  const lista = $('c-lista').value;
  inp.value = '';
  inp.focus();
  try {
    S.compra.push(...await D.insertar('compra', textos.map((t) => ({ hogar_id: S.hogar.id, texto: t, lista }))));
    pintar();
  } catch (err) { inp.value = texto; fallo(err); }
});

$('c-vaciar').addEventListener('click', () => {
  const hechos = S.compra.filter((c) => c.hecho && (S.filtro === 'Todas' || c.lista === S.filtro));
  if (hechos.length) quitar('compra', hechos, `${hechos.length} ${hechos.length === 1 ? 'cosa borrada' : 'cosas borradas'}`);
});

// ----- Tareas -----
function itemTarea(t) {
  const hoy = L.hoyISO();
  const para = t.para ? (t.para === S.yo ? 'Para ti' : `Para ${nombreDe(t.para)}`) : null;
  return el('li', { class: `item${t.hecho ? ' hecho' : ''}` },
    check(t.hecho, t.hecho ? 'Marcar como pendiente' : 'Marcar como hecha',
      () => cambiar('tareas', t, { hecho: !t.hecho, hecho_en: t.hecho ? null : new Date().toISOString() })),
    el('div', { class: 'cuerpo' }, el('span', { class: 'txt' }, t.texto),
      meta(!t.hecho && t.fecha && plazo(t.fecha, hoy), para, deOtro(t) && `Añadida por ${nombreDe(t.creado_por)}`)),
    borrarBtn('Borrar', () => quitar('tareas', t, `«${t.texto}» borrada`)));
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
}

$('f-tarea').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('t-texto'), texto = L.mayuscula(inp.value.trim());
  if (!texto) return;
  const fila = { hogar_id: S.hogar.id, texto, para: $('t-para').value || null, fecha: $('t-fecha').value || null };
  inp.value = ''; $('t-fecha').value = '';
  inp.focus();
  try { S.tareas.push(...await D.insertar('tareas', fila)); pintar(); } catch (err) { inp.value = texto; fallo(err); }
});

$('t-vaciar').addEventListener('click', () => {
  const hechas = S.tareas.filter((t) => t.hecho);
  if (hechas.length) quitar('tareas', hechas, `${hechas.length} ${hechas.length === 1 ? 'tarea borrada' : 'tareas borradas'}`);
});

// ----- Calendario -----
function itemEvento(ev, conFecha = false) {
  const hoy = L.hoyISO();
  const cuando = conFecha ? `${L.textoFecha(ev.fecha, hoy)}${ev.hora ? ' · ' + L.textoHora(ev.hora) : ''}` : (ev.hora ? L.textoHora(ev.hora) : 'Todo el día');
  return el('li', { class: 'item evento' },
    el('span', { class: 'hora' }, cuando),
    el('div', { class: 'cuerpo' }, el('span', { class: 'txt' }, ev.titulo), meta(deOtro(ev) && nombreDe(ev.creado_por))),
    borrarBtn('Borrar', () => quitar('eventos', ev, `«${ev.titulo}» borrado`)));
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
  const inp = $('e-titulo'), titulo = L.mayuscula(inp.value.trim());
  if (!titulo) return;
  const fila = { hogar_id: S.hogar.id, titulo, fecha: S.dia, hora: $('e-hora').value || null };
  inp.value = ''; $('e-hora').value = '';
  try { S.eventos.push(...await D.insertar('eventos', fila)); pintar(); } catch (err) { inp.value = titulo; fallo(err); }
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
    el('div', { class: 'bloque' }, el('h3', {}, 'Avisos'), el('p', { class: 'mut' }, textoPermiso()),
      p === 'default' ? el('button', { type: 'button', class: 'btn', onclick: activarAvisos }, 'Activar avisos') : null,
      p === 'granted' ? el('button', { type: 'button', class: 'btn sec', onclick: () => A.notificar('Lupita', 'Los avisos funcionan.', 'prueba') }, 'Probar un aviso') : null,
      el('p', { class: 'pista' }, A.pushActivo
        ? 'Llegan aunque la app esté cerrada. Recordatorios a las 9:00, 13:30 y 17:30 con lo de ese día.'
        : 'Ahora mismo solo llegan con la app abierta o en segundo plano.')),
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
