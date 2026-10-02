#!/usr/bin/env node
/* ==========================================================================
   Prueba de punta a punta: levanta el servidor de cada marca por stdio,
   habla MCP como lo haria Claude y llama a todas las tools. Despues prueba
   el transporte HTTP con token.

     node framework/prueba.mjs
   ========================================================================== */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import os from "node:os";
import * as N from "./nucleo.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SERVIDOR = path.join(AQUI, "servidor.mjs");
const MARCAS = fs.readdirSync(path.join(AQUI, "..", "marcas")).filter((d) => !d.startsWith("_"));
/* Los huecos de la prueba van a una carpeta temporal, no al registro real. */
const REGISTRO = fs.mkdtempSync(path.join(os.tmpdir(), "bong-registro-"));
process.env.REGISTRO = REGISTRO;

function clienteStdio(marca) {
  const p = spawn(process.execPath, [SERVIDOR, "--marca", marca], { stdio: ["pipe", "pipe", "inherit"] });
  let buffer = "";
  let n = 0;
  const esperando = new Map();
  p.stdout.setEncoding("utf8");
  p.stdout.on("data", (c) => {
    buffer += c;
    let i;
    while ((i = buffer.indexOf("\n")) !== -1) {
      const msg = JSON.parse(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
      esperando.get(msg.id)?.(msg);
      esperando.delete(msg.id);
    }
  });
  return {
    pedir(method, params) {
      const id = ++n;
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      return new Promise((ok) => esperando.set(id, ok));
    },
    avisar(method) { p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n"); },
    cerrar() { p.stdin.end(); }
  };
}

const llamadas = {
  marca: {},
  que_necesitas_hacer: { pedido: "una presentación para productores" },
  colores: {},
  validar_combinacion: { colores: ["azul", "#F0C419"] },
  contraste: { fondo: "azul", texto: "#FFFFFF" },
  buscar_iconos: { consulta: "agua" },
  icono: { id: "gota", fondo: "azul" },
  forma: { id: "hoja", color: "verde" },
  generar_patron: { semilla: 42, columnas: 4, ancho: 400 },
  tipografia: {},
  leer_kit: {},
  glosario: { termino: "dupla" },
  revisar_texto: { texto: "Hola" },
  tokens: { formato: "css" },
  changelog: {},
  es_vigente: { que: "#0B3FA8" },
  responsables: {},
  reportar_hueco: { pedido: "un video vertical", falta: "no hay receta para video", decision: "usé la receta de redes" }
};

let ok = 0;
const bien = (s) => { ok++; console.log(`  ✓ ${s}`); };

for (const marca of MARCAS) {
  console.log(`\n${marca} (stdio)`);
  const c = clienteStdio(marca);
  const init = await c.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "prueba", version: "0" } });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.ok(init.result.instructions.includes("que_necesitas_hacer"));
  c.avisar("notifications/initialized");
  bien(`initialize → ${init.result.serverInfo.name}`);

  const { result: { tools } } = await c.pedir("tools/list");
  assert.deepEqual(tools.map((t) => t.name).sort(), Object.keys(llamadas).sort());
  for (const t of tools) {
    assert.equal(t.inputSchema.type, "object");
    for (const p of Object.values(t.inputSchema.properties)) if (p.enum) assert.ok(p.enum.length > 0, `${t.name}: enum vacío`);
  }
  bien(`tools/list → ${tools.length} tools`);

  for (const [name, args] of Object.entries(llamadas)) {
    const r = await c.pedir("tools/call", { name, arguments: args });
    assert.ok(!r.error, `${name}: ${JSON.stringify(r.error)}`);
    assert.ok(Array.isArray(r.result.content) && r.result.content.length, `${name}: sin contenido`);
    /* En una marca vacia algunas tools devuelven isError ("no hay icono"),
       que es lo correcto. Lo que no puede pasar es que el servidor explote. */
    if (marca === "profertil") assert.ok(!r.result.isError, `${name}: ${r.result.content[0].text}`);
  }
  bien("tools/call → todas responden");

  const mal = await c.pedir("tools/call", { name: "contraste", arguments: { fondo: "azul" } });
  assert.ok(mal.result.isError);
  const nada = await c.pedir("metodo/inexistente");
  assert.equal(nada.error.code, -32601);
  bien("errores → parámetro faltante y método desconocido");

  const { result: { resources } } = await c.pedir("resources/list");
  const leido = await c.pedir("resources/read", { uri: resources[0].uri });
  assert.equal(JSON.parse(leido.result.contents[0].text).id, marca);
  const pr = await c.pedir("prompts/get", { name: "pieza", arguments: { que: "un cartel" } });
  assert.ok(pr.result.messages[0].content.text.includes("un cartel"));
  bien("resources y prompts");

  if (marca === "profertil") {
    const t = async (name, args) => JSON.parse((await c.pedir("tools/call", { name, arguments: args })).result.content[0].text);
    /* Las combinaciones son las del manual (p. 46), no las de la maqueta. */
    assert.equal((await t("validar_combinacion", { colores: ["celeste", "azul"] })).nivel, "dupla");
    assert.equal((await t("validar_combinacion", { colores: ["verde", "amarillo", "azul"] })).nivel, "primaria");
    assert.equal((await t("validar_combinacion", { colores: ["amarillo", "azul"] })).aprobada, false);
    const fuera = await t("validar_combinacion", { colores: ["#0A40A0", "naranja"] });
    assert.equal(fuera.aprobada, false);
    assert.equal(fuera.fueraDePaleta[0].masCercano.id, "azul");
    assert.ok(fuera.sugerencias.length > 0);
    assert.equal((await t("que_necesitas_hacer", { pedido: "firma de mail" })).tarea.id, "firma");
    assert.equal((await t("que_necesitas_hacer", { pedido: "un newsletter para clientes" })).tarea.id, "newsletter");
    const agro = await t("buscar_iconos", { categoria: "Agro" });
    assert.ok(agro.total > 0 && agro.aviso);

    /* Texto sobre color: lo que permite el manual y lo que mide WCAG son cosas distintas. */
    const blancoAzul = await t("contraste", { fondo: "azul", texto: "blanco" });
    assert.equal(blancoAzul.manual.enManual, true);
    assert.equal(blancoAzul.manual.nivelManual, "AAA");
    const blancoAmarillo = await t("contraste", { fondo: "amarillo", texto: "blanco" });
    assert.equal(blancoAmarillo.manual.enManual, true);
    assert.equal(blancoAmarillo.textoNormal, "no alcanza");
    const azulVerde = await t("contraste", { fondo: "verde", texto: "azul" });
    assert.equal(azulVerde.manual.enManual, false);

    /* La voz del manual: jerga, tercera persona y pasivas. */
    const rev = await t("revisar_texto", { texto: "Profertil informa que la empresa implementó una optimización del proceso. El plan fue desarrollado con excelencia." });
    const encontrados = rev.hallazgos.map((h) => h.encontrado || h.termino);
    for (const x of ["Profertil informa", "la empresa", "optimización", "fue desarrollado", "excelencia", "implementar"]) assert.ok(encontrados.includes(x), x);
    const a = (await c.pedir("tools/call", { name: "generar_patron", arguments: { semilla: 7, ancho: 300 } })).result.structuredContent.svg;
    const b = (await c.pedir("tools/call", { name: "generar_patron", arguments: { semilla: 7, ancho: 300 } })).result.structuredContent.svg;
    assert.equal(a, b);
    assert.ok(a.startsWith("<svg") && a.includes("#003DA5"));
    bien("reglas del manual: paletas, hex fuera de paleta, recetas, íconos, texto sobre color, voz, patrón");

    const indice = await t("leer_kit", {});
    assert.equal(indice.indice[0].archivo, "LEEME.md");
    const receta = await t("que_necesitas_hacer", { pedido: "presentación" });
    for (const f of receta.tarea.leer) {
      const r = await c.pedir("tools/call", { name: "leer_kit", arguments: { seccion: f } });
      assert.ok(!r.result.isError && r.result.content[0].text.startsWith("#"), f);
    }
    const art = (await c.pedir("tools/call", { name: "leer_kit", arguments: { seccion: "direccion-de-arte.md" } })).result.content[0].text;
    assert.ok(art.includes("Por qué"));
    bien("kit: índice, secciones que pide la receta, reglas con su porqué");

    assert.equal((await t("es_vigente", { que: "azul" })).vigente, true);
    assert.equal((await t("es_vigente", { que: "DM Sans" })).vigente, true);
    const maqueta = await t("es_vigente", { que: "#0B3FA8" });
    assert.equal(maqueta.vigente, false);
    assert.equal(maqueta.reemplazo, "azul");
    assert.equal((await t("es_vigente", { que: "Rotis" })).verificar !== undefined, true);
    const ajeno = await t("es_vigente", { que: "#0A40A0" });
    assert.equal(ajeno.vigente, false);
    assert.equal(ajeno.reemplazo, "azul");
    assert.equal((await t("es_vigente", { que: "logo_2019_final.png" })).vigente, null);
    const hueco = await t("reportar_hueco", { pedido: "cartel en inglés", falta: "voz en inglés" });
    assert.equal(hueco.anotado, true);
    assert.equal(hueco.validarCon.quien, "Comunicaciones Integradas · Profertil");
    const leidos = JSON.parse((await c.pedir("resources/read", { uri: "marca://profertil/huecos.json" })).result.contents[0].text);
    assert.ok(leidos.some((h) => h.falta === "voz en inglés" && h.version === "1.1.4"));
    bien("vigencia, responsables y registro de huecos");
  }
  c.cerrar();
}

