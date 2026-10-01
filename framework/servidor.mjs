#!/usr/bin/env node
/* ==========================================================================
   Servidor MCP del framework de marcas de Bong.

   Una instancia sirve UNA marca: cada cliente tiene su propio servidor (su
   propia URL, su propio token) y nunca ve los datos de otro.

     node framework/servidor.mjs --marca profertil            # stdio
     node framework/servidor.mjs --marca profertil --http     # HTTP en :8787

   Variables de entorno (las banderas les ganan):
     MARCA         id de la carpeta en marcas/
     PUERTO        puerto HTTP (8787)
     HOST          interfaz HTTP (127.0.0.1; 0.0.0.0 para publicarlo)
     MCP_TOKEN     si esta, el endpoint exige el token, por header
                   "Authorization: Bearer <token>" o en la ruta /<token>/mcp
     URL_PUBLICA   base publica (https://marca.bongstudio.ar/<token>). Si esta,
                   las tools devuelven links descargables a los SVG.
     REGISTRO      carpeta donde se anotan los huecos que reportan los
                   agentes (registro/ en la raiz del repo).

   Sin dependencias: el protocolo es JSON-RPC 2.0, y con stdio y HTTP plano
   alcanza para Claude Desktop, Claude Code y los conectores de claude.ai.
   ========================================================================== */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as N from "./nucleo.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* --- Registro de huecos -------------------------------------------------------
   Cuando el sistema no cubre un pedido, el agente igual va a resolverlo de
   alguna forma. Lo que no puede pasar es que eso quede invisible: cada hueco
   se anota aca, y es la lista de trabajo para la proxima version del manual.
   Un JSONL por marca, append-only. */
function rutaRegistro(marca) {
  return path.join(process.env.REGISTRO ? path.resolve(process.env.REGISTRO) : path.join(RAIZ, "registro"), `${marca.id}.jsonl`);
}

function anotarHueco(marca, hueco) {
  const ruta = rutaRegistro(marca);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const entrada = { fecha: new Date().toISOString(), version: marca.version, ...hueco };
  fs.appendFileSync(ruta, JSON.stringify(entrada) + "\n");
  return entrada;
}

function leerHuecos(marca) {
  const ruta = rutaRegistro(marca);
  if (!fs.existsSync(ruta)) return [];
  return fs.readFileSync(ruta, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const VERSIONES = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

/* --- Argumentos ------------------------------------------------------------ */

function argumentos(argv) {
  const a = { marca: process.env.MARCA, http: false, puerto: Number(process.env.PUERTO) || 8787, host: process.env.HOST || "127.0.0.1" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--marca") a.marca = argv[++i];
    else if (k === "--archivo") a.archivo = argv[++i];
    else if (k === "--http") a.http = true;
    else if (k === "--puerto") a.puerto = Number(argv[++i]);
    else if (k === "--host") a.host = argv[++i];
  }
  return a;
}

/* El kit: los markdown que una persona hojea y un agente lee. Viven en
   marcas/<id>/kit/ al lado del marca.json. La primera linea "# Titulo" y el
   primer parrafo hacen de indice. */
export function cargarKit(dirMarca) {
  const dir = path.join(dirMarca, "kit");
  if (!fs.existsSync(dir)) return [];
  const orden = (n) => (n === "LEEME.md" ? "0" : "1" + n);
  return fs.readdirSync(dir).filter((n) => n.endsWith(".md")).sort((a, b) => orden(a).localeCompare(orden(b))).map((archivo) => {
    const texto = fs.readFileSync(path.join(dir, archivo), "utf8");
    const titulo = (/^#\s+(.+)$/m.exec(texto) || [, archivo])[1].trim();
    const resumen = texto.split(/\n\s*\n/).map((b) => b.trim()).find((b) => b && !b.startsWith("#")) || "";
    return { archivo, titulo, resumen: resumen.replace(/\s+/g, " ").slice(0, 240), texto };
  });
}

export function cargarMarca({ marca, archivo }) {
  const ruta = archivo ? path.resolve(archivo) : path.join(RAIZ, "marcas", String(marca || ""), "marca.json");
  if (!marca && !archivo) throw new Error("Falta la marca: --marca <id> o MARCA=<id>. Las disponibles están en marcas/.");
  if (!fs.existsSync(ruta)) throw new Error(`No existe ${path.relative(RAIZ, ruta)}.`);
  const datos = JSON.parse(fs.readFileSync(ruta, "utf8"));
  /* El kit no se serializa con la marca: va aparte, como texto. */
  Object.defineProperty(datos, "kit", { value: cargarKit(path.dirname(ruta)), enumerable: false });
  return datos;
}

/* --- Tools ----------------------------------------------------------------- */

const texto = (s) => ({ content: [{ type: "text", text: s }] });
const json = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }], structuredContent: Array.isArray(o) ? { items: o } : o });
const error = (s) => ({ content: [{ type: "text", text: s }], isError: true });

