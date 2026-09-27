// Casos que se comparan contra el criterio de la IA. Se mueve un eje por vez
// desde los defaults (complejidad Media, 2 rondas, output default, sin extras)
// y se suman las esquinas caras. La grilla completa son miles de casos: con
// esto alcanza para ver nivel (cuanto sale cada servicio) y forma (cuanto
// multiplica cada eje).
//
// Lo usan scripts/build-ia-prompt.mjs (para pedir la referencia) y
// scripts/check-ia.mjs (para comparar). Si cambia la lista, hay que regenerar
// data/ia-reference.json.

export const BASE = {
  expertise: "mid",
  tier: "emprendimiento",
  market: "latam",
  complexity: "mid",
  revision: "2"
};

// Servicios testigo para los ejes chicos: uno por categoria.
const WITNESSES = ["branding_std", "logotipo", "rrss_post"];

export function caseId(c) {
  return [c.service, c.expertise, c.tier, c.market, c.complexity, c.revision, c.output].join("|");
}

export function buildCases(pricing) {
  const cases = [];
  const seen = new Set();
  const add = (block, service, overrides = {}) => {
    const c = {
      block,
      service: service.id,
      ...BASE,
      output: service.default_output_type,
      ...overrides
    };
    const id = caseId(c);
    if (seen.has(id)) return;
    seen.add(id);
    cases.push({ id, ...c });
  };

  for (const service of pricing.services) {
    for (const expertise of pricing.expertise) {
      add("perfil", service, { expertise: expertise.id });
    }
  }
  for (const service of pricing.services) {
    for (const tier of pricing.brand_tiers) {
      add("cliente", service, { tier: tier.id });
    }
  }
  for (const service of pricing.services) {
    for (const market of pricing.markets) {
      add("mercado", service, { market: market.id });
    }
  }
  for (const id of WITNESSES) {
    const service = pricing.services.find((s) => s.id === id);
    for (const complexity of pricing.complexity) {
      add("complejidad", service, { complexity: complexity.id });
    }
    for (const revision of pricing.revisions) {
      add("rondas", service, { revision: revision.id });
    }
  }
  for (const service of pricing.services) {
    for (const output of service.allowed_output_types) {
      add("output", service, { output });
    }
  }
  const top = (list) => list.reduce((a, b) => (b.coef > a.coef ? b : a));
  for (const service of pricing.services) {
    add("esquina", service, {
      expertise: "std",
      tier: "empresa",
      market: top(pricing.markets).id
    });
  }
  return cases;
}
