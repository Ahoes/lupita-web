// Lupita · fechas, orden y avisos. Sin acceso al DOM, para poder probarlo con Node.
export const VERSION = '0.2.2';
export const LISTAS = ['Súper', 'Farmacia', 'Casa', 'Otros'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const dos = (n) => String(n).padStart(2, '0');

// Primera letra en mayúscula ("leche" → "Leche"); el resto se deja como lo escribieron
export const mayuscula = (t) => t.charAt(0).toLocaleUpperCase('es') + t.slice(1);

// ===== Fechas (siempre 'AAAA-MM-DD' en hora local) =====
export const aISO = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
export const hoyISO = () => aISO(new Date());
export function deISO(iso) { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); }
export function sumarDias(iso, n) { const d = deISO(iso); d.setDate(d.getDate() + n); return aISO(d); }
// Math.round absorbe la hora de más o de menos de los cambios de horario
export const diasEntre = (desde, hasta) => Math.round((deISO(hasta) - deISO(desde)) / 86400000);

export function estadoFecha(iso, hoy) {
  if (!iso) return null;
  const n = diasEntre(hoy, iso);
  return n < 0 ? 'vencida' : n === 0 ? 'hoy' : n === 1 ? 'manana' : 'futura';
}

export function textoFecha(iso, hoy) {
  const n = diasEntre(hoy, iso);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  const d = deISO(iso);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

// Para compras y tareas con fecha: "Para hoy", "Para el vie 9 oct", "Atrasado (ayer)"
export function textoPlazo(iso, hoy) {
  const n = diasEntre(hoy, iso);
  if (n < 0) return `Atrasado (${textoFecha(iso, hoy)})`;
  if (n <= 1) return `Para ${textoFecha(iso, hoy)}`;
  return `Para el ${textoFecha(iso, hoy)}`;
}

export const textoHora = (h) => (h ? h.slice(0, 5) : '');

export function tituloDia(iso, hoy) {
  const d = deISO(iso), n = diasEntre(hoy, iso);
  const largo = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  return n === 0 ? `Hoy, ${largo}` : n === 1 ? `Mañana, ${largo}` : largo.charAt(0).toUpperCase() + largo.slice(1);
}

// Semanas de lunes a domingo que cubren el mes (m de 0 a 11)
export function cuadriculaMes(a, m) {
  const desfase = (new Date(a, m, 1).getDay() + 6) % 7;
  const diasMes = new Date(a, m + 1, 0).getDate();
  const celdas = Math.ceil((desfase + diasMes) / 7) * 7;
  return Array.from({ length: celdas }, (_, i) => {
    const d = new Date(a, m, 1 - desfase + i);
    return { iso: aISO(d), dia: d.getDate(), delMes: d.getMonth() === m };
  });
}

// ===== Orden =====
// Primero lo que tiene fecha (lo más urgente arriba); después lo demás, en el orden en que se añadió
export function ordenarPendientes(items, campo) {
  return [...items].sort((x, y) => {
    const fx = x[campo], fy = y[campo];
    if (fx && fy && fx !== fy) return fx < fy ? -1 : 1;
    if (fx && !fy) return -1;
    if (!fx && fy) return 1;
    return String(x.creado_en).localeCompare(String(y.creado_en));
  });
}

export const ordenarEventos = (evs) => [...evs].sort((x, y) =>
  x.fecha !== y.fecha ? (x.fecha < y.fecha ? -1 : 1) : (x.hora || '').localeCompare(y.hora || ''));

export function delDia({ compra = [], tareas = [], eventos = [] }, iso) {
  return {
    eventos: ordenarEventos(eventos.filter((e) => e.fecha === iso)),
    tareas: tareas.filter((t) => t.fecha === iso),
    compra: compra.filter((c) => c.fecha_limite === iso),
  };
}

// ===== Avisos =====
// Lo urgente: compras para hoy o mañana (o atrasadas), tareas de hoy o atrasadas, citas de hoy y mañana,
// y "dentro de poco" cuando falta una hora o menos para una cita.
// Cada aviso lleva una clave por día para no repetirlo.
export function avisosPendientes({ compra = [], tareas = [], eventos = [] }, ahora = new Date()) {
  const hoy = aISO(ahora), out = [];
  for (const c of compra) {
    if (c.hecho || !c.fecha_limite) continue;
    const n = diasEntre(hoy, c.fecha_limite);
    if (n > 1) continue;
    out.push({ clave: `c:${c.id}:${hoy}`, tipo: 'compra', estado: estadoFecha(c.fecha_limite, hoy),
      titulo: `Hay que comprar: ${c.texto}`, cuerpo: textoPlazo(c.fecha_limite, hoy) });
  }
  for (const t of tareas) {
    if (t.hecho || !t.fecha) continue;
    const n = diasEntre(hoy, t.fecha);
    if (n > 0) continue;
    out.push({ clave: `t:${t.id}:${hoy}`, tipo: 'tarea', estado: estadoFecha(t.fecha, hoy),
      titulo: `Tarea: ${t.texto}`, cuerpo: textoPlazo(t.fecha, hoy) });
  }
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  for (const e of ordenarEventos(eventos)) {
    const n = diasEntre(hoy, e.fecha);
    if (n !== 0 && n !== 1) continue;
    const cuando = e.hora ? `A las ${textoHora(e.hora)}` : 'Todo el día';
    out.push({ clave: `e:${e.id}:${hoy}`, tipo: 'evento', estado: n === 0 ? 'hoy' : 'manana',
      titulo: `${n === 0 ? 'Hoy' : 'Mañana'}: ${e.titulo}`, cuerpo: cuando });
    if (n === 0 && e.hora) {
      const [h, m] = e.hora.split(':').map(Number);
      const faltan = h * 60 + m - minAhora;
      if (faltan >= 0 && faltan <= 60) {
        out.push({ clave: `p:${e.id}:${hoy}`, tipo: 'pronto', estado: 'hoy',
          titulo: `Dentro de poco: ${e.titulo}`, cuerpo: cuando });
      }
    }
  }
  return out;
}
