// La formula de precio de app.js (getBasePhaseHours + calculateQuote +
// evaluateBenchmark), para los scripts de chequeo. Si cambia una, hay que
// cambiar la otra.

export function createQuoter(pricing, benchmark) {
  const { X_a, X_b, X_c, Y } = pricing.config;
  const REVISION_DISTRIBUTION = { design: 0.6, production: 0.4 };

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

  // Espejo de getBrandTierCoefs() en app.js: el tipo de cliente suma horas solo
  // en las categorias donde el scope crece de verdad; el resto lleva solo tarifa.
  const scopeCategories = pricing.config.tier_hours_categories || [];
  const tierHoursFor = (service, tier) =>
    scopeCategories.includes(service.category) ? tier.hours_coef : 1.0;

  function quote(service, expertise, complexity, output, market, revision, tier) {
    const tierHours = tierHoursFor(service, tier);
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

  return { quote, readyTracks, tierHoursFor };
}
