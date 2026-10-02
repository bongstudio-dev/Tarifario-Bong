#!/usr/bin/env node
/* ==========================================================================
   Importa los SVG de las formas de una marca y reemplaza las que tenga
   cargadas en su marca.json.

     node framework/importar-formas.mjs profertil "/ruta/a/Entregables/Formas"
     node framework/importar-formas.mjs profertil carpeta --probar   # no escribe

   Toma los SVG tal como salen de Illustrator o de Figma. A cada uno le saca
   lo que no sirve para recolorear (fills, clases, estilos, metadatos) y se
   queda con el dibujo y su viewBox: el color lo pone el sistema al pedir la
   forma, como cualquier otra pieza de la marca.

   El id sale del nombre del archivo: "Forma_07_Espiga.svg" -> "espiga" si
   hay palabras, o "forma-07" si es solo un numero. Si un archivo trae mas
   de un color a proposito, el importador avisa y no lo aplana: esa forma se
   revisa a mano.
   ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function idDesdeArchivo(archivo) {
  const base = path.basename(archivo, path.extname(archivo))
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const palabras = base.split(/[^a-z0-9]+/).filter(Boolean)
    .filter((p) => !["forma", "formas", "shape", "profertil", "rgb", "cmyk", "svg", "final", "copia", "copy"].includes(p));
  const conLetras = palabras.filter((p) => /[a-z]/.test(p));
  if (conLetras.length) return conLetras.join("-");
  const numero = palabras.find((p) => /^\d+$/.test(p));
  return numero ? `forma-${numero.padStart(2, "0")}` : base.replace(/[^a-z0-9]+/g, "-");
}

/* Deja el SVG listo para recolorear. Devuelve el contenido interno, el
   viewBox y los colores que traia, para poder avisar si eran varios. */
export function limpiarSvg(texto) {
  const svg = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/i.exec(texto);
  if (!svg) throw new Error("no es un SVG");
  const attrs = svg[1];
  let cuerpo = svg[2];

  let viewBox = (/viewBox="([^"]+)"/i.exec(attrs) || [])[1];
  if (!viewBox) {
    const w = parseFloat((/\bwidth="([\d.]+)/i.exec(attrs) || [])[1]);
    const h = parseFloat((/\bheight="([\d.]+)/i.exec(attrs) || [])[1]);
    if (w && h) viewBox = `0 0 ${w} ${h}`;
  }

  /* Los colores que traia: atributos fill y reglas de <style> (Illustrator
     exporta .cls-1{fill:#...}). "none" no cuenta: es un hueco, no un color. */
  const colores = new Set();
  for (const m of texto.matchAll(/fill(?:=|:)\s*"?\s*(#[0-9a-f]{3,6}|rgb\([^)]*\)|[a-z]+)/gi)) {
    const c = m[1].toLowerCase();
    if (c !== "none" && c !== "currentcolor") colores.add(c);
  }

  cuerpo = cuerpo
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(title|desc|metadata|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<defs>\s*<\/defs>/gi, "")
    .replace(/\s(class|id|data-name)="[^"]*"/gi, "")
    .replace(/\sfill="(?!none")[^"]*"/gi, "")
    .replace(/\sstyle="[^"]*"/gi, (m) => {
      const resto = m.slice(8, -1).split(";").map((s) => s.trim()).filter((s) => s && !/^fill\s*:/i.test(s)).join(";");
      return resto ? ` style="${resto}"` : "";
    })
    .replace(/>\s+</g, "><")
    .trim();

  return { viewBox, svg: cuerpo, colores: [...colores] };
}

export function importar(marcaId, carpeta, { probar = false } = {}) {
  const rutaMarca = path.join(RAIZ, "marcas", marcaId, "marca.json");
  const marca = JSON.parse(fs.readFileSync(rutaMarca, "utf8"));
  const archivos = fs.readdirSync(carpeta).filter((f) => /\.svg$/i.test(f)).sort();
  if (!archivos.length) throw new Error(`No hay SVG en ${carpeta}.`);

  const anteriores = new Map((marca.formas?.items || []).map((f) => [f.id, f]));
  const items = [];
  const avisos = [];
  for (const archivo of archivos) {
    const id = idDesdeArchivo(archivo);
    const { viewBox, svg, colores } = limpiarSvg(fs.readFileSync(path.join(carpeta, archivo), "utf8"));
    if (!viewBox) avisos.push(`${archivo}: sin viewBox ni medidas, revisar`);
    if (colores.length > 1) avisos.push(`${archivo}: trae ${colores.length} colores (${colores.join(", ")}); al importarlo queda de un color, revisar si es a propósito`);
    if (items.some((x) => x.id === id)) avisos.push(`${archivo}: id repetido "${id}", renombrar el archivo`);
    const previo = anteriores.get(id);
    items.push({
      id,
      nombre: previo?.nombre || id.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      ...(viewBox && viewBox !== marca.formas?.viewBox ? { viewBox } : {}),
      svg,
      archivo
    });
  }

  if (!probar) {
    marca.formas = { ...marca.formas, items, reconstruccion: false };
    delete marca.formas.reconstruccion;
    marca.formas.nota = String(marca.formas.nota || "")
      .replace(/\s*Las de abajo son reconstrucciones provisorias[^.]*\.[^.]*\./, "")
      .trim();
    fs.writeFileSync(rutaMarca, JSON.stringify(marca, null, 2) + "\n");
  }
  return { importadas: items.length, ids: items.map((x) => x.id), avisos };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [marcaId, carpeta] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!marcaId || !carpeta) {
    console.error("Uso: node framework/importar-formas.mjs <marca> <carpeta-con-svg> [--probar]");
    process.exit(1);
  }
  try {
    const probar = process.argv.includes("--probar");
    const r = importar(marcaId, path.resolve(carpeta), { probar });
    console.log(`${probar ? "Se importarían" : "Importadas"} ${r.importadas} formas: ${r.ids.join(", ")}`);
    r.avisos.forEach((a) => console.log(`  aviso  ${a}`));
    if (!probar) console.log("Corré node framework/validar.mjs y node framework/prueba.mjs antes de subir.");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
