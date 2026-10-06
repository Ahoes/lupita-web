// Lupita · fechas, orden y avisos. Sin acceso al DOM, para poder probarlo con Node.
export const VERSION = '0.2.3';
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

// ===== Categorías de la compra =====
// En el orden de un recorrido normal por el súper. Las palabras van sin tildes y en singular.
export const CATEGORIAS = [
  ['Fruta y verdura', '🍎', `fruta verdura manzana platano pera naranja mandarina limon lima uva fresa freson
    melon sandia kiwi pina mango aguacate melocoton nectarina albaricoque cereza ciruela granada higo papaya
    frambuesa arandano mora coco caqui chirimoya tomate lechuga cebolla cebolleta ajo patata zanahoria pimiento
    pepino calabacin berenjena brocoli coliflor col repollo espinaca acelga judia guisante haba alcachofa
    esparrago puerro apio calabaza champinon seta rucula canonigo endivia rabano remolacha jengibre perejil
    cilantro albahaca hierbabuena boniato batata maiz ensalada brote`],
  ['Panadería', '🥖', `pan barra baguette chapata hogaza molde bimbo integral picos pico colin regana tostada biscote
    croissant cruasan bolleria bollo magdalena napolitana ensaimada donut dona palmera bizcocho tarta pastel
    empanada empanadilla wrap pita`],
  ['Carne', '🥩', `carne pollo pechuga muslo contramuslo alita ternera cerdo lomo solomillo costilla chuleta filete
    entrecot cordero conejo pavo hamburguesa salchicha albondiga picada carrillera secreto presa panceta
    torrezno codillo higado morcilla`],
  ['Pescado', '🐟', `pescado merluza salmon atun bacalao dorada lubina sardina boqueron trucha rape lenguado
    gallo caballa bonito emperador calamar sepia pulpo gamba langostino mejillon almeja berberecho navaja
    marisco surimi palito chipiron`],
  ['Charcutería y quesos', '🧀', `jamon york serrano iberico chorizo salchichon fuet lomo embutido mortadela
    salami bacon beicon sobrasada pate queso quesito mozzarella parmesano burrata fiambre cecina`],
  ['Lácteos y huevos', '🥛', `leche yogur yogurt natilla flan cuajada kefir nata mantequilla margarina
    batido huevo huevos requeson`],
  ['Despensa', '🥫', `arroz pasta macarron espagueti spaghetti fideo tallarin lasana raviolis tortellini cuscus
    quinoa garbanzo lenteja alubia legumbre harina levadura azucar sal pimienta oregano comino pimenton
    canela curry especia caldo avecrem aceite vinagre mayonesa ketchup mostaza salsa tomate frito
    conserva lata aceituna pepinillo maiz atun mejillones berberechos sardinillas pure sopa crema nuez nueces
    almendra cacahuete pistacho anacardo avellana pipa fruto seco pasa datil miel`],
  ['Desayuno y dulces', '🍪', `cereal cereales muesli avena galleta cafe capsula descafeinado te infusion
    manzanilla poleo cacao colacao nesquik chocolate chocolatina mermelada confitura crema cacao nocilla
    nutella turron golosina chuche caramelo chicle patatilla snack palomita gominola`],
  ['Bebidas', '🥤', `agua zumo refresco cocacola coca cola fanta sprite aquarius nestea gaseosa tonica cerveza
    vino tinto blanco rosado cava champan sidra vermut ron ginebra whisky licor bebida isotonica`],
  ['Congelados', '🧊', `congelado congelada helado hielo pizza croqueta varita nugget san jacobo lasana precocinado`],
  ['Limpieza', '🧽', `detergente suavizante lejia amoniaco friegasuelos limpiador lavavajillas fairy estropajo
    bayeta fregona escoba recogedor bolsa basura papel cocina servilleta aluminio albal film insecticida
    ambientador limpiacristales quitagrasas vitro sanitario wc guante`],
  ['Higiene y farmacia', '🧴', `champu gel jabon desodorante colonia perfume crema dental dientes cepillo
    enjuague hilo compresa tampon salvaslip panal toallita algodon bastoncillo maquinilla cuchilla espuma
    afeitar protector solar labial pintalabios maquillaje rimel colutorio papel higienico
    paracetamol ibuprofeno aspirina tirita venda gasa betadine alcohol termometro vitamina jarabe
    pomada suero antiestaminico medicina medicamento receta preservativo condon`],
  ['Mascotas', '🐾', `pienso perro gato arena comida mascota`],
];
const OTROS = ['Otros', '📦'];

