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
  // Espejo de getProfileCoef() en app.js: el salto entre perfiles se modula por
  // servicio alrededor de Mid.
  const profileCoef = (service, expertise) =>
    midCoef * (expertise.coef / midCoef) ** (service.expertise_weight ?? 1);

  function blendedBand(category, profile) {
    const bands = readyTracks.map((track) => ({
      weight: track.weight,
      band: track.by_category[category] || track.defaults
    }));
    const total = bands.reduce((sum, entry) => sum + entry.weight, 0);
    const k = profile / midCoef;
    const blend = (key) =>
      (bands.reduce((sum, entry) => sum + entry.band[key] * entry.weight, 0) / total) * k;
    return { p25: blend("p25"), median: blend("median"), p90: blend("p90") };
  }

  // Espejo de getBrandTierCoefs() en app.js: cada servicio toma una parte
  // (tier_hours_weight) del scope que suma el tipo de cliente; el resto de la
  // suba es solo tarifa.
  const tierHoursFor = (service, tier) =>
    1 + (service.tier_hours_weight ?? 0) * (tier.hours_coef - 1);

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
      profileCoef(service, expertise) * complexity.coef * output.coef * market.coef * Y * tier.rate_coef;
    const totalHours = hours.a + hours.b + hours.c;
    const usd = (hours.a * X_a + hours.b * X_b + hours.c * X_c) * multiplier;

    // El precio manda; las horas son el presupuesto que lo deja a tarifa de
    // mercado. Mas horas trabajadas = tarifa mas baja, por eso max sale del p25.
    const band = blendedBand(service.category, profileCoef(service, expertise));
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
