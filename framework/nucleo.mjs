/* ==========================================================================
   Nucleo del framework de marcas de Bong.

   Todo lo que se puede hacer con una marca vive aca, como funciones puras
   que reciben el marca.json y devuelven datos o SVG. El servidor MCP las
   expone como tools y el portal web las puede importar tal cual: una sola
   verdad del dato, igual que en el caso Profertil.

   No hay dependencias ni nada de Node: corre en el navegador tambien.
   ========================================================================== */

/* --- Utilidades ------------------------------------------------------------ */

/* Cualquier lista de la marca puede venir como { pendiente } mientras no se
   cargue: para el nucleo eso es una lista vacia. */
export const arr = (v) => (Array.isArray(v) ? v : []);

export function normalizar(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function escaparXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
}

/* Un campo con { pendiente: "..." } es un dato que la marca todavia no tiene
   cargado. Se devuelve como esta, para que quien consulta sepa que falta en
   vez de recibir un valor inventado. */
export function esPendiente(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) && typeof v.pendiente === "string";
}

export function pendientes(marca, ruta = "", lista = []) {
  if (esPendiente(marca)) {
    lista.push({ ruta, falta: marca.pendiente });
  } else if (Array.isArray(marca)) {
    marca.forEach((v, i) => pendientes(v, `${ruta}[${i}]`, lista));
  } else if (marca && typeof marca === "object") {
    for (const [k, v] of Object.entries(marca)) pendientes(v, ruta ? `${ruta}.${k}` : k, lista);
  }
  return lista;
}

