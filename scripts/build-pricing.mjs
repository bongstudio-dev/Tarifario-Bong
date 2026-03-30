import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const rawPath = path.join(rootDir, "data", "tarifario-raw.json");
const pricingPath = path.join(rootDir, "data", "pricing.json");

const FALLBACK_BLUE = 1435;
const MARKET_FACTORS = { ar: 1, cl: 1.1, co: 0.8, mx: 1.2, br: 1, us: 2.5 };

function round(value) {
  return Math.round(value);
}

function levelMap(service) {
  const mid = service.clienteC;
  const senior = service.clienteB ?? round(mid * 1.75);
  const studio = service.clienteA ?? round(senior * 1.3);
  const junior = round(mid * 0.6);
  return { junior, mid, senior, studio };
}

function marketize(levels, ranges) {
  return Object.fromEntries(
    Object.entries(MARKET_FACTORS).map(([market, factor]) => [
      market,
      Object.fromEntries(
        Object.entries(levels).map(([level, baseArs]) => {
          const adjustedArs = round(baseArs * factor);
          return [
            level,
            {
              base_ars: adjustedArs,
              base_usd: round(adjustedArs / FALLBACK_BLUE),
              multiplier_range: ranges[level] ?? ranges.default
            }
          ];
        })
      )
    ])
  );
}

function findService(data, name) {
  for (const category of data.categories) {
    for (const subcategory of category.subcategories) {
      const service = subcategory.services.find((entry) => entry.name === name);
      if (service) {
        return service;
      }
    }
  }

  throw new Error(`No se encontro el servicio ${name}`);
}

async function main() {
  const raw = JSON.parse(await fs.readFile(rawPath, "utf8"));

  const brandSystem = levelMap(findService(raw, "Identidad corporativa"));
  const naming = levelMap(findService(raw, "Naming"));
  const manual = levelMap(findService(raw, "Diseño de Marca Básico"));
  manual.senior = findService(raw, "Diseño de Marca").clienteC;
  manual.studio = findService(raw, "Diseño de Marca").clienteB;
  const redesign = levelMap(findService(raw, "Rediseño de una identidad"));
  const packaging = levelMap(findService(raw, "Diseño de envase mediana complejidad"));
  const web = levelMap(findService(raw, "Diseño y maquetación de sitio responsivo/adaptativo"));

  const pricing = {
    version: "1.0",
    generated_at: new Date().toISOString().slice(0, 10),
    source: raw.source,
    source_updated_at: raw.source_updated_at,
    dolar_blue_ref: FALLBACK_BLUE,
    projects: {
      "brand-system": {
        label: "Brand System",
        description: "Identidad corporativa con aplicaciones básicas y guía de uso.",
        markets: marketize(brandSystem, { default: [0.75, 1.35], senior: [0.8, 1.42], studio: [0.82, 1.5] })
      },
      "naming": {
        label: "Naming",
        description: "Proceso de definición de nombre de marca.",
        markets: marketize(naming, { default: [0.75, 1.32], senior: [0.8, 1.38], studio: [0.82, 1.45] })
      },
      "manual": {
        label: "Manual de marca",
        description: "Manual normativo básico para una marca.",
        markets: marketize(manual, { default: [0.75, 1.3], senior: [0.8, 1.35], studio: [0.82, 1.42] })
      },
      "redesign": {
        label: "Rediseño",
        description: "Rediseño de una identidad existente.",
        markets: marketize(redesign, { default: [0.75, 1.34], senior: [0.8, 1.4], studio: [0.82, 1.48] })
      },
      "packaging": {
        label: "Packaging",
        description: "Diseño de envase de complejidad media.",
        markets: marketize(packaging, { default: [0.75, 1.36], senior: [0.8, 1.43], studio: [0.82, 1.52] })
      },
      "web": {
        label: "Web design",
        description: "Diseño y maquetación de sitio responsivo hasta 5 secciones.",
        markets: marketize(web, { default: [0.75, 1.38], senior: [0.8, 1.45], studio: [0.82, 1.54] })
      }
    },
    multipliers: {
      complexity: { "1": 0.6, "2": 0.8, "3": 1, "4": 1.3, "5": 1.7 },
      deliverables: { manual: 0.3, stationery: 0.18, social: 0.18, packaging: 0.35, web: 0.5 },
      revisions: { "1": 0, "2": 0.05, "3": 0.12, "4": 0.2, "5": 0.3 },
      phase_split: { diagnostico: 0.15, estrategia: 0.2, diseno: 0.4, produccion: 0.25 }
    }
  };

  await fs.writeFile(pricingPath, JSON.stringify(pricing, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
