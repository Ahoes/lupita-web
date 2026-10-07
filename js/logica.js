// Lupita · fechas, orden y avisos. Sin acceso al DOM, para poder probarlo con Node.
export const VERSION = '0.2.8';
export const LISTAS = ['Súper', 'Farmacia', 'Casa', 'Otros'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const dos = (n) => String(n).padStart(2, '0');

// ===== Mayúsculas =====
// Nombres propios que se escriben siempre con mayúscula. Los que llevan "~" también son palabras normales
// ("rosa", "clara", "julio"): solo se ponen en mayúscula detrás de "de", "a", "para"... ("ramo para rosa").
const NOMBRES = `Antonio José Manuel Francisco Juan David Javier Daniel Carlos Jesús Alejandro Miguel Rafael Pedro
  Pablo Ángel Sergio Fernando Jorge Luis Alberto Álvaro Adrián Diego Raúl Enrique Ramón Vicente Iván Rubén Óscar
  Andrés Joaquín Santiago Eduardo Víctor Roberto Jaime Mario Ignacio Alfonso Marcos Hugo Jordi Ricardo Gabriel
  Emilio Gonzalo Martín ~Tomás Agustín Nicolás Rodrigo Lucas Mateo Marc Iker Aitor Unai Asier Gorka Xavier Héctor
  Samuel Cristian Christian Félix Gregorio Lorenzo Esteban Arturo Felipe Guillermo Ismael Bruno Thiago Izan Álex
  ~Marco Eric Nil Pol Biel Oliver César Julián Fabián Sebastián Simón Germán Rodolfo Benito Ernesto Mariano Valentín
  Pepe Paco Manolo Toni Quique Kike Chema Rafa Fran Dani Javi Edu Nando Juanma Txema Iñaki Íñigo Mikel Xabier
  Lucía María Carmen Ana Isabel Laura Cristina Marta Sara Paula Elena Raquel Beatriz Patricia Silvia Julia Irene
  Alicia Andrea Sonia Mónica Nuria Natalia Claudia Eva Inmaculada Inma Teresa Lorena Verónica Susana Marina Noelia
  Esther Yolanda Ángela Montserrat Montse Rocío Encarnación Encarna Josefa Francisca Manuela Antonia Concepción
  ~Concha Lourdes Begoña Ainhoa Nerea Leire Itziar Miren Aitana Carla Daniela Valeria Martina Sofía Noa Emma Olivia
  Jimena Ximena Carlota Adriana Celia Lidia Miriam Rebeca Belén ~Gema Gemma Vanesa Tamara Judith Ariadna Fátima
  Ángeles Natividad Asunción Purificación Trinidad Lola Pepa Charo Isa Bea Cris Mamen Maite Marisa Mari Juani Rosi
  Puri Encarni Loli Nati Vero Patri Sandra Rosana Iratxe Nekane Elisa Eugenia Inés Sandra Rut Ruth Noemí Yaiza
  Mercadona Lidl Carrefour Ikea Amazon Alcampo Eroski Hipercor ~Correos Zara Decathlon Primark Movistar Vodafone
  Iberdrola Endesa Naturgy Netflix Google
  ~Rosa ~Pilar ~Luz ~Paz ~Sol ~Blanca ~Nieves ~Mar ~Clara ~Victoria ~Gloria ~Esperanza ~Amparo ~Consuelo
  ~Mercedes ~Dolores ~Remedios ~Soledad ~Milagros ~Aurora ~Estrella ~Margarita ~Violeta ~Iris ~Alba ~Vega
  ~Paloma ~Rosario ~Julio ~Leo ~Nacho ~Salvador ~Pastor ~Cruz ~Angustias`;
// Detrás de estas palabras, lo dudoso se toma como nombre
const ANTES_DE_NOMBRE = new Set('a al de del para con y e o u por sin'.split(' '));
// Palabras de enlace que van en minúscula aunque se escriban con mayúscula ("pan De molde")
const ENLACES = new Set('a al de del el la los las lo un una y e o u en con para por sin que'.split(' '));
const sinTildes = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const PROPIOS = new Map(NOMBRES.split(/\s+/).filter(Boolean).map((n) => {
  const forma = n.replace('~', '');
  return [sinTildes(forma), { forma, dudoso: n.startsWith('~') }];
}));

// Primera letra en mayúscula y el resto en minúscula ("LECHE entera" → "Leche entera"), salvo los nombres
// propios: los conocidos, los de la casa (`nombres`) y los que se escriban ya con mayúscula
// ("lavadora de cesar" → "Lavadora de César")
export function mayuscula(t, nombres = []) {
  const propios = new Map(PROPIOS);
  for (const n of nombres) {
    for (const w of String(n || '').split(/\s+/).filter(Boolean)) {
      propios.set(sinTildes(w), { forma: w.charAt(0).toLocaleUpperCase('es') + w.slice(1).toLocaleLowerCase('es'), dudoso: false });
    }
  }
  const todoMayusculas = t === t.toLocaleUpperCase('es');
  let anterior = '';
  const r = t.replace(/\p{L}+/gu, (w, i) => {
    const minus = w.toLocaleLowerCase('es'), clave = sinTildes(w), antes = anterior;
    anterior = clave;
    const p = propios.get(clave);
    if (p && (!p.dudoso || ANTES_DE_NOMBRE.has(antes))) return p.forma;
    if (i > 0 && !todoMayusculas && /^\p{Lu}\p{Ll}+$/u.test(w) && !ENLACES.has(clave)) return w;
    return minus;
  });
  return r.charAt(0).toLocaleUpperCase('es') + r.slice(1);
}

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
// Las que llevan "~" son dudosas ("cápsulas" puede ser de café o de detergente, "gel" de ducha o de
// lavadora): solo deciden si en el texto no hay ninguna palabra clara.
export const CATEGORIAS = [
  ['Fruta y verdura', '🍎', `fruta verdura manzana platano pera naranja mandarina limon lima uva fresa freson
    melon sandia kiwi pina mango aguacate melocoton nectarina albaricoque paraguayo cereza ciruela granada higo
    papaya frambuesa arandano mora ~coco caqui chirimoya tomate lechuga cebolla cebolleta cebollino ajo patata
    zanahoria pimiento pepino calabacin berenjena brocoli coliflor col repollo lombarda espinaca acelga judia
    guisante haba alcachofa esparrago puerro apio calabaza champinon seta rucula canonigo endivia endibia
    escarola rabano remolacha nabo jengibre perejil cilantro albahaca hierbabuena menta boniato batata maiz
    ensalada brote kale`],
  ['Panadería', '🥖', `pan ~barra baguette chapata hogaza ~molde bimbo picos pico colin regana tostada biscote
    croissant cruasan bolleria bollo magdalena napolitana ensaimada donut dona donette palmera bizcocho tarta
    pastel empanada empanadilla wrap pita brioche`],
  ['Carne', '🥩', `carne pollo pechuga muslo contramuslo alita ternera cerdo lomo solomillo costilla chuleta
    filete entrecot cordero conejo pavo hamburguesa burger salchicha albondiga picada carrillera secreto presa
    panceta torrezno codillo higado morcilla butifarra longaniza chistorra pinchito`],
  ['Pescado', '🐟', `pescado merluza salmon atun bacalao dorada lubina sardina boqueron trucha rape lenguado
    gallo caballa bonito emperador calamar sepia pulpo gamba langostino mejillon almeja berberecho navaja
    marisco surimi ~palito chipiron`],
  ['Charcutería y quesos', '🧀', `jamon york serrano iberico chorizo salchichon fuet embutido mortadela
    salami bacon beicon sobrasada pate queso quesito mozzarella parmesano burrata fiambre cecina`],
  ['Lácteos y huevos', '🥛', `~leche yogur yogurt natilla flan cuajada kefir nata mantequilla margarina
    batido huevo requeson actimel activia danone danonino danacol bifidus skyr petit`],
  ['Despensa', '🥫', `arroz ~pasta macarron espagueti spaghetti fideo tallarin lasana ravioli tortellini cuscus
    quinoa garbanzo lenteja alubia legumbre harina maicena levadura azucar ~sal pimienta oregano comino pimenton
    canela curry especia caldo avecrem aceite ~vinagre mayonesa ketchup mostaza salsa ~frito conserva ~lata
    aceituna alcaparra pepinillo encurtido sardinilla pure sopa gazpacho salmorejo nuez almendra cacahuete
    pistacho anacardo avellana pipa ~seco pasa datil miel semilla sesamo chia nacho taco tortita`],
  ['Desayuno y dulces', '🍪', `cereal muesli avena galleta cafe ~capsula descafeinado te infusion manzanilla
    poleo cacao colacao nesquik nescafe nespresso tassimo marcilla saimaza chocolate chocolatina bombon mermelada
    confitura nocilla nutella turron golosina chuche caramelo chicle patatilla snack palomita gominola barrita
    oreo principe filipino lacasito conguito sugus haribo kinder milka toblerone pringles dorito cheeto ruffles
    gusanito`],
  ['Bebidas', '🥤', `~agua zumo refresco cocacola coca cola pepsi fanta sprite aquarius nestea kas schweppes
    gaseosa tonica mosto horchata cerveza vino ~tinto ~blanco ~rosado cava champan sidra vermut ron ginebra gin
    vodka tequila whisky licor bebida isotonica redbull monster`],
  ['Congelados', '🧊', `congelado congelada helado hielo pizza croqueta varita nugget jacobo precocinado`],
  ['Limpieza', '🧽', `detergente suavizante lejia amoniaco friegasuelos fregasuelos limpiador limpieza limpiar
    lavavajillas fairy estropajo bayeta fregona mopa escoba recogedor cubo trapo gamuza ~bolsa basura cocina
    servilleta aluminio albal film insecticida ambientador limpiacristales cristal quitagrasas multiusos
    desinfectante desatascador antical abrillantador quitamancha vitro sanitario wc guante ropa lavadora colada
    pinza tendedero pod ariel skip dixan wipp persil micolor norit perlan mimosin vernel vanish neutrex kh7
    sanytol mistol finish somat asevi vileda colon percha`],
  ['Higiene y farmacia', '🧴', `champu ~gel ducha ~jabon desodorante colonia perfume ~crema dental dentifrico
    dientes cepillo enjuague colutorio ~hilo compresa tampon salvaslip panal toallita algodon bastoncillo
    maquinilla cuchilla ~espuma afeitar protector solar labial labio pintalabios maquillaje rimel desmaquillante
    micelar corporal hidratante mascarilla tinte laca gomina peine coletero lentilla ~papel higienico ~pastilla
    paracetamol ibuprofeno aspirina tirita venda gasa betadine alcohol termometro vitamina jarabe pomada suero
    antihistaminico medicina medicamento receta preservativo condon dodot colgate sensodyne nivea dove sanex
    pantene gillette ausonia evax tampax isdin mustela panuelo kleenex clinex`],
  ['Mascotas', '🐾', `pienso perro gato mascota ~arena arenero rascador whiskas friskies purina pedigree`],
];
const OTROS = ['Otros', '📦'];

// Palabras que mandan sobre todo lo demás: "champú para perro" es de mascotas, "jabón para la ropa" de limpieza
const MANDAN = [
  [/ congelad/, 'Congelados'],
  [/ (perr[oa]s?|gat[oa]s?|mascotas?|piensos?) /, 'Mascotas'],
  [/ (ropa|lavadoras?|colada) /, 'Limpieza'],
];

// Frases que mandan sobre las palabras sueltas ("tomate frito" no es verdura). Valen en singular o plural.
const FRASES = [
  ['tomate frito', 'Despensa'], ['tomate triturado', 'Despensa'], ['tomate natural', 'Despensa'],
  ['pan rallado', 'Despensa'], ['pan de molde', 'Panadería'], ['papel de cocina', 'Limpieza'],
  ['papel cocina', 'Limpieza'], ['papel de aluminio', 'Limpieza'], ['papel film', 'Limpieza'],
  ['papel de horno', 'Limpieza'], ['papel vegetal', 'Limpieza'], ['bolsa de basura', 'Limpieza'],
  ['crema de cacao', 'Desayuno y dulces'], ['pasta de diente', 'Higiene y farmacia'], ['pasta dental', 'Higiene y farmacia'],
  ['crema de verdura', 'Despensa'], ['crema de calabacin', 'Despensa'], ['crema de calabaza', 'Despensa'],
  ['crema de marisco', 'Despensa'], ['crema de champinon', 'Despensa'], ['crema de puerro', 'Despensa'],
  ['atun en lata', 'Despensa'], ['atun lata', 'Despensa'], ['lata de atun', 'Despensa'], ['en aceite', 'Despensa'],
  ['agua oxigenada', 'Higiene y farmacia'], ['fruto seco', 'Despensa'],
  ['patata frita', 'Desayuno y dulces'], ['patata chip', 'Desayuno y dulces'], ['queso rallado', 'Charcutería y quesos'],
  ['leche condensada', 'Despensa'], ['leche de coco', 'Despensa'], ['leche evaporada', 'Despensa'],
  ['leche de avena', 'Lácteos y huevos'], ['leche de almendra', 'Lácteos y huevos'], ['leche de soja', 'Lácteos y huevos'],
  ['leche de arroz', 'Lácteos y huevos'], ['bebida de avena', 'Lácteos y huevos'], ['bebida de soja', 'Lácteos y huevos'],
  ['bebida de almendra', 'Lácteos y huevos'], ['cola cao', 'Desayuno y dulces'], ['dolce gusto', 'Desayuno y dulces'],
  ['don limpio', 'Limpieza'], ['cillit bang', 'Limpieza'], ['pato wc', 'Limpieza'], ['agua destilada', 'Limpieza'],
  ['agua de plancha', 'Limpieza'], ['sal lavavajilla', 'Limpieza'], ['lima de una', 'Higiene y farmacia'],
  ['palito de merluza', 'Congelados'], ['cera depilatoria', 'Higiene y farmacia'], ['oral b', 'Higiene y farmacia'],
  ['head shoulder', 'Higiene y farmacia'], ['font vella', 'Bebidas'], ['red bull', 'Bebidas'],
  ['royal canin', 'Mascotas'], ['san jacobo', 'Congelados'], ['nata para cocinar', 'Lácteos y huevos'],
].map(([frase, cat]) => [new RegExp(` ${frase.split(' ').map((w) => `${w}(?:e?s)?`).join(' ')} `), cat]);

const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Para cada palabra, la primera categoría en la que aparece y si es dudosa
const PALABRAS = new Map();
for (const [nombre, , lista] of CATEGORIAS) {
  for (const p of lista.split(/\s+/).filter(Boolean)) {
    const palabra = p.replace('~', '');
    if (!PALABRAS.has(palabra)) PALABRAS.set(palabra, { cat: nombre, dudosa: p.startsWith('~') });
  }
}
// Palabras que en el súper tienen dueño claro aunque estén en otra lista
for (const [p, c] of [['atun', 'Pescado'], ['lomo', 'Carne'], ['maiz', 'Fruta y verdura'], ['tomate', 'Fruta y verdura']]) PALABRAS.set(p, { cat: c, dudosa: false });

const singular = (w) => [w, w.replace(/es$/, ''), w.replace(/s$/, '')];
const buscar = (w) => singular(w).map((s) => PALABRAS.get(s)).find(Boolean);

// "manzanas" → "Fruta y verdura"; "cápsulas de detergente" → "Limpieza" (manda la palabra clara);
// lo que no reconoce va a "Otros"
export function categoria(texto) {
  const t = ' ' + normalizar(texto).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (const [re, cat] of MANDAN) if (re.test(t)) return cat;
  for (const [re, cat] of FRASES) if (re.test(t)) return cat;
  const halladas = t.trim().split(' ').map(buscar).filter(Boolean);
  return (halladas.find((h) => !h.dudosa) || halladas[0] || { cat: OTROS[0] }).cat;
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

// ===== "Voy a comprar" =====
// Si nadie pulsa "He terminado", deja de contar a las 3 horas
export const DURACION_COMPRA = 3 * 3600 * 1000;
export const comprandoAhora = (filas, ahora = new Date()) =>
  filas.filter((f) => ahora - new Date(f.creado_en) < DURACION_COMPRA);

// Lo comprado desde que empezó y lo que queda en la lista
export function resumenCompra(compra, desde) {
  const t = new Date(desde).getTime();
  const compradas = compra.filter((c) => c.hecho && c.hecho_en && new Date(c.hecho_en).getTime() >= t).length;
  const quedan = compra.filter((c) => !c.hecho).map((c) => c.texto);
  return { compradas, quedan, total: compradas + quedan.length };
}

// "Has comprado 5 cosas · queda 1: Pan" (tu = true) o "Ha comprado..." (otra persona)
export function textoResumen({ compradas, quedan }, tu = false) {
  const c = compradas === 0 ? `No ${tu ? 'has' : 'ha'} marcado nada`
    : `${tu ? 'Has' : 'Ha'} comprado ${compradas} ${compradas === 1 ? 'cosa' : 'cosas'}`;
  const lista = quedan.length <= 3 ? quedan : [...quedan.slice(0, 3), `${quedan.length - 3} más`];
  const q = !quedan.length ? 'no queda nada'
    : `${quedan.length === 1 ? 'queda 1' : `quedan ${quedan.length}`}: ${lista.length > 1 ? `${lista.slice(0, -1).join(', ')} y ${lista.at(-1)}` : lista[0]}`;
  return `${c} · ${q}`;
}

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