/* --- Color ----------------------------------------------------------------- */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function hexNormal(hex) {
  const m = HEX.exec(String(hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h.toUpperCase();
}

function rgb(hex) {
  const h = hexNormal(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminancia(hex) {
  const [r, g, b] = rgb(hex).map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* Distancia perceptual simple (redmean). Alcanza para decir "este hex que
   te pasaron es el azul de la marca con un tono corrido". */
function distancia(a, b) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}

/* Acepta el id del token, el nombre o un hex. Devuelve el color de la marca
   o, si es un hex que no esta en la paleta, el hex suelto con su pariente
   mas cercano de la marca. */
export function resolverColor(marca, ref) {
  const q = normalizar(ref);
  const porNombre = arr(marca.colores).find((c) => normalizar(c.id) === q || normalizar(c.nombre) === q);
  if (porNombre) return { ...porNombre, hex: hexNormal(porNombre.hex), deLaMarca: true };
  const hex = hexNormal(ref);
  if (!hex) return null;
  const exacto = arr(marca.colores).find((c) => hexNormal(c.hex) === hex);
  if (exacto) return { ...exacto, hex, deLaMarca: true };
  const cercano = marca.colores
    .map((c) => ({ c, d: distancia(hex, c.hex) }))
    .sort((a, b) => a.d - b.d)[0];
  return { id: null, nombre: null, hex, deLaMarca: false, masCercano: { id: cercano.c.id, nombre: cercano.c.nombre, hex: hexNormal(cercano.c.hex), distancia: Math.round(cercano.d) } };
}

export function contraste(fondo, texto) {
  const a = luminancia(fondo);
  const b = luminancia(texto);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const r = Math.round(ratio * 100) / 100;
  return {
    ratio: r,
    textoNormal: r >= 7 ? "AAA" : r >= 4.5 ? "AA" : "no alcanza",
    textoGrande: r >= 4.5 ? "AAA" : r >= 3 ? "AA" : "no alcanza"
  };
}

/* Lo que dice el manual de un par fondo/texto: si esta entre los permitidos
   y, si lo esta, con que nivel de accesibilidad lo declara. Es distinto del
   calculo de contraste: un manual puede permitir un par para titulares que
   no alcanza para texto chico. */
export function textoSobreColor(marca, fondo, texto) {
  const def = marca.texto_sobre_color;
  if (!def || esPendiente(def)) return null;
  const f = resolverColor(marca, fondo);
  const t = resolverColor(marca, texto);
  if (!f?.id || !t?.id) return { enManual: false, motivo: "Alguno de los dos colores no es de la marca." };
  const par = arr(def.pares).find((p) => p.fondo === f.id);
  const enManual = Boolean(par && arr(par.textos).includes(t.id));
  let nivel = null;
  for (const [n, lista] of Object.entries(def.accesibles || {})) {
    if (arr(lista).some(([a, b]) => a === f.id && b === t.id)) { nivel = n; break; }
  }
  return { enManual, nivelManual: nivel, ...(par && !enManual ? { permitidosSobreEseFondo: par.textos } : {}) };
}

export function colores(marca) {
  const pal = marca.paleta || {};
  const hex = (id) => resolverColor(marca, id)?.hex || id;
  const conHex = (grupo) => arr(grupo).map((ids) => ids.map((id) => ({ id, hex: hex(id) })));
  return {
    nota: pal.nota,
    tokens: arr(marca.colores).map((c) => ({ ...c, hex: hexNormal(c.hex) })),
    principales: arr(pal.principales).map((id) => ({ id, hex: hex(id) })),
    duplas: conHex(pal.duplas),
    terciarias: conHex(pal.terciarias)
  };
}

/* Mira si un conjunto de colores es una combinacion aprobada. El orden no
   importa: una dupla azul+amarillo es la misma que amarillo+azul. */
export function validarCombinacion(marca, refs) {
  const resueltos = refs.map((r) => ({ pedido: r, color: resolverColor(marca, r) }));
  const desconocidos = resueltos.filter((r) => !r.color).map((r) => r.pedido);
  if (desconocidos.length) {
    return { aprobada: false, motivo: `No entiendo estos colores: ${desconocidos.join(", ")}. Pasá ids de la marca o hex.` };
  }
  const fuera = resueltos.filter((r) => !r.color.deLaMarca);
  const ids = resueltos.map((r) => r.color.id).filter(Boolean);
  const clave = (lista) => [...lista].sort().join("+");
  const pal = marca.paleta || {};
  const niveles = [
    ["principal", arr(pal.principales).map((id) => [id])],
    /* Las principales juntas son una paleta en si misma (la "primaria"). */
    ["primaria", arr(pal.principales).length > 1 ? [arr(pal.principales)] : []],
    ["dupla", arr(pal.duplas)],
    ["terciaria", arr(pal.terciarias)]
  ];

  let nivel = null;
  if (!fuera.length) {
    for (const [nombre, grupo] of niveles) {
      if (grupo.some((g) => clave(g) === clave(ids))) { nivel = nombre; break; }
    }
  }

  const pares = [];
  for (let i = 0; i < resueltos.length; i++) {
    for (let j = i + 1; j < resueltos.length; j++) {
      const a = resueltos[i].color;
      const b = resueltos[j].color;
      pares.push({ entre: [a.id || a.hex, b.id || b.hex], ...contraste(a.hex, b.hex) });
    }
  }

  const nombreEnManual = nivel && pal.nombres ? pal.nombres[{ principal: "principales", primaria: "principales", dupla: "duplas", terciaria: "terciarias" }[nivel]] : undefined;
  const resultado = { aprobada: Boolean(nivel), nivel, ...(nombreEnManual ? { nombreEnManual } : {}), ...(nivel && pal.proporciones ? { proporcion: pal.proporciones[{ principal: "principal", primaria: "principal", dupla: "duplas", terciaria: "terciarias" }[nivel]] } : {}), contraste: pares };
  if (fuera.length) {
    resultado.fueraDePaleta = fuera.map((r) => ({ pedido: r.pedido, masCercano: r.color.masCercano }));
  }
  if (!nivel) {
    /* La sugerencia es la combinacion aprobada que mas colores comparte con
       lo que se pidio. Si no comparte ninguno, las duplas. */
    const pedidos = new Set(ids.concat(fuera.map((r) => r.color.masCercano.id)));
    const todas = niveles.flatMap(([n, g]) => g.map((c) => ({ nivel: n, colores: c })));
    const puntuadas = todas
      .map((c) => ({ ...c, comunes: c.colores.filter((id) => pedidos.has(id)).length }))
      .filter((c) => c.colores.length === refs.length || c.comunes > 0)
      .sort((a, b) => b.comunes - a.comunes || Math.abs(a.colores.length - refs.length) - Math.abs(b.colores.length - refs.length));
    resultado.sugerencias = puntuadas.slice(0, 3).map(({ nivel: n, colores: c }) => ({ nivel: n, colores: c }));
  }
  return resultado;
}

/* --- Iconos y formas --------------------------------------------------------- */

export function buscarIconos(marca, consulta = "", { categoria, limite = 24 } = {}) {
  const q = normalizar(consulta);
  const cat = normalizar(categoria);
  const items = arr(marca.iconos?.items).filter((i) => {
    if (cat && normalizar(i.categoria) !== cat) return false;
    if (!q) return true;
    const pajar = normalizar([i.id, i.nombre, i.categoria, ...arr(i.claves)].join(" "));
    return q.split(/\s+/).every((p) => pajar.includes(p));
  });
  return {
    total: items.length,
    categorias: arr(marca.iconos?.categorias).map((c) => c.id),
    iconos: items.slice(0, limite).map(({ svg, ...resto }) => resto)
  };
}

/* El color por defecto de un icono: el de la marca si la iconografia es de
   un solo color, o el de su categoria si cada categoria tiene el suyo. */
function colorDeIcono(marca, categoria) {
  if (marca.iconos?.color) return resolverColor(marca, marca.iconos.color)?.hex || null;
  const c = arr(marca.iconos?.categorias).find((x) => normalizar(x.id) === normalizar(categoria));
  return c?.color ? resolverColor(marca, c.color)?.hex : null;
}

/* Un icono listo para usar, en el color que manda el sistema; con fondo, va
   en pastilla. */
export function iconoSvg(marca, id, { color, fondo, tamano = 48 } = {}) {
  const icono = arr(marca.iconos?.items).find((i) => normalizar(i.id) === normalizar(id) || normalizar(i.nombre) === normalizar(id));
  if (!icono) return null;
  const trazo = marca.iconos.trazo || { ancho: 2, terminaciones: "round", uniones: "round" };
  const vb = marca.iconos.viewBox || "0 0 24 24";
  const fondoHex = fondo ? resolverColor(marca, fondo)?.hex : null;
  const colorHex = (color && resolverColor(marca, color)?.hex) || (fondoHex ? "#FFFFFF" : colorDeIcono(marca, icono.categoria)) || "#000000";
  const trazoAttrs = `fill="none" stroke="${colorHex}" stroke-width="${trazo.ancho}" stroke-linecap="${trazo.terminaciones}" stroke-linejoin="${trazo.uniones}"`;
  let cuerpo;
  if (fondoHex) {
    const [, , w] = vb.split(/\s+/).map(Number);
    cuerpo = `<rect width="${w}" height="${w}" rx="${w * 0.26}" fill="${fondoHex}"/><g transform="translate(${w * 0.25} ${w * 0.25}) scale(0.5)" ${trazoAttrs}>${icono.svg}</g>`;
  } else {
    cuerpo = `<g ${trazoAttrs}>${icono.svg}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${tamano}" height="${tamano}" role="img" aria-label="${escaparXml(icono.nombre)}"><title>${escaparXml(icono.nombre)}</title>${cuerpo}</svg>`;
}

export function formaSvg(marca, id, { color, fondo, tamano = 96 } = {}) {
  const forma = arr(marca.formas?.items).find((f) => normalizar(f.id) === normalizar(id) || normalizar(f.nombre) === normalizar(id));
  if (!forma) return null;
  const vb = marca.formas.viewBox || "0 0 48 48";
  const relleno = (color && resolverColor(marca, color)?.hex) || resolverColor(marca, marca.paleta?.principales?.[0])?.hex || "#000000";
  const fondoHex = fondo ? resolverColor(marca, fondo)?.hex : null;
  const [, , w, h] = vb.split(/\s+/).map(Number);
  const base = fondoHex ? `<rect width="${w}" height="${h}" fill="${fondoHex}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${tamano}" height="${Math.round((tamano * h) / w)}" role="img" aria-label="${escaparXml(forma.nombre)}">${base}<g fill="${relleno}">${forma.svg}</g></svg>`;
}

/* --- Patron ------------------------------------------------------------------ */

/* El mismo PRNG que la maqueta (mulberry32): una semilla da siempre el mismo
   patron, en el navegador y en el servidor. */
function rng(semilla) {
  let s = semilla | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generarPatron(marca, opciones = {}) {
  const def = marca.patron;
  if (!def) return null;
  const paletas = arr(def.paletas);
  if (!paletas.length || !arr(def.piezas).length) return null;
  const pal = paletas.find((p) => normalizar(p.id) === normalizar(opciones.paleta)) || paletas[Number(opciones.paleta)] || paletas[0];
  const columnas = Math.max(1, Math.min(40, Math.round(opciones.columnas ?? def.defaults?.columnas ?? 6)));
  const ancho = Math.max(16, Math.round(opciones.ancho ?? 1200));
  const alto = Math.max(16, Math.round(opciones.alto ?? ancho));
  const vacio = Math.max(0, Math.min(0.95, opciones.vacio ?? def.defaults?.vacio ?? 0.2));
  const semilla = Number.isFinite(opciones.semilla) ? opciones.semilla : Math.floor(Math.random() * 1e9);
  const s = ancho / columnas;
  const filas = Math.ceil(alto / s);
  const azar = rng(semilla);
  const hex = (id) => resolverColor(marca, id)?.hex || id;
  const formas = arr(pal.formas).map(hex);
  const escala = Math.round((s / 48) * 1e4) / 1e4;

  const celdas = [];
  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < columnas; x++) {
      if (azar() < vacio) continue;
      const pieza = def.piezas[Math.floor(azar() * def.piezas.length)];
      const giro = Math.floor(azar() * 4) * 90;
      const color = formas[Math.floor(azar() * formas.length)];
      const cx = x * s + s / 2;
      const cy = y * s + s / 2;
      const r = (n) => Math.round(n * 100) / 100;
      celdas.push(`<path d="${pieza.d}" fill="${color}" transform="translate(${r(cx)} ${r(cy)}) rotate(${giro}) translate(${r(-s / 2)} ${r(-s / 2)}) scale(${escala})"/>`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}"><rect width="${ancho}" height="${alto}" fill="${hex(pal.fondo)}"/>${celdas.join("")}</svg>`;
  return { svg, paleta: pal.id, columnas, filas, semilla, vacio, ancho, alto };
}

/* --- Manual: glosario, tareas, tipografia, voz --------------------------- */

export function glosario(marca, termino) {
  const lista = arr(marca.glosario);
  if (!termino) return lista;
  const q = normalizar(termino);
  return lista.filter((g) => normalizar(g.termino).includes(q) || normalizar(g.definicion).includes(q));
}

/* La entrada del manual no pregunta en que seccion buscas, pregunta que
   necesitas hacer. Esto es esa entrada: se matchea por claves y titulo. */
export function queNecesitas(marca, pedido) {
  const tareas = arr(marca.tareas);
  const q = normalizar(pedido);
  if (!q) return { tareas: tareas.map(({ id, titulo }) => ({ id, titulo })) };
  const puntaje = (t) => {
    const palabras = q.split(/\s+/);
    const pajar = [t.id, t.titulo, ...arr(t.claves)].map(normalizar);
    return palabras.reduce((n, p) => n + (pajar.some((x) => x.includes(p) || p.includes(x)) ? 1 : 0), 0);
  };
  const ranking = tareas.map((t) => ({ t, p: puntaje(t) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p);
  if (!ranking.length) {
    return { encontrada: false, tareas: tareas.map(({ id, titulo }) => ({ id, titulo })) };
  }
  return { encontrada: true, tarea: ranking[0].t, otras: ranking.slice(1, 3).map((x) => ({ id: x.t.id, titulo: x.t.titulo })) };
}

export function revisarTexto(marca, texto) {
  const voz = marca.voz || {};
  const plano = normalizar(texto);
  const hallazgos = [];
  for (const regla of arr(voz.evitar)) {
    const termino = typeof regla === "string" ? regla : regla.termino;
    /* La raiz atrapa las conjugaciones: "implement" encuentra implementó,
       implementamos, implementación. */
    if (plano.includes(normalizar(regla.raiz || termino))) {
      hallazgos.push({ tipo: "evitar", termino, motivo: regla.motivo, usar: regla.usar });
    }
  }
  for (const regla of arr(voz.preferir)) {
    for (const alternativa of arr(regla.en_vez_de)) {
      if (plano.includes(normalizar(alternativa))) {
        hallazgos.push({ tipo: "preferir", encontrado: alternativa, usar: regla.termino, motivo: regla.motivo });
      }
    }
  }
  for (const o of arr(marca.obsoleto).filter((x) => x.tipo === "termino")) {
    for (const t of [o.nombre, ...arr(o.alias)]) {
      if (t && plano.includes(normalizar(t))) {
        hallazgos.push({ tipo: "obsoleto", encontrado: t, usar: o.reemplazo, desde: o.desde, motivo: o.motivo });
        break;
      }
    }
  }
  const sinReglas = !arr(voz.evitar).length && !arr(voz.preferir).length && !arr(marca.obsoleto).length;
  return {
    hallazgos,
    ok: hallazgos.length === 0,
    ...(sinReglas ? { aviso: "La marca no tiene reglas de voz cargadas todavía: no se controló nada." } : {}),
    nota: voz.nota
  };
}

/* --- Vigencia ---------------------------------------------------------------- */

/* El agente no sabe que archivo es el actual: va a elegir algo razonable y
   seguir. Esto se lo dice. Cualquier cosa que alguien encuentre en una
   carpeta vieja (un hex, un logo, un nombre de archivo, una palabra) se
   chequea contra la marca vigente y contra la lista de lo retirado. */
export function vigencia(marca, consulta) {
  const q = normalizar(consulta);
  const claves = (o) => [o.nombre, o.valor, ...arr(o.alias)].filter(Boolean).map(normalizar);
  const comoRetirado = (o) => ({ vigente: false, que: o.tipo, nombre: o.nombre, reemplazo: o.reemplazo, desde: o.desde, motivo: o.motivo, ...(o.verificar ? { verificar: "Dato a confirmar con el cliente." } : {}), versionActual: marca.version });

  /* En tres pasos, del mas seguro al menos: lo retirado que coincide exacto
     (nombre, alias o hex), despues lo vigente, y recien al final lo retirado
     que aparece adentro de lo consultado (un nombre de archivo como
     logo_2019_final.png). Al reves, "azul" daria retirado por coincidir con
     "Azul aproximado de la maqueta". */
  const exacto = arr(marca.obsoleto).find((o) =>
    claves(o).includes(q) || (o.valor && hexNormal(o.valor) && hexNormal(o.valor) === hexNormal(consulta))
  );
  if (exacto) return comoRetirado(exacto);

  const color = resolverColor(marca, consulta);
  if (color?.deLaMarca) return { vigente: true, que: "color", id: color.id, hex: color.hex, versionActual: marca.version };

  const enLista = (lista, que) => {
    const x = arr(lista).find((i) => normalizar(i.id) === q || normalizar(i.nombre) === q);
    return x ? { vigente: true, que, id: x.id, nombre: x.nombre, versionActual: marca.version } : null;
  };
  const familias = Object.values(marca.tipografia || {})
    .filter((t) => t && typeof t.familia === "string")
    .map((t) => ({ id: t.familia, nombre: t.familia }));
  const encontrado =
    enLista(familias, "tipografia") ||
    enLista(marca.iconos?.items, "icono") ||
    enLista(marca.formas?.items, "forma") ||
    enLista(arr(marca.logo?.archivos), "logo");
  if (encontrado) return encontrado;

  const contenido = arr(marca.obsoleto).find((o) => claves(o).some((n) => n.length > 3 && q.includes(n)));
  if (contenido) return comoRetirado(contenido);

  if (color) {
    return { vigente: false, que: "color", hex: color.hex, motivo: "No es un color de la marca.", reemplazo: color.masCercano.id, masCercano: color.masCercano, versionActual: marca.version };
  }
  return {
    vigente: null,
    motivo: "No está en la marca vigente ni en la lista de retirados. No se puede confirmar: tratalo como no vigente y reportalo.",
    versionActual: marca.version
  };
}

/* Quien decide cada parte del sistema. Un documento de voz cuyo dueno ya no
   esta en la empresa es un documento sin dueno: aca se ve. */
export function responsable(marca, area) {
  const lista = arr(marca.responsables);
  if (!area) return lista;
  const q = normalizar(area);
  return lista.find((r) => arr(r.areas).some((a) => normalizar(a) === q || q.includes(normalizar(a)))) || lista.find((r) => arr(r.areas).includes("todo")) || null;
}

/* --- Exportables ------------------------------------------------------------- */

export function tokensCss(marca, prefijo = marca.id) {
  const lineas = arr(marca.colores).map((c) => `  --${prefijo}-${c.id}: ${hexNormal(c.hex)};`);
  return `/* ${marca.nombre} v${marca.version} — generado desde marcas/${marca.id}/marca.json */\n:root {\n${lineas.join("\n")}\n}\n`;
}

export function resumen(marca) {
  return {
    id: marca.id,
    nombre: marca.nombre,
    sector: marca.sector,
    version: marca.version,
    estudio: marca.estudio,
    descripcion: marca.descripcion,
    contenido: {
      colores: arr(marca.colores).length,
      duplas: marca.paleta?.duplas?.length || 0,
      terciarias: marca.paleta?.terciarias?.length || 0,
      formas: marca.formas?.items?.length || 0,
      iconos: marca.iconos?.items?.length || 0,
      iconosEnManual: marca.iconos?.total_en_manual,
      glosario: marca.glosario?.length || 0,
      tareas: arr(marca.tareas).map((t) => t.titulo),
      retirados: arr(marca.obsoleto).length
    },
    responsables: marca.responsables,
    fuentes: marca.fuentes,
    pendientes: pendientes(marca).length,
    ultimoCambio: marca.changelog?.[0]
  };
}
