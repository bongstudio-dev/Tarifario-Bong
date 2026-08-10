#!/usr/bin/env node
// Chequea el modelo de precios contra la tabla ancla y contra las invariantes
// estructurales, sobre todo el espacio de configuracion. Correr despues de
// tocar pricing.json o benchmark.json:
//
//   node scripts/check-benchmark.mjs
//
// OJO: este archivo replica la formula de app.js (getBasePhaseHours +
// calculateQuote + evaluateBenchmark). Si cambia una, hay que cambiar la otra.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const pricing = JSON.parse(fs.readFileSync(path.join(dataDir, "pricing.json"), "utf8"));
const benchmark = JSON.parse(fs.readFileSync(path.join(dataDir, "benchmark.json"), "utf8"));

const { X_a, X_b, X_c, Y } = pricing.config;
const REVISION_DISTRIBUTION = { design: 0.6, production: 0.4 };
const TOLERANCE = 0.1; // 10% contra la tabla ancla

const readyTracks = benchmark.tracks.filter((track) => track.status === "ready");

const midCoef = pricing.expertise.find((e) => e.id === "mid").coef;

// La banda se lee como referencia de perfil Mid y se corre por perfil con la
// escalera de la tabla ancla. Espejo de getProfileRateCoef() en app.js.
function blendedBand(category, expertise) {
  const bands = readyTracks.map((track) => ({
    weight: track.weight,
    band: track.by_category[category] || track.defaults
  }));
  const total = bands.reduce((sum, entry) => sum + entry.weight, 0);
  const k = expertise.coef / midCoef;
  const blend = (key) =>
    (bands.reduce((sum, entry) => sum + entry.band[key] * entry.weight, 0) / total) * k;
  return { p25: blend("p25"), median: blend("median"), p90: blend("p90") };
}

function quote(service, expertise, complexity, output, market, revision, tier) {
  const tierHours = tier.hours_coef;
  const base = {
    a: service.H_a * tierHours,
    b: service.H_b * tierHours,
    c: service.H_c * tierHours
  };
  const extra = (base.b + base.c) * revision.extra_hours_coef;
  const hours = {
    a: base.a,
    b: base.b + extra * REVISION_DISTRIBUTION.design,
    c: base.c + extra * REVISION_DISTRIBUTION.production
  };
  const multiplier =
    expertise.coef * complexity.coef * output.coef * market.coef * Y * tier.rate_coef;
  const totalHours = hours.a + hours.b + hours.c;
  const usd = (hours.a * X_a + hours.b * X_b + hours.c * X_c) * multiplier;

  // El precio manda; las horas son el presupuesto que lo deja a tarifa de
  // mercado. Mas horas trabajadas = tarifa mas baja, por eso max sale del p25.
  const band = blendedBand(service.category, expertise);
  const comparable = usd / (market.coef * tier.rate_coef);
  const budget = {
    min: comparable / band.p90,
    target: comparable / band.median,
    max: comparable / band.p25
  };

  return { usd, shapeHours: totalHours, budget };
}

const byId = (list, id) => list.find((item) => item.id === id);
const outputsFor = (service) =>
  pricing.output_types.filter((o) => service.allowed_output_types.includes(o.id));

let failed = false;

// --- 1. Tabla ancla -------------------------------------------------------
const anchor = pricing.anchor;
const anchorService = byId(pricing.services, anchor.service);
const anchorComplexity = byId(pricing.complexity, "mid");
const anchorOutput = byId(pricing.output_types, "static");
const anchorMarket = byId(pricing.markets, "latam");
const anchorRevision = byId(pricing.revisions, "2");

console.log(`ANCLA: ${anchorService.name} · ${anchor.conditions}\n`);
console.log("tier".padEnd(16) + ["jr", "mid", "sr", "std"].map((p) => p.padStart(11)).join(""));

let worstDeviation = 0;
for (const [tierId, targets] of Object.entries(anchor.targets)) {
  const tier = byId(pricing.brand_tiers, tierId);
  if (!tier) {
    console.error(`  FALLA: el tier "${tierId}" de la tabla ancla no existe en brand_tiers.`);
    failed = true;
    continue;
  }
  const cells = [];
  const deviations = [];
  for (const profile of ["jr", "mid", "sr", "std"]) {
    const result = quote(
      anchorService,
      byId(pricing.expertise, profile),
      anchorComplexity,
      anchorOutput,
      anchorMarket,
      anchorRevision,
      tier
    );
    const deviation = result.usd / targets[profile] - 1;
    worstDeviation = Math.max(worstDeviation, Math.abs(deviation));
    if (Math.abs(deviation) > TOLERANCE) failed = true;
    cells.push(Math.round(result.usd).toString().padStart(11));
    deviations.push(`${deviation >= 0 ? "+" : ""}${(deviation * 100).toFixed(1)}%`.padStart(11));
  }
  console.log(tier.label.padEnd(16) + cells.join(""));
  console.log("objetivo".padEnd(16) + ["jr", "mid", "sr", "std"].map((p) => String(targets[p]).padStart(11)).join(""));
  console.log("desvio".padEnd(16) + deviations.join("") + "\n");
}
console.log(
  `Desvio maximo contra la tabla: ${(worstDeviation * 100).toFixed(1)}% (tolerancia ${TOLERANCE * 100}%)\n`
);

