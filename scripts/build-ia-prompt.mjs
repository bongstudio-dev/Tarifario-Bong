#!/usr/bin/env node
// Arma el prompt con el que se pide la referencia de la IA
// (data/ia-reference.json). Solo usa nombres y descripciones de pricing.json:
// ni horas, ni coeficientes, ni la tabla ancla. Si la IA viera los numeros del
// modelo, la referencia saldria parecida al cotizador y el test no mediria nada.
//
//   node scripts/build-ia-prompt.mjs > scripts/ia-reference-prompt.md

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCases } from "./lib/ia-cases.mjs";

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const pricing = JSON.parse(fs.readFileSync(path.join(dataDir, "pricing.json"), "utf8"));

const byId = (list, id) => list.find((item) => item.id === id);
const addonLabel = (id) => byId(pricing.addons, id)?.label ?? id;

// Definiciones de los ejes que no estan escritas en pricing.json.
const PROFILES = {
  jr: "Junior: diseñador/a freelance con 0 a 2 años de experiencia, portfolio corto.",
  mid: "Mid: diseñador/a freelance con 3 a 6 años de experiencia y portfolio sólido.",
  sr: "Senior: diseñador/a independiente con 7 años o más, dirige proyectos de punta a punta.",
  std: "Estudio: estudio de diseño con equipo y dirección creativa."
};
const MARKETS = {
  latam: "LATAM: cliente latinoamericano en general (no solo Argentina) que paga en su moneda local.",
  usa: "USA: cliente de Estados Unidos que paga en dólares.",
  europa: "Europa: cliente europeo que paga en euros."
};
const COMPLEXITY = {
  low: "Baja: brief claro, pocas decisiones, referencias cerradas.",
  mid: "Media: el caso típico, con algo de exploración.",
  high: "Alta: brief abierto, mucha exploración o varios interlocutores."
};
const OUTPUTS = {
  static: "Estático",
  motion: "Motion: la pieza se entrega animada.",
  interactive: "Interactivo / 3D"
};

const cases = buildCases(pricing);

const describe = (c) => {
  const service = byId(pricing.services, c.service);
  return [
    service.name,
    byId(pricing.expertise, c.expertise).label,
    byId(pricing.brand_tiers, c.tier).label,
    byId(pricing.markets, c.market).label,
    `complejidad ${byId(pricing.complexity, c.complexity).label}`,
    byId(pricing.revisions, c.revision).label,
    byId(pricing.output_types, c.output).label
  ].join(" · ");
};

const lines = [];
lines.push(`# Referencia de precios de diseño: criterio propio

Sos consultor/a de precios para diseño gráfico y de marca. Necesito tu criterio
propio sobre cuánto se cobra hoy cada trabajo. No hay números de referencia en
este pedido a propósito: queremos tu estimación independiente.

## Reglas

- Precio total del proyecto, en **USD**, sin impuestos.
- En LATAM el cliente paga en moneda local: pensá el precio que realmente se
  cobra en la región en moneda local y pasalo a USD al tipo de cambio de mercado.
  No lo pienses como un contrato en moneda dura.
- Para cada caso: \`min\`, \`tipico\` y \`max\` (rango donde cae la mayoría de
  los presupuestos reales para ese perfil y ese cliente, no los extremos) y
  \`horas\`: horas de trabajo reales que le lleva a ese perfil.
- \`nota\` opcional, una línea, solo si algo del caso te parece raro.
- Sé consistente entre casos: si dos casos solo difieren en un eje, la
  diferencia de precio tiene que reflejar solo ese eje.

## Qué significa cada eje

### Servicios
`);
for (const service of pricing.services) {
  const included = service.included_addons.map(addonLabel);
  lines.push(
    `- **${service.name}** (${service.category}): ${service.caption}` +
      (included.length ? ` Incluye: ${included.join(", ")}.` : "")
  );
}
lines.push("\n### Perfil de quien hace el trabajo\n");
for (const e of pricing.expertise) lines.push(`- ${PROFILES[e.id]}`);
lines.push("\n### Tipo de cliente\n");
for (const t of pricing.brand_tiers) lines.push(`- ${t.label}: ${t.caption}`);
lines.push(
  "\nEstas descripciones son el alcance de un proyecto de branding. En los demás servicios usá tu criterio sobre si el tipo de cliente cambia el precio y cuánto."
);
lines.push("\n### Mercado\n");
for (const m of pricing.markets) lines.push(`- ${MARKETS[m.id]}`);
lines.push("\n### Complejidad\n");
for (const c of pricing.complexity) lines.push(`- ${COMPLEXITY[c.id]}`);
lines.push("\n### Rondas de revisión\n");
lines.push(`- ${pricing.revisions.map((r) => r.label).join(", ")}. El caso típico son 2 rondas.`);
lines.push("\n### Salida\n");
for (const o of pricing.output_types) lines.push(`- ${OUTPUTS[o.id]}`);
lines.push(`
## Casos (${cases.length})

Cada línea es \`id\` → descripción. Usá el \`id\` tal cual como clave.
`);
for (const c of cases) lines.push(`- \`${c.id}\` → ${describe(c)}`);
lines.push(`
## Formato de respuesta

Un JSON válido y nada más:

\`\`\`json
{
  "criterios": "3 a 6 líneas: de dónde sacás los niveles y cómo pensaste cada eje",
  "casos": {
    "<id>": { "min": 0, "tipico": 0, "max": 0, "horas": 0, "nota": "" }
  }
}
\`\`\`
`);

process.stdout.write(lines.join("\n"));
