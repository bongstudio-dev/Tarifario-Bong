#!/usr/bin/env node
// Sube el sufijo ?v= de los assets en index.html y en los imports de app.js.
// Sin esto el navegador sigue sirviendo el CSS y el JS viejos y el cambio no
// llega a quien ya uso el cotizador.
//
//   node scripts/bump-version.mjs        sube uno
//   node scripts/bump-version.mjs 25     fija un numero

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "index.html",
  "app.js",
  "cuanto-cobrar-por-diseno/index.html"
].map((name) => path.join(root, name));
const pattern = /(\?v=)(\d+)/g;

const current = Math.max(
  0,
  ...files.flatMap((file) =>
    [...fs.readFileSync(file, "utf8").matchAll(pattern)].map((m) => Number(m[2]))
  )
);

const requested = process.argv[2];
const next = requested ? Number(requested) : current + 1;

if (!Number.isInteger(next) || next <= 0) {
  console.error(`Version invalida: ${requested}`);
  process.exit(1);
}

if (requested && next <= current) {
  console.error(`La version ${next} no supera a la actual (${current}).`);
  process.exit(1);
}

let total = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  let count = 0;
  const after = before.replace(pattern, (_, prefix) => {
    count++;
    return `${prefix}${next}`;
  });
  fs.writeFileSync(file, after);
  total += count;
  console.log(`${path.basename(file)}: ${count} referencias`);
}

console.log(`\nv${current} -> v${next} (${total} en total)`);