// --- 2. Invariantes -------------------------------------------------------
const violations = [];
const budgetIssues = [];
let evaluated = 0;
let targetSum = 0;

function sweep(axis, values, build) {
  let previous = null;
  for (const value of values) {
    const result = build(value);
    if (previous && result.usd < previous.usd - 1e-6) {
      violations.push(
        `${axis}: ${previous.label} -> ${value.id} baja de ${previous.usd.toFixed(0)} a ${result.usd.toFixed(0)} USD`
      );
    }
    previous = { usd: result.usd, label: value.id };
  }
}

const marketsAscending = [...pricing.markets].sort((a, b) => a.coef - b.coef);
const tiersAscending = [...pricing.brand_tiers].sort(
  (a, b) => a.hours_coef * a.rate_coef - b.hours_coef * b.rate_coef
);

for (const service of pricing.services) {
  const outputs = outputsFor(service);
  for (const expertise of pricing.expertise) {
    for (const market of pricing.markets) {
      for (const tier of pricing.brand_tiers) {
        for (const output of outputs) {
          for (const revision of pricing.revisions) {
            sweep("complejidad", pricing.complexity, (complexity) => {
              const result = quote(service, expertise, complexity, output, market, revision, tier);
              evaluated++;
              targetSum += result.budget.target;
              // El presupuesto no debe depender del perfil: mismo proyecto,
              // mismo tiempo; lo que cambia es cuanto se cobra.
              const reference = quote(
                service,
                pricing.expertise.find((e) => e.id === "mid"),
                complexity,
                output,
                market,
                revision,
                tier
              );
              if (Math.abs(result.budget.target / reference.budget.target - 1) > 0.02) {
                budgetIssues.push(
                  `${service.id} ${expertise.id}/${tier.id}: objetivo ${result.budget.target.toFixed(1)}h vs mid ${reference.budget.target.toFixed(1)}h`
                );
              }
              return result;
            });
          }
        }
        for (const complexity of pricing.complexity) {
          for (const output of outputs) {
            sweep("revisiones", pricing.revisions, (revision) =>
              quote(service, expertise, complexity, output, market, revision, tier)
            );
          }
          for (const revision of pricing.revisions) {
            sweep("output", outputs, (output) =>
              quote(service, expertise, complexity, output, market, revision, tier)
            );
          }
        }
      }
    }
    for (const complexity of pricing.complexity) {
      for (const output of outputs) {
        for (const revision of pricing.revisions) {
          sweep("mercado", marketsAscending, (market) =>
            quote(service, expertise, complexity, output, market, revision, pricing.brand_tiers[0])
          );
          sweep("tipo de cliente", tiersAscending, (tier) =>
            quote(service, expertise, complexity, output, pricing.markets[0], revision, tier)
          );
        }
      }
    }
  }
  for (const complexity of pricing.complexity) {
    for (const output of outputs) {
      for (const revision of pricing.revisions) {
        sweep("perfil", pricing.expertise, (expertise) =>
          quote(
            service,
            expertise,
            complexity,
            output,
            pricing.markets[0],
            revision,
            pricing.brand_tiers[0]
          )
        );
      }
    }
  }
}

console.log(`Combinaciones evaluadas: ${evaluated}`);
console.log(`Objetivo de horas promedio: ${(targetSum / evaluated).toFixed(1)}h`);
console.log(`Pistas con datos: ${readyTracks.map((t) => t.label).join(", ")}\n`);

// Presupuesto de horas del ancla, que es el numero que mira el usuario.
console.log("PRESUPUESTO DE HORAS — " + anchorService.name);
for (const tierId of Object.keys(anchor.targets)) {
  const tier = byId(pricing.brand_tiers, tierId);
  if (!tier) continue;
  const r = quote(
    anchorService,
    byId(pricing.expertise, "mid"),
    anchorComplexity,
    anchorOutput,
    anchorMarket,
    anchorRevision,
    tier
  );
  console.log(
    `  ${tier.label.padEnd(16)} ${r.budget.min.toFixed(0).padStart(4)}h a ${r.budget.max.toFixed(0).padStart(4)}h   objetivo ${r.budget.target.toFixed(0).padStart(4)}h`
  );
}
console.log("");

if (budgetIssues.length > 0) {
  console.error(`FALLA: el presupuesto de horas cambia con el perfil (${budgetIssues.length} casos).`);
  budgetIssues.slice(0, 5).forEach((line) => console.error(`  ${line}`));
  failed = true;
} else {
  console.log("OK: el presupuesto de horas no depende del perfil.");
}

if (violations.length > 0) {
  console.error(`FALLA: ${violations.length} violaciones de monotonia.`);
  violations.slice(0, 10).forEach((line) => console.error(`  ${line}`));
  failed = true;
} else {
  console.log("OK: subir cualquier eje nunca baja el precio.");
}

if (failed) {
  console.error("\nHay fallas. Revisar arriba.");
} else {
  console.log("OK: el modelo reproduce la tabla ancla dentro de tolerancia.");
}

process.exit(failed ? 1 : 0);