/* Un enum vacio no es JSON Schema valido: mientras la marca no cargue la lista,
   el parametro queda como texto libre. */
const conEnum = (lista) => (lista.length ? { enum: lista } : {});

const colorRef = { type: "string", description: "Id del color de la marca (ej. \"azul\"), su nombre o un hex." };

export function crearTools(marca, { urlPublica } = {}) {
  const link = (ruta, params = {}) => {
    if (!urlPublica) return undefined;
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
    return `${urlPublica.replace(/\/$/, "")}${ruta}${qs.size ? "?" + qs : ""}`;
  };
  const conLink = (svg, url, extra = {}) => {
    const meta = { ...extra, ...(url ? { descargar: url } : {}) };
    return { content: [{ type: "text", text: JSON.stringify(meta, null, 2) }, { type: "text", text: svg }], structuredContent: { ...meta, svg } };
  };
  const paletasPatron = N.arr(marca.patron?.paletas).map((p) => p.id);
  const kit = marca.kit || [];

  return [
    {
      name: "marca",
      title: `Resumen de ${marca.nombre}`,
      description: `Qué es la marca ${marca.nombre}, sus principios, qué contiene el sistema y qué datos faltan cargar. Llamala primero si no conocés la marca.`,
      inputSchema: { type: "object", properties: {} },
      run: () => json({ ...N.resumen(marca), kit: (marca.kit || []).map((k) => k.archivo) })
    },
    {
      name: "que_necesitas_hacer",
      title: "¿Qué necesitás hacer?",
      description: "La entrada del manual por tarea. Recibe lo que la persona quiere hacer (\"una presentación para productores\", \"un cartel de obra\") y devuelve la receta del sistema: pasos, reglas y qué otras tools usar. Usala antes de producir cualquier pieza.",
      inputSchema: { type: "object", properties: { pedido: { type: "string", description: "Lo que hay que hacer, en palabras de la persona." } }, required: ["pedido"] },
      run: ({ pedido }) => json(N.queNecesitas(marca, pedido))
    },
    {
      name: "colores",
      title: "Paleta",
      description: "Todos los colores de la marca con hex y rol, más las combinaciones aprobadas: principales, duplas y terciarias. Nunca uses un color que no esté acá.",
      inputSchema: { type: "object", properties: {} },
      run: () => json(N.colores(marca))
    },
    {
      name: "validar_combinacion",
      title: "Validar combinación de colores",
      description: "Dice si un conjunto de colores es una combinación aprobada (principal, dupla o terciaria), el contraste entre cada par y, si no está aprobada, qué combinación del sistema usar en su lugar. Si le pasás un hex que no es de la marca, te dice cuál es el más cercano.",
      inputSchema: { type: "object", properties: { colores: { type: "array", items: colorRef, minItems: 1, maxItems: 5 } }, required: ["colores"] },
      run: ({ colores }) => json(N.validarCombinacion(marca, colores))
    },
    {
      name: "contraste",
      title: "Contraste de texto",
      description: "Contraste WCAG de un texto sobre un fondo. Devuelve el ratio y si alcanza AA o AAA para texto normal y grande.",
      inputSchema: { type: "object", properties: { fondo: colorRef, texto: colorRef }, required: ["fondo", "texto"] },
      run: ({ fondo, texto: t }) => {
        const f = N.resolverColor(marca, fondo);
        const x = N.resolverColor(marca, t);
        if (!f || !x) return error("No entiendo uno de los colores. Pasá un id de la marca o un hex.");
        return json({ fondo: f, texto: x, ...N.contraste(f.hex, x.hex) });
      }
    },
    {
      name: "buscar_iconos",
      title: "Buscar íconos",
      description: "Busca en la iconografía oficial por nombre, palabra clave o categoría. Devuelve ids; para el SVG usá la tool icono. No uses íconos que no salgan de acá.",
      inputSchema: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "Qué buscar: \"agua\", \"seguridad\", \"camión\". Vacío lista todos." },
          categoria: { type: "string", description: "Filtra por categoría.", ...conEnum(N.arr(marca.iconos?.categorias).map((c) => c.id)) },
          limite: { type: "integer", minimum: 1, maximum: 200, default: 24 }
        }
      },
      run: ({ consulta, categoria, limite }) => json(N.buscarIconos(marca, consulta, { categoria, limite }))
    },
    {
      name: "icono",
      title: "Ícono en SVG",
      description: "El SVG de un ícono oficial, listo para pegar en un HTML, una presentación o un documento. Sin color va en el color de su categoría; con fondo va en pastilla.",
      inputSchema: { type: "object", properties: { id: { type: "string" }, color: colorRef, fondo: colorRef, tamano: { type: "integer", minimum: 8, maximum: 2048, default: 48 } }, required: ["id"] },
      run: ({ id, color, fondo, tamano }) => {
        const svg = N.iconoSvg(marca, id, { color, fondo, tamano });
        if (!svg) return error(`No hay un ícono "${id}". Buscalo con buscar_iconos.`);
        return conLink(svg, link(`/icono/${encodeURIComponent(id)}.svg`, { color, fondo, tamano }), { id });
      }
    },
    {
      name: "forma",
      title: "Alfabeto de formas",
      description: "Sin id, lista el alfabeto de formas del sistema y de dónde sale. Con id, devuelve el SVG de esa forma en un color de la marca, para usarla como máscara u ordenador del layout.",
      inputSchema: { type: "object", properties: { id: { type: "string" }, color: colorRef, fondo: colorRef, tamano: { type: "integer", minimum: 8, maximum: 4096, default: 96 } } },
      run: ({ id, color, fondo, tamano }) => {
        if (!id) return json({ nota: marca.formas?.nota, formas: N.arr(marca.formas?.items).map(({ svg, ...f }) => f) });
        const svg = N.formaSvg(marca, id, { color, fondo, tamano });
        if (!svg) return error(`No hay una forma "${id}". Llamá a forma sin id para ver la lista.`);
        return conLink(svg, link(`/forma/${encodeURIComponent(id)}.svg`, { color, fondo, tamano }), { id });
      }
    },
    {
      name: "generar_patron",
      title: "Generar patrón",
      description: "Genera un patrón del sistema en SVG, igual que el generador web. La misma semilla da siempre el mismo patrón: anotala si la persona quiere repetirlo.",
      inputSchema: {
        type: "object",
        properties: {
          paleta: { type: "string", description: "Paleta del patrón.", ...conEnum(paletasPatron) },
          columnas: { type: "integer", minimum: 1, maximum: 40, description: "Escala: menos columnas, formas más grandes." },
          ancho: { type: "integer", minimum: 16, maximum: 8000, default: 1200 },
          alto: { type: "integer", minimum: 16, maximum: 8000, description: "Por defecto, igual al ancho." },
          semilla: { type: "integer", description: "Para repetir un patrón. Sin semilla sale uno nuevo." },
          vacio: { type: "number", minimum: 0, maximum: 0.95, description: "Proporción de celdas vacías." }
        }
      },
      run: (o) => {
        const p = N.generarPatron(marca, o);
        if (!p) return error("Esta marca no tiene patrón definido.");
        const { svg, ...meta } = p;
        return conLink(svg, link("/patron.svg", meta), meta);
      }
    },
    {
      name: "tipografia",
      title: "Tipografía",
      description: "Las familias tipográficas de la marca y para qué se usa cada una.",
      inputSchema: { type: "object", properties: {} },
      run: () => json(marca.tipografia || {})
    },
    {
      name: "leer_kit",
      title: "Leer el kit de marca",
      description: "El kit en texto: estrategia, voz, dirección de arte (cada regla con su porqué y dónde aplica) y decisiones. Sin sección, devuelve el índice. Leé LEEME.md primero y después solo las secciones que pida la tarea (que_necesitas_hacer las indica en \"leer\").",
      inputSchema: { type: "object", properties: { seccion: { type: "string", description: "Archivo del kit, ej. \"direccion-de-arte.md\". Vacío, el índice.", ...conEnum(kit.map((k) => k.archivo)) } } },
      run: ({ seccion }) => {
        if (!kit.length) return error("Esta marca todavía no tiene kit escrito.");
        if (!seccion) return json({ indice: kit.map(({ texto: _, ...k }) => k) });
        const k = kit.find((x) => x.archivo === seccion);
        return k ? texto(k.texto) : error(`No hay una sección "${seccion}". Pedí el índice sin sección.`);
      }
    },
    {
      name: "glosario",
      title: "Glosario",
      description: "Definiciones del manual para quien aplica la marca sin ser diseñador. Sin término, devuelve el glosario entero.",
      inputSchema: { type: "object", properties: { termino: { type: "string" } } },
      run: ({ termino }) => json(N.glosario(marca, termino))
    },
    {
      name: "revisar_texto",
      title: "Revisar texto",
      description: "Revisa un texto contra las reglas de voz y terminología de la marca y marca lo que hay que cambiar.",
      inputSchema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
      run: ({ texto: t }) => json(N.revisarTexto(marca, t))
    },
    {
      name: "tokens",
      title: "Tokens de diseño",
      description: "Los colores como variables CSS o JSON, para desarrolladores y proveedores web.",
      inputSchema: { type: "object", properties: { formato: { type: "string", enum: ["css", "json"], default: "css" } } },
      run: ({ formato }) => (formato === "json" ? json(N.colores(marca).tokens) : texto(N.tokensCss(marca)))
    },
    {
      name: "changelog",
      title: "Changelog del manual",
      description: "Historial de versiones del sistema. El manual se versiona como software.",
      inputSchema: { type: "object", properties: {} },
      run: () => json({ version: marca.version, cambios: N.arr(marca.changelog) })
    },
    {
      name: "es_vigente",
      title: "¿Esto está vigente?",
      description: "Chequea si algo que alguien encontró (un hex, un logo, un nombre de archivo, una tipografía, una palabra) es de la versión actual de la marca o quedó retirado, y qué lo reemplaza. Usala siempre que la persona traiga un archivo, una pieza vieja o un color que no salió de estas tools.",
      inputSchema: { type: "object", properties: { que: { type: "string", description: "Lo que hay que chequear: \"#1A47B8\", \"logo_2019.png\", \"Profertil S.A.\"." } }, required: ["que"] },
      run: ({ que }) => json(N.vigencia(marca, que))
    },
    {
      name: "responsables",
      title: "¿A quién le pregunto?",
      description: "Quién decide cada parte del sistema (marca, voz, logo, web, sistema). Usala cuando algo no está cubierto o está pendiente, para decirle a la persona con quién validarlo.",
      inputSchema: { type: "object", properties: { area: { type: "string", description: "Sobre qué: voz, logo, colores, web… Vacío lista todos." } } },
      run: ({ area }) => json(N.responsable(marca, area) ?? { aviso: "No hay responsable cargado para esa área." })
    },
    {
      name: "reportar_hueco",
      title: "Reportar un hueco del sistema",
      description: "Anota algo que el sistema no cubre: un pedido sin receta, un dato pendiente que hizo falta, un caso que el manual no anticipó, o una decisión que tuviste que tomar por tu cuenta. Llamala cada vez que pase, sin pedir permiso: es como el sistema se entera de dónde le falta.",
      inputSchema: {
        type: "object",
        properties: {
          pedido: { type: "string", description: "Qué pidió la persona." },
          falta: { type: "string", description: "Qué no estaba en el sistema." },
          decision: { type: "string", description: "Qué hiciste en su lugar, si hiciste algo." }
        },
        required: ["pedido", "falta"]
      },
      run: ({ pedido, falta, decision }) => {
        const entrada = anotarHueco(marca, { pedido, falta, decision });
        const quien = N.responsable(marca, falta);
        return json({ anotado: true, fecha: entrada.fecha, ...(quien ? { validarCon: quien } : {}) });
      }
    }
  ];
}

