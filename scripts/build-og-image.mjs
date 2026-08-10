#!/usr/bin/env node
// Renderiza scripts/og-template.html a assets/img/og-cotizador.png en 1200x630,
// que es la imagen que se ve al compartir el link.
//
//   node scripts/build-og-image.mjs
//
// Usa el Chrome instalado en modo headless para que salga con las fuentes
// reales del proyecto en vez de una sustitucion.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = path.join(root, "scripts", "og-template.html");
const output = path.join(root, "assets", "img", "og-cotizador.png");

const candidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
];

const chrome = candidates.find((candidate) => fs.existsSync(candidate));
if (!chrome) {
  console.error("No encontre Chrome. Buscado en:\n  " + candidates.join("\n  "));
  process.exit(1);
}

fs.mkdirSync(path.dirname(output), { recursive: true });

// La plantilla pide las fuentes por red, asi que esto necesita conexion.
execFileSync(chrome, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--window-size=1200,630",
  `--screenshot=${output}`,
  `file://${template}`
], { stdio: "ignore" });

if (!fs.existsSync(output)) {
  console.error("Chrome no genero la imagen.");
  process.exit(1);
}

const kb = (fs.statSync(output).size / 1024).toFixed(0);
console.log(`assets/img/og-cotizador.png generada (1200x630, ${kb} KB)`);
console.log("Acordate de subir el ?v= si la reemplazaste: node scripts/bump-version.mjs");
