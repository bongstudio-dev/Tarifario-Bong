#!/usr/bin/env node
/* ==========================================================================
   Valida las marcas de marcas/. Correlo antes de publicar un cambio en un
   marca.json o al dar de alta una marca nueva.

     node framework/validar.mjs              # todas
     node framework/validar.mjs eyd          # una
     node framework/validar.mjs --detalle    # con la lista de pendientes

   Un error (una referencia rota, un hex mal escrito, un id repetido) corta
   con codigo 1. Un pendiente no: es un dato que todavia no tenemos, y la
   marca puede salir igual mientras el MCP lo diga.
   ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as N from "./nucleo.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const detalle = args.includes("--detalle");
const pedidas = args.filter((a) => !a.startsWith("--"));

const dirs = fs.readdirSync(path.join(RAIZ, "marcas"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name)
  .filter((n) => !pedidas.length || pedidas.includes(n));

function revisar(id, marca) {
  const errores = [];
  const e = (s) => errores.push(s);
  const lista = Array.isArray;

  if (marca.id !== id) e(`el id "${marca.id}" no coincide con la carpeta "${id}"`);
  if (typeof marca.nombre !== "string" || !marca.nombre) e("falta nombre");
  if (!/^\d+\.\d+\.\d+$/.test(marca.version || "")) e(`version "${marca.version}" no es semver`);

  const colores = N.arr(marca.colores);
  const ids = new Set();
  for (const c of colores) {
    if (!c.id) e(`color sin id: ${JSON.stringify(c)}`);
    if (ids.has(c.id)) e(`color repetido: ${c.id}`);
    ids.add(c.id);
    if (!N.hexNormal(c.hex)) e(`color ${c.id}: hex inválido "${c.hex}"`);
  }
  const existe = (ref, donde) => { if (!ids.has(ref)) e(`${donde}: el color "${ref}" no está en colores`); };

  const pal = marca.paleta || {};
  N.arr(pal.principales).forEach((r) => existe(r, "paleta.principales"));
  N.arr(pal.duplas).forEach((d, i) => { if (!lista(d) || d.length !== 2) e(`paleta.duplas[${i}] no es un par`); N.arr(d).forEach((r) => existe(r, `paleta.duplas[${i}]`)); });
  N.arr(pal.terciarias).forEach((d, i) => { if (!lista(d) || d.length !== 3) e(`paleta.terciarias[${i}] no es un trío`); N.arr(d).forEach((r) => existe(r, `paleta.terciarias[${i}]`)); });

  if (marca.patron && !N.esPendiente(marca.patron)) {
    N.arr(marca.patron.paletas).forEach((p) => {
      existe(p.fondo, `patron.paletas.${p.id}.fondo`);
      N.arr(p.formas).forEach((r) => existe(r, `patron.paletas.${p.id}.formas`));
    });
    N.arr(marca.patron.piezas).forEach((p) => { if (!/^M/i.test(p.d || "")) e(`patron.piezas.${p.id}: path vacío o inválido`); });
  }

  const cats = new Set();
  N.arr(marca.iconos?.categorias).forEach((c) => { cats.add(c.id); existe(c.color, `iconos.categorias.${c.id}`); });
  const iconos = new Set();
  N.arr(marca.iconos?.items).forEach((i) => {
    if (iconos.has(i.id)) e(`ícono repetido: ${i.id}`);
    iconos.add(i.id);
    if (!cats.has(i.categoria)) e(`ícono ${i.id}: categoría "${i.categoria}" no declarada`);
    if (!i.svg) e(`ícono ${i.id}: sin svg`);
  });

  const formas = new Set();
  N.arr(marca.formas?.items).forEach((f) => {
    if (formas.has(f.id)) e(`forma repetida: ${f.id}`);
    formas.add(f.id);
    if (!f.svg) e(`forma ${f.id}: sin svg`);
  });

  /* Las herramientas que nombra una receta tienen que existir en el MCP. */
  const tools = new Set(["marca", "que_necesitas_hacer", "colores", "validar_combinacion", "contraste", "buscar_iconos", "icono", "forma", "formas", "generar_patron", "tipografia", "reglas_logo", "glosario", "revisar_texto", "tokens", "changelog"]);
  N.arr(marca.tareas).forEach((t) => N.arr(t.herramientas).forEach((h) => { if (!tools.has(h)) e(`tarea ${t.id}: herramienta "${h}" no existe`); }));

  /* Contraste: avisa, no corta. Una dupla puede ser decorativa. */
  const avisos = [];
  N.arr(pal.duplas).forEach((d) => {
    if (d.every((r) => ids.has(r))) {
      const [a, b] = d.map((r) => N.resolverColor(marca, r).hex);
      const c = N.contraste(a, b);
      if (c.textoGrande === "no alcanza") avisos.push(`dupla ${d.join("+")}: contraste ${c.ratio}, no sirve para texto sobre fondo`);
    }
  });

  return { errores, avisos, pendientes: N.pendientes(marca) };
}

let fallas = 0;
for (const id of dirs) {
  let marca;
  try {
    marca = JSON.parse(fs.readFileSync(path.join(RAIZ, "marcas", id, "marca.json"), "utf8"));
  } catch (err) {
    console.log(`✗ ${id}: no se pudo leer marca.json (${err.message})`);
    fallas++;
    continue;
  }
  const r = revisar(id, marca);
  const estado = r.errores.length ? "✗" : "✓";
  console.log(`${estado} ${marca.nombre || id} v${marca.version} — ${r.errores.length} errores, ${r.avisos.length} avisos, ${r.pendientes.length} pendientes`);
  r.errores.forEach((x) => console.log(`    error   ${x}`));
  r.avisos.forEach((x) => console.log(`    aviso   ${x}`));
  if (detalle) r.pendientes.forEach((p) => console.log(`    falta   ${p.ruta}: ${p.falta}`));
  if (r.errores.length) fallas++;
}
if (!dirs.length) console.log("No hay marcas para validar.");
process.exit(fallas ? 1 : 0);