/* --- Instrucciones para el modelo -------------------------------------------- */

function instrucciones(marca) {
  return [
    `Este servidor es el sistema de marca de ${marca.nombre} (v${marca.version}), diseñado por ${marca.estudio || "Bong Studio"}.`,
    "Lo usan personas de la compañía y proveedores que no son diseñadores: hablales claro y sin jerga.",
    "Reglas:",
    "- Antes de producir cualquier pieza, llamá a que_necesitas_hacer con lo que te pidieron, leé con leer_kit las secciones que indique en \"leer\" y seguí la receta. No hace falta leer el kit entero.",
    "- Cada regla del kit tiene su porqué. Cuando una regla frene lo que la persona quiere, explicale el porqué, no solo la regla. Cuando el kit no cubra el caso, seguí el procedimiento de LEEME.md.",
    "- Usá solo colores, combinaciones, formas e íconos que salgan de estas tools. No inventes hex ni dibujes íconos propios.",
    "- Si combinás colores, pasalos por validar_combinacion. Si ponés texto sobre color, pasalo por contraste.",
    "- Si la persona trae un archivo, una pieza vieja, un logo o un color que no salió de estas tools, pasalo por es_vigente antes de usarlo. Hay versiones viejas de la marca dando vueltas.",
    "- Si un dato viene como { pendiente: ... }, la marca todavía no lo tiene cargado: decilo y no lo completes por tu cuenta.",
    "- Si el sistema no cubre lo que te piden, vas a tener que decidir algo. Elegí lo más cercano que sí esté aprobado, decí que es una decisión tuya y no del sistema, llamá a reportar_hueco y decile a la persona con quién validarlo (responsables).",
    "- Si algo de lo que te piden contradice el sistema, explicá por qué y ofrecé la alternativa que sí está aprobada."
  ].join("\n");
}