// Frases que mandan sobre las palabras sueltas ("tomate frito" no es verdura)
const FRASES = [
  ['tomate frito', 'Despensa'], ['tomate triturado', 'Despensa'], ['pan rallado', 'Despensa'],
  ['pan de molde', 'Panadería'], ['papel higienico', 'Higiene y farmacia'], ['papel de cocina', 'Limpieza'],
  ['papel cocina', 'Limpieza'], ['papel de aluminio', 'Limpieza'], ['papel film', 'Limpieza'],
  ['bolsa de basura', 'Limpieza'], ['bolsas de basura', 'Limpieza'], ['crema de cacao', 'Desayuno y dulces'],
  ['pasta de dientes', 'Higiene y farmacia'], ['pasta dental', 'Higiene y farmacia'],
  ['pastillas lavavajillas', 'Limpieza'], ['pastillas de lavavajillas', 'Limpieza'],
  ['comida de perro', 'Mascotas'], ['comida de gato', 'Mascotas'], ['comida perro', 'Mascotas'],
  ['comida gato', 'Mascotas'], ['arena gato', 'Mascotas'], ['arena de gato', 'Mascotas'],
  ['crema solar', 'Higiene y farmacia'], ['crema hidratante', 'Higiene y farmacia'],
  ['crema de manos', 'Higiene y farmacia'], ['atun en lata', 'Despensa'], ['atun lata', 'Despensa'],
  ['frutos secos', 'Despensa'], ['patatas fritas', 'Desayuno y dulces'], ['patatas chips', 'Desayuno y dulces'],
  ['queso rallado', 'Charcutería y quesos'], ['leche condensada', 'Despensa'],
];

const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Para cada palabra, la primera categoría en la que aparece
const PALABRAS = new Map();
for (const [nombre, , lista] of CATEGORIAS) {
  for (const p of lista.split(/\s+/).filter(Boolean)) if (!PALABRAS.has(p)) PALABRAS.set(p, nombre);
}
// Palabras que en el súper tienen dueño claro aunque estén en otra lista
for (const [p, c] of [['atun', 'Pescado'], ['lomo', 'Carne'], ['maiz', 'Fruta y verdura'], ['tomate', 'Fruta y verdura']]) PALABRAS.set(p, c);

const singular = (w) => [w, w.replace(/es$/, ''), w.replace(/s$/, '')];

// "manzanas" → "Fruta y verdura"; lo que no reconoce va a "Otros"
export function categoria(texto) {
  const t = ' ' + normalizar(texto).replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  if (/ congelad/.test(t)) return 'Congelados';
  for (const [frase, cat] of FRASES) if (t.includes(` ${frase} `)) return cat;
  for (const w of t.trim().split(' ')) {
    for (const s of singular(w)) if (PALABRAS.has(s)) return PALABRAS.get(s);
  }
  return OTROS[0];
}

export const iconoCategoria = (nombre) => (CATEGORIAS.find((c) => c[0] === nombre) || OTROS)[1];

// Agrupa la compra por categorías en el orden del súper; dentro de cada grupo, lo urgente primero
export function agruparCompra(items) {
  const orden = [...CATEGORIAS.map((c) => c[0]), OTROS[0]];
  const grupos = new Map();
  for (const c of ordenarPendientes(items, 'fecha_limite')) {
    const cat = categoria(c.texto);
    if (!grupos.has(cat)) grupos.set(cat, []);
    grupos.get(cat).push(c);
  }
  return [...grupos].sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0]))
    .map(([nombre, items]) => ({ nombre, icono: iconoCategoria(nombre), items }));
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