console.log("\nprofertil (http)");
const TOKEN = "prueba-token";
const PUERTO = 18787;
const h = spawn(process.execPath, [SERVIDOR, "--marca", "profertil", "--http", "--puerto", String(PUERTO)], {
  env: { ...process.env, MCP_TOKEN: TOKEN, URL_PUBLICA: `http://127.0.0.1:${PUERTO}/${TOKEN}` },
  stdio: ["ignore", "ignore", "pipe"]
});
await new Promise((ok) => h.stderr.once("data", ok));
const base = `http://127.0.0.1:${PUERTO}`;
const post = (url, cuerpo, headers = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(cuerpo) });

try {
  assert.equal((await post(`${base}/mcp`, { jsonrpc: "2.0", id: 1, method: "ping" })).status, 401);
  assert.equal((await post(`${base}/mcp`, { jsonrpc: "2.0", id: 1, method: "ping" }, { Authorization: `Bearer ${TOKEN}` })).status, 200);
  bien("token por header; sin token → 401");

  const r = await (await post(`${base}/${TOKEN}/mcp`, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "icono", arguments: { id: "casco" } } })).json();
  const link = r.result.structuredContent.descargar;
  assert.ok(link.startsWith(`${base}/${TOKEN}/icono/casco.svg`));
  const svg = await fetch(link);
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  assert.ok((await svg.text()).includes("<svg"));
  bien("token en la ruta y link descargable al SVG");

  assert.equal((await post(`${base}/${TOKEN}/mcp`, { jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  bien("notificación → 202");
} finally {
  h.kill();
}

/* Lo retirado, con una marca de juguete: Profertil todavia no tiene la
   lista cargada. */
const juguete = {
  id: "juguete", version: "2.0.0",
  colores: [{ id: "azul", nombre: "Azul", hex: "#0B3FA8" }],
  obsoleto: [
    { tipo: "color", nombre: "Azul 2015", valor: "#1A47B8", reemplazo: "azul", desde: "2.0.0", motivo: "Se unificó el azul." },
    { tipo: "logo", nombre: "Logo con bajada", alias: ["logo_2019"], reemplazo: "Logo sin bajada", desde: "2.0.0" },
    { tipo: "termino", nombre: "S.A.", alias: ["Sociedad Anónima"], reemplazo: "el nombre solo", desde: "2.0.0" }
  ],
  voz: {}
};
assert.equal(N.vigencia(juguete, "#1a47b8").reemplazo, "azul");
assert.equal(N.vigencia(juguete, "logo_2019_final.png").vigente, false);
assert.equal(N.revisarTexto(juguete, "Juguete S.A. presenta").hallazgos[0].tipo, "obsoleto");
bien("lo retirado: hex viejo, logo viejo por nombre de archivo, término en un texto");

fs.rmSync(REGISTRO, { recursive: true, force: true });
console.log(`\n${ok} chequeos ok`);