/* --- Recursos y prompts ------------------------------------------------------ */

function recursos(marca) {
  const base = `marca://${marca.id}`;
  return [
    { uri: `${base}/marca.json`, name: `${marca.nombre} — sistema completo`, mimeType: "application/json", leer: () => JSON.stringify(marca, null, 2) },
    ...(marca.kit || []).map((k) => ({ uri: `${base}/kit/${k.archivo}`, name: `${marca.nombre} — ${k.titulo}`, description: k.resumen, mimeType: "text/markdown", leer: () => k.texto })),
    { uri: `${base}/tokens.css`, name: `${marca.nombre} — tokens CSS`, mimeType: "text/css", leer: () => N.tokensCss(marca) },
    { uri: `${base}/pendientes.json`, name: `${marca.nombre} — datos que faltan cargar`, mimeType: "application/json", leer: () => JSON.stringify(N.pendientes(marca), null, 2) },
    { uri: `${base}/huecos.json`, name: `${marca.nombre} — huecos reportados por los agentes`, mimeType: "application/json", leer: () => JSON.stringify(leerHuecos(marca), null, 2) }
  ];
}

function prompts(marca) {
  return [
    {
      name: "pieza",
      title: `Armar una pieza de ${marca.nombre}`,
      description: "Guía para producir una pieza dentro del sistema, de punta a punta.",
      arguments: [
        { name: "que", description: "Qué pieza: presentación, mail, cartel, posteo…", required: true },
        { name: "detalle", description: "Para quién es, qué tiene que decir, formato.", required: false }
      ],
      armar: ({ que, detalle }) =>
        `Necesito armar ${que} para ${marca.nombre}.${detalle ? " " + detalle : ""}\n\n` +
        "Primero llamá a que_necesitas_hacer con este pedido. Después elegí una combinación de colores aprobada y validala, " +
        "buscá los íconos oficiales que hagan falta y, si la receta lo pide, generá un patrón. " +
        "Al final, contame qué decisiones del sistema tomaste y por qué."
    }
  ];
}

