#!/usr/bin/env node
// Compara el cotizador contra el criterio de la IA (data/ia-reference.json).
// Correr despues de tocar pricing.json:
//
//   node scripts/check-ia.mjs            reporte, no falla
//   node scripts/check-ia.mjs --strict   falla si algun caso queda fuera de rango
//   node scripts/check-ia.mjs --md       mismas tablas en markdown (para un PR)
//
// La referencia no es dato de mercado: es lo que opina la IA sin haber visto
// el modelo. Lo util es el diagnostico por eje, que separa nivel (cuanto sale
// cada servicio) de forma (cuanto multiplica cada eje) y dice que coeficiente
// mirar. Para regenerarla: node scripts/build-ia-prompt.mjs y pedirle a la IA,
// en un contexto que no vea pricing.json, el JSON que describe el prompt.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQuoter } from "./lib/quote.mjs";
import { BASE, buildCases, caseId } from "./lib/ia-cases.mjs";

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
const pricing = read("pricing.json");
const benchmark = read("benchmark.json");
const reference = read("ia-reference.json");

const strict = process.argv.includes("--strict");
const md = process.argv.includes("--md");

const { quote } = createQuoter(pricing, benchmark);
const byId = (list, id) => list.find((item) => item.id === id);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const pct = (x) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const x2 = (x) => `×${x.toFixed(2).replace(".", ",")}`;

function table(headers, rows, align) {
  if (md) {
    const sep = align.map((a) => (a === "r" ? "---:" : "---"));
    return [headers, sep, ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");
  }
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) =>
    r.map((cell, i) => (align[i] === "r" ? String(cell).padStart(widths[i]) : String(cell).padEnd(widths[i]))).join("  ");
  return [fmt(headers), ...rows.map(fmt)].join("\n");
}
const title = (text) => console.log(md ? `\n### ${text}\n` : `\n${text}\n${"-".repeat(text.length)}`);

// --- Casos -----------------------------------------------------------------
const cases = buildCases(pricing);
const missing = cases.filter((c) => !reference.casos[c.id]);
if (missing.length > 0) {
  console.error(
    `La referencia no cubre ${missing.length} casos (cambiaron servicios u opciones). ` +
      "Regenerar data/ia-reference.json con scripts/build-ia-prompt.mjs."
  );
  missing.slice(0, 5).forEach((c) => console.error(`  ${c.id}`));
  process.exit(1);
}

function evaluate(c) {
  const service = byId(pricing.services, c.service);
  const result = quote(
    service,
    byId(pricing.expertise, c.expertise),
    byId(pricing.complexity, c.complexity),
    byId(pricing.output_types, c.output),
    byId(pricing.markets, c.market),
    byId(pricing.revisions, c.revision),
    byId(pricing.brand_tiers, c.tier)
  );
  const ia = reference.casos[c.id];
  const status = result.usd < ia.min ? "abajo" : result.usd > ia.max ? "arriba" : "ok";
  return { ...c, service, usd: result.usd, hours: result.budget.target, ia, status, ratio: result.usd / ia.tipico };
}
const results = cases.map(evaluate);
const find = (overrides) => {
  const base = { ...BASE, ...overrides };
  if (!base.output) base.output = byId(pricing.services, base.service).default_output_type;
  return results.find((r) => r.id === caseId(base));
};

// --- 1. Nivel por servicio (el caso base de cada uno) ------------------------
title("NIVEL — Mid · Emprendimiento · LATAM · Media · 2 rondas (USD)");
console.log(
  table(
    ["Servicio", "Modelo", "IA min", "IA tipico", "IA max", "Desvio", "Estado", "Horas modelo", "Horas IA"],
    pricing.services.map((service) => {
      const r = find({ service: service.id });
      return [
        service.name,
        Math.round(r.usd),
        r.ia.min,
        r.ia.tipico,
        r.ia.max,
        pct(r.ratio - 1),
        r.status,
        r.hours.toFixed(1),
        r.ia.horas
      ];
    }),
    ["l", "r", "r", "r", "r", "r", "l", "r", "r"]
  )
);
console.log(
  md
    ? "\nHoras modelo = presupuesto de horas (precio / tarifa de mercado). Horas IA = trabajo real estimado para un Mid."
    : "\n  Horas modelo = presupuesto (precio / tarifa de mercado). Horas IA = trabajo real estimado para un Mid."
);