/* --- JSON-RPC ---------------------------------------------------------------- */

function validar(schema, args) {
  for (const req of schema.required || []) {
    if (args[req] === undefined || args[req] === null || args[req] === "") return `Falta el parámetro "${req}".`;
  }
  for (const [k, v] of Object.entries(args)) {
    const p = schema.properties?.[k];
    if (!p) continue;
    if (p.type === "array" && !Array.isArray(v)) return `"${k}" tiene que ser una lista.`;
    if ((p.type === "integer" || p.type === "number") && typeof v !== "number") return `"${k}" tiene que ser un número.`;
    if (p.type === "string" && typeof v !== "string") return `"${k}" tiene que ser texto.`;
    if (p.enum && !p.enum.includes(v)) return `"${k}" tiene que ser uno de: ${p.enum.join(", ")}.`;
  }
  return null;
}

export function crearServidor(marca, opciones = {}) {
  const tools = crearTools(marca, opciones);
  const porNombre = new Map(tools.map((t) => [t.name, t]));
  const recs = recursos(marca);
  const prs = prompts(marca);

  const metodos = {
    initialize: (p) => ({
      protocolVersion: VERSIONES.includes(p?.protocolVersion) ? p.protocolVersion : VERSIONES[0],
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: { name: `bong-${marca.id}`, title: `Sistema ${marca.nombre} · Bong`, version: marca.version },
      instructions: instrucciones(marca)
    }),
    ping: () => ({}),
    "tools/list": () => ({ tools: tools.map(({ run, ...t }) => t) }),
    "tools/call": (p) => {
      const tool = porNombre.get(p?.name);
      if (!tool) throw Object.assign(new Error(`No existe la tool "${p?.name}".`), { code: -32602 });
      const args = p.arguments || {};
      const problema = validar(tool.inputSchema, args);
      if (problema) return error(problema);
      try {
        return tool.run(args);
      } catch (e) {
        return error(`Falló ${tool.name}: ${e.message}`);
      }
    },
    "resources/list": () => ({ resources: recs.map(({ leer, ...r }) => r) }),
    "resources/templates/list": () => ({ resourceTemplates: [] }),
    "resources/read": (p) => {
      const r = recs.find((x) => x.uri === p?.uri);
      if (!r) throw Object.assign(new Error(`No existe el recurso ${p?.uri}.`), { code: -32002 });
      return { contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.leer() }] };
    },
    "prompts/list": () => ({ prompts: prs.map(({ armar, ...p }) => p) }),
    "prompts/get": (p) => {
      const pr = prs.find((x) => x.name === p?.name);
      if (!pr) throw Object.assign(new Error(`No existe el prompt "${p?.name}".`), { code: -32602 });
      return { description: pr.description, messages: [{ role: "user", content: { type: "text", text: pr.armar(p.arguments || {}) } }] };
    }
  };

  /* Devuelve la respuesta o null si era una notificacion. */
  function atender(msg) {
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      return msg && "id" in msg && !("method" in msg) ? null : { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Pedido inválido." } };
    }
    const esNotificacion = !("id" in msg);
    if (esNotificacion) return null;
    const fn = metodos[msg.method];
    if (!fn) return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Método no soportado: ${msg.method}` } };
    try {
      return { jsonrpc: "2.0", id: msg.id, result: fn(msg.params) };
    } catch (e) {
      return { jsonrpc: "2.0", id: msg.id, error: { code: e.code || -32603, message: e.message } };
    }
  }

  function procesar(cuerpo) {
    if (Array.isArray(cuerpo)) {
      const r = cuerpo.map(atender).filter(Boolean);
      return r.length ? r : null;
    }
    return atender(cuerpo);
  }

  return { procesar, tools };
}

/* --- Transportes ------------------------------------------------------------- */

function stdio(servidor) {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) !== -1) {
      const linea = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!linea) continue;
      let msg;
      try {
        msg = JSON.parse(linea);
      } catch {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } }) + "\n");
        continue;
      }
      const r = servidor.procesar(msg);
      if (r) process.stdout.write(JSON.stringify(r) + "\n");
    }
  });
  process.stdin.on("end", () => process.exit(0));
}

function servirHttp(servidor, marca, { puerto, host, token }) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
    "Access-Control-Expose-Headers": "Mcp-Session-Id"
  };
  const responder = (res, codigo, cuerpo, tipo = "application/json; charset=utf-8") => {
    res.writeHead(codigo, { ...cors, "Content-Type": tipo });
    res.end(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo));
  };

  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let ruta = url.pathname;

    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

    /* El token puede venir en la ruta (/<token>/mcp) porque el conector de
       claude.ai no deja poner headers; o en Authorization, para el resto. */
    if (token) {
      const header = req.headers.authorization === `Bearer ${token}`;
      const prefijo = `/${token}`;
      if (ruta === prefijo || ruta.startsWith(prefijo + "/")) ruta = ruta.slice(prefijo.length) || "/";
      else if (!header) return responder(res, 401, { error: "Falta el token." });
    }

    if (ruta === "/mcp") {
      if (req.method !== "POST") return responder(res, 405, { error: "Este servidor no abre streams: usá POST." });
      let cuerpo = "";
      req.setEncoding("utf8");
      req.on("data", (c) => { cuerpo += c; if (cuerpo.length > 1e6) req.destroy(); });
      req.on("end", () => {
        let msg;
        try { msg = JSON.parse(cuerpo); } catch { return responder(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } }); }
        const r = servidor.procesar(msg);
        if (!r) { res.writeHead(202, cors); return res.end(); }
        responder(res, 200, r);
      });
      return;
    }

    if (req.method !== "GET") return responder(res, 405, { error: "Método no permitido." });
    const q = Object.fromEntries(url.searchParams);
    const num = (v) => (v === undefined || v === "" ? undefined : Number(v));
    const svg = (s) => (s ? responder(res, 200, s, "image/svg+xml") : responder(res, 404, { error: "No existe." }));

    if (ruta === "/") return responder(res, 200, { marca: marca.nombre, version: marca.version, mcp: "/mcp" });
    if (ruta === "/tokens.css") return responder(res, 200, N.tokensCss(marca), "text/css; charset=utf-8");
    if (ruta === "/patron.svg") {
      const p = N.generarPatron(marca, { paleta: q.paleta, columnas: num(q.columnas), ancho: num(q.ancho), alto: num(q.alto), semilla: num(q.semilla), vacio: num(q.vacio) });
      return svg(p?.svg);
    }
    let m;
    if ((m = /^\/icono\/([^/]+)\.svg$/.exec(ruta))) return svg(N.iconoSvg(marca, decodeURIComponent(m[1]), { color: q.color, fondo: q.fondo, tamano: num(q.tamano) }));
    if ((m = /^\/forma\/([^/]+)\.svg$/.exec(ruta))) return svg(N.formaSvg(marca, decodeURIComponent(m[1]), { color: q.color, fondo: q.fondo, tamano: num(q.tamano) }));
    responder(res, 404, { error: "No existe." });
  });

  srv.listen(puerto, host, () => {
    console.error(`[bong-${marca.id}] MCP en http://${host}:${puerto}${token ? "/<token>" : ""}/mcp`);
  });
  return srv;
}

/* --- Arranque ---------------------------------------------------------------- */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = argumentos(process.argv.slice(2));
  let marca;
  try {
    marca = cargarMarca(a);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const servidor = crearServidor(marca, { urlPublica: a.http ? process.env.URL_PUBLICA : undefined });
  if (a.http) servirHttp(servidor, marca, { puerto: a.puerto, host: a.host, token: process.env.MCP_TOKEN });
  else stdio(servidor);
}