// --- 2. Forma: cuanto multiplica cada eje ------------------------------------
// Para cada eje se compara el salto del modelo contra el de la IA, respecto
// del nivel base, y se agrupa por categoria: los coeficientes del modelo son
// por eje (y el tipo de cliente, por categoria), asi que ahi se ajustan.
const AXES = [
  { key: "expertise", label: "Perfil", list: pricing.expertise, base: BASE.expertise },
  { key: "tier", label: "Tipo de cliente", list: pricing.brand_tiers, base: BASE.tier },
  { key: "market", label: "Mercado", list: pricing.markets, base: BASE.market },
  { key: "complexity", label: "Complejidad", list: pricing.complexity, base: BASE.complexity },
  { key: "revision", label: "Rondas", list: pricing.revisions, base: BASE.revision },
  { key: "output", label: "Salida", list: pricing.output_types, base: null }
];
const categories = [...new Set(pricing.services.map((s) => s.category))];

title("FORMA — salto de cada eje respecto del base (mediana por categoria)");
const shapeRows = [];
for (const axis of AXES) {
  for (const level of axis.list) {
    for (const category of categories) {
      const pairs = [];
      for (const service of pricing.services.filter((s) => s.category === category)) {
        const baseLevel = axis.base ?? service.default_output_type;
        if (level.id === baseLevel) continue;
        const from = find({ service: service.id, [axis.key]: baseLevel });
        const to = find({ service: service.id, [axis.key]: level.id });
        if (!from || !to) continue;
        pairs.push({ model: to.usd / from.usd, ia: to.ia.tipico / from.ia.tipico });
      }
      if (pairs.length === 0) continue;
      const model = median(pairs.map((p) => p.model));
      const ia = median(pairs.map((p) => p.ia));
      const gap = model / ia - 1;
      shapeRows.push([
        axis.label,
        level.label,
        category,
        pairs.length,
        x2(model),
        x2(ia),
        pct(gap),
        Math.abs(gap) > 0.25 ? "revisar" : ""
      ]);
    }
  }
}
console.log(
  table(
    ["Eje", "Nivel", "Categoria", "n", "Modelo", "IA", "Brecha", ""],
    shapeRows,
    ["l", "l", "l", "r", "r", "r", "r", "l"]
  )
);

// --- 3. Todos los casos fuera de rango ---------------------------------------
const outside = results.filter((r) => r.status !== "ok").sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
const describe = (r) =>
  [
    r.service.name,
    byId(pricing.expertise, r.expertise).label,
    byId(pricing.brand_tiers, r.tier).label,
    byId(pricing.markets, r.market).label,
    r.complexity !== BASE.complexity ? `complejidad ${byId(pricing.complexity, r.complexity).label}` : null,
    r.revision !== BASE.revision ? byId(pricing.revisions, r.revision).label : null,
    r.output !== r.service.default_output_type ? byId(pricing.output_types, r.output).label : null
  ]
    .filter(Boolean)
    .join(" · ");

title(`FUERA DE RANGO — ${outside.length} de ${results.length} casos, del mas lejos al mas cerca`);
if (outside.length > 0) {
  console.log(
    table(
      ["Caso", "Modelo", "IA min–max", "IA tipico", "Desvio"],
      outside.map((r) => [describe(r), Math.round(r.usd), `${r.ia.min}–${r.ia.max}`, r.ia.tipico, pct(r.ratio - 1)]),
      ["l", "r", "r", "r", "r"]
    )
  );
}

// --- Resumen -----------------------------------------------------------------
const inside = results.length - outside.length;
const below = outside.filter((r) => r.status === "abajo").length;
title("RESUMEN");
console.log(`Dentro del rango de la IA: ${inside} de ${results.length} (${Math.round((inside / results.length) * 100)}%)`);
console.log(`Abajo: ${below} · Arriba: ${outside.length - below}`);
console.log(`Modelo / IA tipico, mediana: ${x2(median(results.map((r) => r.ratio)))}`);
console.log(`Referencia: ${reference.generated_at} · ${reference.method}`);

if (strict && outside.length > 0) {
  console.error(`\n--strict: ${outside.length} casos fuera del rango de la IA.`);
  process.exit(1);
}
