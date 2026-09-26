import {
  convertUsd,
  getCurrencyConfig,
  getDisplayCurrencies,
  getDolarBlueLabel,
  getDolarBlueMeta,
  getFxMeta,
  initCurrency,
  usdToArs
} from "./currency.js?v=28";
import {
  SATOSHI_BOLD_BASE64,
  SATOSHI_REGULAR_BASE64,
  SPACE_MONO_BOLD_BASE64,
  SPACE_MONO_REGULAR_BASE64
} from "./pdf-fonts.js?v=28";
import { initAnalytics, track } from "./analytics.js?v=28";
import { MOTION, fadeSwap, placeSegThumb, rollText, watchSegThumb } from "./motion.js?v=28";
import { Sound, initSound } from "./sound.js?v=28";
import { createResultSheet } from "./sheet.js?v=28";

const STEP_META = [
  { title: "Servicio" },
  { title: "Perfil y contexto" },
  { title: "Complejidad" },
  { title: "Entregables" },
  { title: "Resultado" }
];

const EXPERTISE_ORDER = ["jr", "mid", "sr", "std"];

const REVISION_DISTRIBUTION = {
  design: 0.6,
  production: 0.4
};

const DEFAULT_CURRENCY_BY_MARKET = {
  latam: "ars",
  usa: "usd",
  europa: "eur"
};

const state = {
  pricingData: null,
  benchmarkData: null,
  selectedService: null,
  selectedMarket: "latam",
  selectedExpertise: "jr",
  selectedComplexity: "mid",
  selectedRevision: "2",
  selectedOutputType: null,
  selectedAddons: new Set(),
  selectedBrandTier: "emprendimiento",
  serviceOrder: [],
  displayCurrency: "ars",
  currencyMotionDirection: 1,
  // Moneda del ultimo precio dibujado: si cambia, el numero rueda en la
  // direccion del carrusel y no segun si subio o bajo.
  renderedCurrency: null,
  currentStep: 0,
  hasTouchedService: false,
  trackedStep: null,
  trackedQuote: false
};

const els = {};
const serviceCardsById = new Map();
const serviceSlotPositions = [];
const serviceSlotNodes = [];
const SERVICE_CARD_GAP = 4;
// El anillo de seleccion se dibuja 4px por fuera de la pastilla (2 de offset
// + 2 de grosor). Sin este margen la columna de la izquierda lo comia contra
// el borde de la card, que ademas es un contenedor con scroll.
const SERVICE_CARD_INSET = 5;
// Cuantos verdes tiene la rampa de --tag-1..--tag-4. El tono se asigna por
// posicion, asi que dos pastillas seguidas nunca caen en el mismo escalon.
const SERVICE_TONES = 4;
const SERVICE_CARD_DRAG_THRESHOLD = 8;
let serviceDragState = null;

function hasSelectedService() {
  return Boolean(state.selectedService);
}

function setCompassRotation(angleDeg) {
  if (!els.compassButton) {
    return;
  }

  els.compassButton.style.setProperty("--compass-rotation", `${angleDeg}deg`);
}

function getCompassRotation() {
  if (!els.compassButton) {
    return "-90deg";
  }

  return els.compassButton.style.getPropertyValue("--compass-rotation") || "-90deg";
}

function getPointerClientPosition(event) {
  if ("touches" in event && event.touches.length > 0) {
    return {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    };
  }

  if ("changedTouches" in event && event.changedTouches.length > 0) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY
    };
  }

  if ("clientX" in event && "clientY" in event) {
    return {
      x: event.clientX,
      y: event.clientY
    };
  }

  return null;
}

function updateCompassPointer(event) {
  const shouldTrackPointer =
    state.currentStep === STEP_META.length - 1 ||
    (state.currentStep === 0 && !hasSelectedService());

  if (!els.compassButton || !shouldTrackPointer) {
    return;
  }

  const pointer = getPointerClientPosition(event);
  if (!pointer) {
    return;
  }

  const rect = els.compassButton.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const angle = Math.atan2(pointer.y - centerY, pointer.x - centerX) * 180 / Math.PI;
  setCompassRotation(angle);
}

function syncCompassMode() {
  if (!els.compassButton) {
    return;
  }

  const isFinalStep = state.currentStep === STEP_META.length - 1;
  const shouldPointForward = !isFinalStep && (state.currentStep > 0 || hasSelectedService());
  const isIdleMode = isFinalStep || (state.currentStep === 0 && !hasSelectedService());
  els.compassButton.classList.toggle("is-forward", shouldPointForward);
  els.compassButton.classList.toggle("is-idle", isIdleMode);
  els.compassButton.classList.toggle("is-back", isFinalStep);
  els.compassButton.disabled = state.currentStep === 0 && !hasSelectedService();
  els.compassButton.setAttribute("aria-label", isFinalStep ? "Volver al paso anterior" : "Avanzar");

  if (shouldPointForward) {
    setCompassRotation(0);
  } else if (!isFinalStep) {
    setCompassRotation(-90);
  }
}

function syncSoundToggle() {
  const on = Sound.isEnabled();
  els.soundToggle.dataset.sound = on ? "on" : "off";
  els.soundToggle.setAttribute("aria-pressed", String(on));
  els.soundToggle.setAttribute("aria-label", on ? "Silenciar sonidos" : "Activar sonidos");
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("bong-theme", theme);
  const themeColor = theme === "dark" ? "#004831" : "#f4f1ea";
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.content = themeColor);
}

function toggleThemeWithTransition(event) {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  const nextThemeFill = nextTheme === "dark" ? "#004831" : "#f4f1ea";
  document.body.style.setProperty("--theme-transition-fill", nextThemeFill);
  document.body.classList.add("is-theme-transitioning");

  window.setTimeout(() => {
    applyTheme(nextTheme);
  }, 130);

  window.setTimeout(() => {
    document.body.classList.remove("is-theme-transitioning");
  }, 360);
}

function setMobileInsets() {
  if (window.innerWidth > 720) return;
  const header = document.querySelector('.site-header');
  const dock   = document.querySelector('.progress-dock');
  if (!header || !dock) return;

  const GAP           = 14; // gap visual deseado (px) arriba y abajo
  const headerBottom  = header.offsetHeight; // altura real del header desde el top
  const dockCssBottom = parseInt(getComputedStyle(dock).bottom) || 14;
  const dockHeight    = dock.offsetHeight;   // offsetHeight ignora transforms
  const dockFromBottom = dockCssBottom + dockHeight;

  document.documentElement.style.setProperty('--mobile-pad-top',    (headerBottom  + GAP) + 'px');
  document.documentElement.style.setProperty('--mobile-pad-bottom', (dockFromBottom + GAP) + 'px');
}

let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(setMobileInsets, 100);
});

function initTheme() {
  const storedTheme = localStorage.getItem("bong-theme");
  const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(storedTheme || (preferredDark ? "dark" : "light"));
}

function cacheDom() {
  els.typeGrid = document.querySelector("#type-grid");
  els.marketSeg = document.querySelector("#market-seg");
  els.marketMeta = document.querySelector("#market-meta");
  els.levelPills = document.querySelector("#level-pills");
  els.levelMeta = document.querySelector("#level-meta");
  els.serviceSummary = document.querySelector("#service-summary");
  els.extrasGroup = document.querySelector("#extras-group");
  els.extrasMeta = document.querySelector("#extras-meta");
  els.deliverablesGrid = document.querySelector("#deliverables-grid");
  els.deliverablesCopy = document.querySelector("#deliverables-copy");
  els.complexityLabel = document.querySelector("#complexity-label");
  els.revisionsLabel = document.querySelector("#revisions-label");
  els.complexityMeta = document.querySelector("#complexity-meta");
  els.revisionsMeta = document.querySelector("#revisions-meta");
  els.complexitySeg = document.querySelector("#complexity-seg");
  els.revisionsSeg = document.querySelector("#revisions-seg");
  els.livePrices = document.querySelectorAll("[data-live-price]");
  els.liveHours = document.querySelectorAll("[data-live-hours]");
  els.resultPrice = document.querySelector("#result-price");
  els.resultPriceValue = document.querySelector("#result-price-value");
  els.resultServiceTitle = document.querySelector("#result-service-title");
  els.benchmarkSection = document.querySelector("#benchmark-section");
  els.benchRate = document.querySelector("#bench-rate");
  els.benchRange = document.querySelector("#bench-range");
  els.benchTracks = document.querySelector("#bench-tracks");
  els.benchLegend = document.querySelector("#bench-legend");
  els.benchMarker = document.querySelector("#bench-marker");
  els.benchLabelMin = document.querySelector("#bench-label-min");
  els.benchLabelMed = document.querySelector("#bench-label-med");
  els.benchLabelMax = document.querySelector("#bench-label-max");
  els.benchInsight = document.querySelector("#bench-insight");
  els.benchFootnote = document.querySelector("#bench-footnote");
  els.resultRange = document.querySelector("#result-range");
  els.conversion = document.querySelector("#conversion");
  els.breakdown = document.querySelector("#breakdown");
  els.resultPill = document.querySelector("#result-pill");
  els.copyButton = document.querySelector("#copy-button");
  els.pdfButton = document.querySelector("#pdf-button");
  els.currencyCycle = document.querySelector("#currency-cycle");
  els.editButton = document.querySelector("#edit-button");
  els.copyFeedback = document.querySelector("#copy-feedback");
  els.masterclassBadge = document.querySelector(".masterclass-badge");
  els.themeToggle = document.querySelector("#theme-toggle");
  els.soundToggle = document.querySelector("#sound-toggle");
  els.currencyToggle = document.querySelector("#currency-toggle");
  els.currencyFooter = document.querySelector("#currency-footer");
  els.dockStep = document.querySelector("#dock-step");
  els.timeline = document.querySelector("#timeline");
  els.currentStepName = document.querySelector("#current-step-name");
  els.compassButton = document.querySelector("#compass-button");
  els.stepScreens = Array.from(document.querySelectorAll(".step-screen"));
  els.brandTierGroup = document.querySelector("#brand-tier-group");
  els.brandTierMeta = document.querySelector("#brand-tier-meta");
  els.brandTierCaption = document.querySelector("#brand-tier-caption");
  els.brandTierPills = document.querySelector("#brand-tier-pills");
}

// Sin no-store el navegador sirve la tabla de precios cacheada: al publicar una
// recalibracion, quien ya uso el cotizador sigue cotizando con precios viejos.
async function loadPricingData() {
  const response = await fetch("./data/pricing.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("No se pudo cargar pricing.json");
  }

  state.pricingData = await response.json();
  state.selectedService = null;
  state.selectedOutputType = null;
}

async function loadBenchmarkData() {
  try {
    const response = await fetch("./data/benchmark.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("No se pudo cargar benchmark.json");
    }
    state.benchmarkData = await response.json();
  } catch (error) {
    // El benchmark es una capa de lectura, no de calculo: si falla, la
    // cotizacion sigue funcionando y la seccion simplemente no se muestra.
    state.benchmarkData = null;
    console.warn("Referencia de mercado no disponible:", error);
  }
}

function formatMoney(value, currency) {
  const config = getCurrencyConfig(currency);
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.code,
    maximumFractionDigits: 0
  }).format(Math.round(value));
}

function getServiceById(id) {
  return state.pricingData.services.find((item) => item.id === id);
}

function getExpertiseById(id) {
  return state.pricingData.expertise.find((item) => item.id === id);
}

function getComplexityById(id) {
  return state.pricingData.complexity.find((item) => item.id === id);
}

function getRevisionById(id) {
  return state.pricingData.revisions.find((item) => item.id === id);
}

function getOutputTypeById(id) {
  return state.pricingData.output_types.find((item) => item.id === id);
}

function getMarketById(id) {
  return state.pricingData.markets.find((item) => item.id === id);
}

function getAddonById(id) {
  return state.pricingData.addons.find((item) => item.id === id);
}

function getBrandTierById(id) {
  return state.pricingData.brand_tiers.find((item) => item.id === id);
}

function getDefaultCurrencyForMarket(marketId) {
  return DEFAULT_CURRENCY_BY_MARKET[marketId] || "usd";
}

function getCurrentService() {
  return state.selectedService ? getServiceById(state.selectedService) : null;
}

// Configuracion de la cotizacion, sin ningun dato de la persona. Se usa en los
// eventos de alta intencion (llegar al resultado, exportar, copiar).
function getQuoteDimensions() {
  const service = getCurrentService();
  if (!service) {
    return {};
  }

  const quote = calculateQuote();
  return {
    servicio: service.id,
    categoria: service.category,
    tipo_cliente: state.selectedBrandTier,
    perfil: state.selectedExpertise,
    mercado: state.selectedMarket,
    complejidad: state.selectedComplexity,
    output: state.selectedOutputType,
    revisiones: state.selectedRevision,
    extras: state.selectedAddons.size,
    precio_usd: Math.round(quote.suggestedUsd),
    horas_objetivo: Math.round(quote.totalHours)
  };
}

function selectService(service) {
  els.compassButton?.style.setProperty("--compass-rotation-from", getCompassRotation());
  const changed = state.selectedService !== service.id;
  state.selectedService = service.id;
  state.selectedOutputType = service.default_output_type;
  state.hasTouchedService = true;
  syncAddonSelection();
  syncUI();
  animateCompassReady();

  if (changed) {
    // Cambiar de servicio reinicia la cotizacion, asi que el resultado
    // siguiente vuelve a contar como uno nuevo.
    state.trackedQuote = false;
    track("elegir_servicio", { servicio: service.id, categoria: service.category });
  }
}

function syncAddonSelection() {
  const service = getCurrentService();
  if (!service) {
    state.selectedAddons.clear();
    return;
  }
  const allowed = new Set(service.optional_addons);
  state.selectedAddons.forEach((id) => {
    if (!allowed.has(id)) {
      state.selectedAddons.delete(id);
    }
  });
}

function ensureOutputType() {
  const service = getCurrentService();
  if (!service) {
    state.selectedOutputType = null;
    return;
  }
  const allowed = service.allowed_output_types || [service.default_output_type];
  if (!state.selectedOutputType || !allowed.includes(state.selectedOutputType)) {
    state.selectedOutputType = service.default_output_type;
  }
}

function getOptionalAddons() {
  const service = getCurrentService();
  return service ? service.optional_addons.map(getAddonById).filter(Boolean) : [];
}

function getSelectedOptionalAddons() {
  return Array.from(state.selectedAddons).map(getAddonById).filter(Boolean);
}

function getAllSelectedLineItems() {
  const service = getCurrentService();
  if (!service) {
    return [];
  }
  return [
    { id: service.id, label: service.name, H_a: service.H_a, H_b: service.H_b, H_c: service.H_c, kind: "service" },
    ...getSelectedOptionalAddons().map((item) => ({ ...item, kind: "addon" }))
  ];
}

// El tipo de cliente se parte en dos: scope real (mas paginas de manual, mas
// aplicaciones = mas horas) y posicionamiento (lo que vale esa hora). Meterlo
// todo como precio dejaria el PDF diciendo 72h para un proyecto de USD 9.000.
function getBrandTierCoefs() {
  const tier = getBrandTierById(state.selectedBrandTier);
  return {
    hours: tier?.hours_coef ?? 1.0,
    rate: tier?.rate_coef ?? 1.0
  };
}

function getBasePhaseHours() {
  const tierHours = getBrandTierCoefs().hours;
  return getAllSelectedLineItems().reduce(
    (acc, item) => {
      acc.a += item.H_a * tierHours;
      acc.b += item.H_b * tierHours;
      acc.c += item.H_c * tierHours;
      return acc;
    },
    { a: 0, b: 0, c: 0 }
  );
}

function getRevisionHours(baseHours) {
  const revision = getRevisionById(state.selectedRevision);
  const revisionBase = baseHours.b + baseHours.c;
  const totalExtra = revisionBase * revision.extra_hours_coef;
  return {
    design: totalExtra * REVISION_DISTRIBUTION.design,
    production: totalExtra * REVISION_DISTRIBUTION.production
  };
}

function getReadyTracks(category) {
  return state.benchmarkData.tracks
    .filter((track) => track.status === "ready")
    .map((track) => ({
      id: track.id,
      label: track.label,
      weight: track.weight,
      band: track.by_category[category] || track.defaults
    }));
}

// La muestra de mercado es mid-pesada (edad promedio 28, mitad con 2 a 6 anos
// de experiencia), asi que la banda se lee como referencia de perfil Mid y se
// corre por perfil con la misma escalera de la tabla ancla. Sin esta correccion
// un estudio se mide contra la tarifa de un freelance promedio y el presupuesto
// de horas que sale es absurdo.
function getProfileRateCoef() {
  const current = getExpertiseById(state.selectedExpertise);
  const reference = getExpertiseById("mid");
  if (!current || !reference || reference.coef <= 0) {
    return 1;
  }
  return current.coef / reference.coef;
}

// El precio manda: sale de la tabla ancla. Lo que devuelve esto es el
// presupuesto de HORAS que hace que ese precio quede a tarifa de mercado.
// No es "esto tarda tanto" sino "para estar en mercado resolvelo en tanto".
// Mas horas trabajadas = tarifa mas baja, por eso el maximo sale del p25.
function evaluateBenchmark({ category, priceUsd, positioningCoef }) {
  const data = state.benchmarkData;
  if (!data || !category || priceUsd <= 0 || positioningCoef <= 0) {
    return null;
  }

  const tracks = getReadyTracks(category);
  if (tracks.length === 0) {
    return null;
  }

  // Los pesos se renormalizan sobre las pistas con datos: si una queda
  // pendiente, las otras se reparten su peso en vez de hundir la mezcla.
  const totalWeight = tracks.reduce((sum, track) => sum + track.weight, 0);
  const blend = (key) =>
    tracks.reduce((sum, track) => sum + track.band[key] * track.weight, 0) / totalWeight;

  const profileCoef = getProfileRateCoef();
  const band = {
    p25: blend("p25") * profileCoef,
    median: blend("median") * profileCoef,
    p75: blend("p75") * profileCoef,
    p90: blend("p90") * profileCoef
  };

  // El precio se compara sin mercado destino ni prima de posicionamiento:
  // esas dos no son trabajo y descolocarian el presupuesto de horas.
  const comparablePrice = priceUsd / positioningCoef;
  const budget = {
    min: comparablePrice / band.p90,
    target: comparablePrice / band.median,
    max: comparablePrice / band.p25
  };

  return { band, tracks, budget, profileCoef, positioningCoef };
}

function calculateQuote() {
  const { X_a, X_b, X_c, Y } = state.pricingData.config;
  const expertise = getExpertiseById(state.selectedExpertise);
  const complexity = getComplexityById(state.selectedComplexity);
  const outputType = getOutputTypeById(state.selectedOutputType);
  const market = getMarketById(state.selectedMarket);
  const baseHours = getBasePhaseHours();
  const revisionHours = getRevisionHours(baseHours);
  const phaseHours = {
    a: baseHours.a,
    b: baseHours.b + revisionHours.design,
    c: baseHours.c + revisionHours.production
  };
  const tierCoefs = getBrandTierCoefs();
  const multiplier = expertise.coef * complexity.coef * outputType.coef * market.coef * Y * tierCoefs.rate;
  // Estas horas no se muestran: son el mecanismo que reparte el precio entre
  // servicios y fases. Las horas que ve el usuario son el presupuesto que sale
  // del benchmark, mas abajo.
  const shapeHours = phaseHours.a + phaseHours.b + phaseHours.c;

  const phaseValuesUsd = {
    a: phaseHours.a * X_a * multiplier,
    b: phaseHours.b * X_b * multiplier,
    c: phaseHours.c * X_c * multiplier
  };
  const suggestedUsd = phaseValuesUsd.a + phaseValuesUsd.b + phaseValuesUsd.c;
  const suggestedArs = usdToArs(suggestedUsd);

  const benchmark = evaluateBenchmark({
    category: getCurrentService()?.category,
    priceUsd: suggestedUsd,
    positioningCoef: market.coef * tierCoefs.rate
  });

  // Todo lo que se muestra en horas se reescala al objetivo, asi el desglose
  // suma exactamente el presupuesto y conserva la proporcion entre fases.
  const totalHours = benchmark ? benchmark.budget.target : shapeHours;
  const hoursScale = shapeHours > 0 ? totalHours / shapeHours : 1;
  const budgetPhaseHours = {
    a: phaseHours.a * hoursScale,
    b: phaseHours.b * hoursScale,
    c: phaseHours.c * hoursScale
  };

  const lineItems = getAllSelectedLineItems().map((item) => {
    const itemHours = (item.H_a + item.H_b + item.H_c) * tierCoefs.hours;
    const baseValue = (item.H_a * X_a + item.H_b * X_b + item.H_c * X_c) * tierCoefs.hours;
    const usd = baseValue * multiplier;
    return {
      label: item.label,
      hours: itemHours * hoursScale,
      usd,
      ars: usdToArs(usd)
    };
  });

  const revisionValueUsd = (revisionHours.design * X_b + revisionHours.production * X_c) * multiplier;

  if (revisionValueUsd > 0) {
    lineItems.push({
      label: getRevisionById(state.selectedRevision).label,
      hours: (revisionHours.design + revisionHours.production) * hoursScale,
      usd: revisionValueUsd,
      ars: usdToArs(revisionValueUsd)
    });
  }

  return {
    suggestedUsd,
    suggestedArs,
    totalHours,
    phaseHours: budgetPhaseHours,
    breakdown: {
      estrategia: { usd: phaseValuesUsd.a, ars: usdToArs(phaseValuesUsd.a), hours: budgetPhaseHours.a },
      diseno: { usd: phaseValuesUsd.b, ars: usdToArs(phaseValuesUsd.b), hours: budgetPhaseHours.b },
      produccion: { usd: phaseValuesUsd.c, ars: usdToArs(phaseValuesUsd.c), hours: budgetPhaseHours.c }
    },
    lineItems,
    benchmark
  };
}

function createServiceCard(service) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "type-card";
  button.dataset.type = service.id;
  // Antes iba un icono por categoria. Lo sacamos: los 22px que ocupaba eran
  // justo los que partian en dos lineas a las etiquetas largas en mobile, y
  // la categoria ya no manda en el color.
  button.innerHTML = `<span class="type-card-title">${service.name}</span>`;
  button.addEventListener("pointerdown", (event) => startServiceCardInteraction(event, button));
  button.addEventListener("click", () => {
    if (button.dataset.suppressClick === "true") {
      button.dataset.suppressClick = "false";
      return;
    }
    selectService(service);
  });
  serviceCardsById.set(service.id, button);
  return button;
}

function ensureServiceSlots(count) {
  while (serviceSlotNodes.length < count) {
    const slot = document.createElement("div");
    slot.className = "service-slot";
    slot.setAttribute("aria-hidden", "true");
    els.typeGrid.appendChild(slot);
    serviceSlotNodes.push(slot);
  }
}

function computeServiceCardLayout(order = state.serviceOrder) {
  const gridWidth = els.typeGrid?.clientWidth || 0;
  if (!gridWidth) {
    return;
  }

  const inset = SERVICE_CARD_INSET;
  const limit = gridWidth - inset;
  let cursorX = inset;
  let cursorY = 0;
  let rowHeight = 0;
  let maxBottom = 0;

  serviceSlotPositions.length = 0;

  order.forEach((id) => {
    const card = serviceCardsById.get(id);
    if (!card) {
      return;
    }

    const width = card.offsetWidth;
    const height = card.offsetHeight;

    if (cursorX > inset && cursorX + width > limit) {
      cursorX = inset;
      cursorY += rowHeight + SERVICE_CARD_GAP;
      rowHeight = 0;
    }

    const position = {
      id,
      left: cursorX,
      top: cursorY,
      width,
      height,
      centerX: cursorX + width / 2,
      centerY: cursorY + height / 2
    };

    serviceSlotPositions.push(position);
    cursorX += width + SERVICE_CARD_GAP;
    rowHeight = Math.max(rowHeight, height);
    maxBottom = Math.max(maxBottom, position.top + position.height);
  });

  els.typeGrid.style.minHeight = `${maxBottom}px`;
  ensureServiceSlots(serviceSlotPositions.length);

  serviceSlotPositions.forEach((slot, index) => {
    const node = serviceSlotNodes[index];
    node.style.left = `${slot.left}px`;
    node.style.top = `${slot.top}px`;
    node.style.width = `${slot.width}px`;
    node.style.height = `${slot.height}px`;
  });
}

function renderServiceCards(exceptId = null) {
  serviceSlotPositions.forEach((slot, index) => {
    const card = serviceCardsById.get(slot.id);
    if (!card) {
      return;
    }
    // El tono va con la posicion, no con la pastilla: al arrastrar una a otro
    // lugar toma el verde que le toca ahi, y la fila nunca queda con dos
    // iguales pegadas.
    card.dataset.tone = String(index % SERVICE_TONES);
    if (slot.id === exceptId) {
      return;
    }
    card.style.left = `${slot.left}px`;
    card.style.top = `${slot.top}px`;
  });
}

function scheduleServiceCardLayout() {
  window.requestAnimationFrame(() => {
    computeServiceCardLayout();
    renderServiceCards();
  });
}

function getNearestServiceSlotIndex(x, y) {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  serviceSlotPositions.forEach((slot, index) => {
    const distance = Math.hypot(x - slot.centerX, y - slot.centerY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function startServiceCardInteraction(event, card) {
  if (event.button !== 0 || state.currentStep !== 0) {
    return;
  }

  const rect = card.getBoundingClientRect();
  serviceDragState = {
    id: card.dataset.type,
    card,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    hasDragged: false
  };

  card.setPointerCapture(event.pointerId);
  card.addEventListener("pointermove", handleServiceCardPointerMove);
  card.addEventListener("pointerup", endServiceCardInteraction);
  card.addEventListener("pointercancel", endServiceCardInteraction);
}

function handleServiceCardPointerMove(event) {
  if (!serviceDragState || serviceDragState.pointerId !== event.pointerId) {
    return;
  }

  const { card, id, offsetX, offsetY, startX, startY } = serviceDragState;
  const gridRect = els.typeGrid.getBoundingClientRect();
  const movedEnough = Math.hypot(event.clientX - startX, event.clientY - startY) > SERVICE_CARD_DRAG_THRESHOLD;

  if (!serviceDragState.hasDragged && movedEnough) {
    serviceDragState.hasDragged = true;
    card.classList.add("is-dragging");
    els.typeGrid.classList.add("is-reordering");
  }

  if (!serviceDragState.hasDragged) {
    return;
  }

  const left = Math.min(Math.max(event.clientX - gridRect.left - offsetX, 0), Math.max(gridRect.width - card.offsetWidth, 0));
  const top = Math.min(Math.max(event.clientY - gridRect.top - offsetY, 0), Math.max(gridRect.height - card.offsetHeight, 0));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;

  const targetIndex = getNearestServiceSlotIndex(
    event.clientX - gridRect.left,
    event.clientY - gridRect.top
  );
  const currentIndex = state.serviceOrder.indexOf(id);

  if (targetIndex !== currentIndex) {
    state.serviceOrder.splice(currentIndex, 1);
    state.serviceOrder.splice(targetIndex, 0, id);
    computeServiceCardLayout();
    renderServiceCards(id);
  }
}

function endServiceCardInteraction(event) {
  if (!serviceDragState || serviceDragState.pointerId !== event.pointerId) {
    return;
  }

  const { card, hasDragged } = serviceDragState;

  card.removeEventListener("pointermove", handleServiceCardPointerMove);
  card.removeEventListener("pointerup", endServiceCardInteraction);
  card.removeEventListener("pointercancel", endServiceCardInteraction);
  card.releasePointerCapture(event.pointerId);

  if (hasDragged) {
    card.classList.remove("is-dragging");
    card.dataset.suppressClick = "true";
    els.typeGrid.classList.remove("is-reordering");
    computeServiceCardLayout();
    renderServiceCards();
  }

  serviceDragState = null;
}

function animateCompassReady() {
  if (!els.compassButton) {
    return;
  }

  els.compassButton.classList.remove("is-animating");
  void els.compassButton.offsetWidth;
  els.compassButton.classList.add("is-animating");
  window.setTimeout(() => {
    els.compassButton?.classList.remove("is-animating");
  }, 520);
}

// Selector de opciones (una sola eleccion). Los botones se arman una sola vez
// por juego de opciones: regenerarlos en cada syncUI pierde el foco del
// teclado. Sin onPick, la opcion queda fija (el servicio no deja elegir).
function renderSeg(container, options, selectedId, onPick) {
  const key = options.map((option) => option.id).join("|");
  if (container.dataset.key !== key) {
    container.dataset.key = key;
    container.innerHTML = "";
    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dial-seg-btn";
      button.dataset.value = option.id;
      button.textContent = option.label;
      if (option.caption) {
        button.title = option.caption;
      }
      if (onPick) {
        button.addEventListener("click", () => onPick(option.id));
      } else {
        button.disabled = true;
      }
      container.appendChild(button);
    });
  }

  container.querySelectorAll(".dial-seg-btn").forEach((button) => {
    const isActive = button.dataset.value === selectedId;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  watchSegThumb(container);
  placeSegThumb(container);
}

// Extras: eleccion multiple, cada uno prende y apaga solo.
function renderToggleChips(container, options, selectedIds, onToggle) {
  const key = options.map((option) => option.id).join("|");
  if (container.dataset.key !== key) {
    container.dataset.key = key;
    container.innerHTML = "";
    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toggle-chip";
      button.dataset.value = option.id;
      button.innerHTML = `
        <span class="toggle-chip-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path class="mark-plus" d="M12 7v10M7 12h10"/><path class="mark-check" d="M7 12.5l3.2 3.2L17 9"/></svg></span>
        <span class="toggle-chip-label">${option.label}</span>
      `;
      button.addEventListener("click", () => onToggle(option.id));
      container.appendChild(button);
    });
  }

  container.querySelectorAll(".toggle-chip").forEach((button) => {
    const isActive = selectedIds.has(button.dataset.value);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function formatCoef(coef) {
  return `×${coef.toFixed(2).replace(".", ",")}`;
}

function buildStaticUI() {
  state.serviceOrder = state.pricingData.services.map((service) => service.id);

  state.pricingData.services.forEach((service) => {
    els.typeGrid.appendChild(createServiceCard(service));
  });

  STEP_META.forEach((step, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "timeline-step";
    button.dataset.step = String(index);
    button.dataset.stepLabel = step.title;
    button.setAttribute("aria-label", `Ir a ${step.title}`);
    button.title = step.title;
    button.addEventListener("click", () => goToStep(index));
    els.timeline.appendChild(button);
  });
}

function renderProfileStep() {
  const market = getMarketById(state.selectedMarket);
  renderSeg(els.marketSeg, state.pricingData.markets, state.selectedMarket, (id) => {
    state.selectedMarket = id;
    state.displayCurrency = getDefaultCurrencyForMarket(id);
    syncUI();
  });
  fadeSwap(els.marketMeta, `${formatCoef(market.coef)} · ${getCurrencyConfig(getDefaultCurrencyForMarket(market.id)).label}`);

  const levels = state.pricingData.expertise
    .slice()
    .sort((a, b) => EXPERTISE_ORDER.indexOf(a.id) - EXPERTISE_ORDER.indexOf(b.id))
    .map((expertise) => ({ ...expertise, label: expertise.id === "std" ? "Estudio" : expertise.label }));
  renderSeg(els.levelPills, levels, state.selectedExpertise, (id) => {
    state.selectedExpertise = id;
    syncUI();
  });
  fadeSwap(els.levelMeta, formatCoef(getExpertiseById(state.selectedExpertise).coef));
}

function renderServiceSummary() {
  const service = getCurrentService();
  if (!service) {
    els.serviceSummary.hidden = true;
    els.serviceSummary.innerHTML = "";
    return;
  }

  const included = service.included_addons.map(getAddonById).filter(Boolean).map((addon) => addon.label);
  els.serviceSummary.hidden = false;
  els.serviceSummary.innerHTML = `
    <span class="receipt-dot" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12l4 4 8-8"/></svg></span>
    <span class="service-summary-name">${service.name}</span>
    <span class="conversion-chip">${service.category}</span>
    <span class="service-summary-caption">${service.caption}</span>
    ${included.length ? `<span class="service-summary-included">Incluye ${included.join(" · ")}</span>` : ""}
  `;
}

function renderDeliverables() {
  const service = getCurrentService();

  if (!service) {
    els.deliverablesCopy.textContent = "Primero elegí un servicio para destrabar outputs y extras.";
    return;
  }

  // El formato de salida ya no tiene selector propio: si el servicio admite
  // otro ademas del default (Motion, Interactivo / 3D), aparece como un extra
  // mas que se prende y se apaga. Los que ya ofrecen "Salida motion" como
  // extra solo admiten estatico, para no cobrar motion dos veces.
  const allowedOutputIds = service.allowed_output_types || [service.default_output_type];
  const outputChips = state.pricingData.output_types
    .filter((outputType) => allowedOutputIds.includes(outputType.id) && outputType.id !== service.default_output_type)
    .map((outputType) => ({ id: `output:${outputType.id}`, label: outputType.label }));
  const optionalAddons = getOptionalAddons();
  const extras = [...outputChips, ...optionalAddons];
  const selectedExtras = new Set(state.selectedAddons);
  if (state.selectedOutputType !== service.default_output_type) {
    selectedExtras.add(`output:${state.selectedOutputType}`);
  }

  els.extrasGroup.hidden = extras.length === 0;
  renderToggleChips(els.deliverablesGrid, extras, selectedExtras, (id) => {
    const turningOn = !selectedExtras.has(id);
    // El doble blip suena cuando el verde termino de crecer o de vaciarse.
    window.setTimeout(() => Sound.chip(turningOn), MOTION.fast);
    if (id.startsWith("output:")) {
      const outputId = id.slice("output:".length);
      state.selectedOutputType = state.selectedOutputType === outputId ? service.default_output_type : outputId;
    } else if (state.selectedAddons.has(id)) {
      state.selectedAddons.delete(id);
    } else {
      state.selectedAddons.add(id);
    }
    syncUI();
  });
  fadeSwap(els.extrasMeta, `${extras.filter((extra) => selectedExtras.has(extra.id)).length} de ${extras.length}`);

  els.deliverablesCopy.textContent = "Sumá solo los extras que cambian horas.";

  // El tipo de cliente define scope y posicionamiento, no el perfil de quien
  // ejecuta: aplica a los cuatro perfiles, no solo a Estudio.
  const tier = getBrandTierById(state.selectedBrandTier);
  renderSeg(els.brandTierPills, state.pricingData.brand_tiers, state.selectedBrandTier, (id) => {
    state.selectedBrandTier = id;
    syncUI();
  });
  fadeSwap(els.brandTierMeta, `${formatCoef(tier.hours_coef)} horas`);
  fadeSwap(els.brandTierCaption, tier.caption || "", MOTION.fast + MOTION.stagger);
}


// Monto sin simbolo: en la conversion y en las filas el codigo de moneda ya
// va al lado, y "$" solo no distingue USD de ARS.
function formatAmount(value, currency) {
  return new Intl.NumberFormat(getCurrencyConfig(currency).locale, {
    maximumFractionDigits: 0
  }).format(Math.round(value));
}

function formatRowHours(value) {
  return `${value.toFixed(1).replace(".", ",")} h`;
}

function getRateLabel(currency) {
  if (currency === "ars") {
    return `Dólar blue: <b>$${Math.round(getDolarBlueMeta().venta).toLocaleString("es-AR")}</b>`;
  }

  const config = getCurrencyConfig(currency);
  const rate = getFxMeta().rates[config.code];
  if (!rate) {
    return "Sin cotización disponible";
  }

  const digits = rate < 100 ? 2 : 0;
  const value = rate.toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `1 USD = <b>${value} ${config.label}</b>`;
}

// La tarjeta de conversion de Brubank: arriba el precio base del modelo en
// USD, abajo la moneda elegida con su cotizacion. Si la moneda elegida es USD,
// abajo va ARS, que es la que mas se usa para comparar.
function renderConversion(quote) {
  const target = state.displayCurrency === "usd" ? "ars" : state.displayCurrency;
  const targetConfig = getCurrencyConfig(target);
  const context = [
    getMarketById(state.selectedMarket).label,
    getExpertiseById(state.selectedExpertise).label,
    getBrandTierById(state.selectedBrandTier).label,
    `Complejidad ${getComplexityById(state.selectedComplexity).label.toLowerCase()}`,
    getOutputTypeById(state.selectedOutputType).label
  ].join(" · ");

  els.conversion.innerHTML = `
    <div class="conversion-row is-source">
      <span class="code-dot">USD</span>
      <span class="conversion-amount">${formatAmount(quote.suggestedUsd, "usd")} USD</span>
      <span class="conversion-chip">Sugerido</span>
      <span class="conversion-sub">${context}</span>
    </div>
    <div class="conversion-row">
      <span class="code-dot">${targetConfig.label}</span>
      <span class="conversion-amount">${formatAmount(convertUsd(quote.suggestedUsd, target), target)} ${targetConfig.label}</span>
      <span class="conversion-sub">${getRateLabel(target)}</span>
    </div>
  `;
}

const PHASE_ROWS = {
  estrategia: {
    label: "Estrategia",
    icon: '<circle cx="12" cy="12" r="8"/><path d="M15 9l-2 4-4 2 2-4z"/>'
  },
  diseno: {
    label: "Diseño",
    icon: '<path d="M4 20l4-1L19 8l-3-3L5 16l-1 4zM14 7l3 3"/>'
  },
  produccion: {
    label: "Producción",
    icon: '<path d="M4 8l8-4 8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4"/>'
  }
};
const ITEM_ROW_ICON = '<rect x="5" y="5" width="14" height="14" rx="4"/>';
const TOTAL_ROW_ICON = '<path d="M6 12l4 4 8-8"/>';

function receiptRow({ label, hours, usd, icon, modifier = "" }) {
  return `
    <div class="receipt-row${modifier}">
      <span class="receipt-dot"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span>
      <span class="receipt-label">${label}<span class="receipt-hours">${formatRowHours(hours)}</span></span>
      <span class="receipt-amount">${formatMoney(convertUsd(usd, state.displayCurrency), state.displayCurrency)}</span>
    </div>
  `;
}

// Fases y entregables son dos formas de repartir el mismo total, no se suman
// entre si. Por eso el total va primero y cada reparto con su propio rotulo.
function renderBreakdown(quote) {
  const totalRow = receiptRow({
    label: "Total",
    hours: quote.totalHours,
    usd: quote.suggestedUsd,
    icon: TOTAL_ROW_ICON,
    modifier: " is-total"
  });
  const phaseRows = Object.entries(quote.breakdown).map(([phase, amount]) =>
    receiptRow({ ...PHASE_ROWS[phase], hours: amount.hours, usd: amount.usd })
  );
  const itemRows = quote.lineItems.map((item) =>
    receiptRow({ label: item.label, hours: item.hours, usd: item.usd, icon: ITEM_ROW_ICON, modifier: " is-item" })
  );

  els.breakdown.innerHTML = [
    totalRow,
    `<p class="receipt-group">Por fase</p>`,
    ...phaseRows,
    ...(itemRows.length ? [`<p class="receipt-group">Por entregable</p>`, ...itemRows] : [])
  ].join("");
}

function renderResultPill() {
  const revision = getRevisionById(state.selectedRevision);
  els.resultPill.innerHTML = `
    <span class="info-pill-dot" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12l4 4 8-8"/></svg></span>
    Incluye ${revision.label} de revisión
  `;
  els.resultPill.hidden = false;
}

function formatHours(value) {
  return value >= 100 ? `${Math.round(value)} h` : `${value.toFixed(value < 10 ? 1 : 0).replace(".", ",")} h`;
}

function renderBenchmark(quote) {
  const benchmark = quote.benchmark;
  if (!benchmark) {
    els.benchmarkSection.hidden = true;
    return;
  }

  const { band, tracks, budget, positioningCoef } = benchmark;
  const data = state.benchmarkData;
  els.benchmarkSection.hidden = false;

  // El dominio arranca abajo del minimo y deja aire despues del maximo para
  // que la ventana no quede pegada contra los bordes.
  const barMin = budget.min * 0.55;
  const barMax = budget.max * 1.12;
  const toPercent = (value) =>
    Math.min(Math.max(((value - barMin) / (barMax - barMin)) * 100, 2), 98);
  const rangeStart = toPercent(budget.min);
  const targetAt = toPercent(budget.target);

  els.benchRange.style.left = `${rangeStart}%`;
  els.benchRange.style.width = `${Math.max(toPercent(budget.max) - rangeStart, 1)}%`;
  els.benchMarker.style.left = `${targetAt}%`;

  els.benchLabelMin.style.left = `${rangeStart}%`;
  els.benchLabelMed.style.left = `${targetAt}%`;
  els.benchLabelMax.style.left = `${toPercent(budget.max)}%`;

  els.benchmarkSection.dataset.state = "en-rango";
  els.benchMarker.className = "benchmark-marker is-en-rango";
  els.benchRate.textContent = formatHours(budget.target);
  els.benchLabelMin.textContent = `${Math.round(budget.min)}`;
  els.benchLabelMed.textContent = `Objetivo ${Math.round(budget.target)}`;
  els.benchLabelMax.textContent = `${Math.round(budget.max)}`;

  // Una marca por pista: cada referencia da su propio objetivo de horas, y ver
  // la diferencia es lo que separa un mapa de un veredicto.
  const comparablePrice = quote.suggestedUsd / positioningCoef;
  const trackTargets = tracks.map((track) => ({
    label: track.label,
    hours: comparablePrice / (track.band.median * benchmark.profileCoef)
  }));

  els.benchTracks.innerHTML = trackTargets
    .map(
      (track) =>
        `<span class="benchmark-track-tick" style="left:${toPercent(track.hours)}%" title="${track.label}: ${formatHours(track.hours)}"></span>`
    )
    .join("");

  els.benchLegend.innerHTML = trackTargets
    .map(
      (track) =>
        `<span class="benchmark-legend-item">${track.label} <strong>${Math.round(track.hours)}h</strong></span>`
    )
    .join("");

  const price = formatMoney(convertUsd(quote.suggestedUsd, state.displayCurrency), state.displayCurrency);
  const insight =
    `Cobrás <strong>${price}</strong>. Para que ese precio quede a tarifa de mercado, ` +
    `resolvelo entre <strong>${formatHours(budget.min)}</strong> y <strong>${formatHours(budget.max)}</strong>. ` +
    `Si te pasás de ${formatHours(budget.max)} estás trabajando por debajo del mercado.`;

  els.benchInsight.className = "benchmark-insight is-en-rango";
  els.benchInsight.innerHTML = `<p class="insight-text">${insight}</p>`;

  const pending = data.tracks.filter((track) => track.status !== "ready");
  const footnote = [
    `Ventana p25–p90 ponderada · ${tracks.map((track) => track.label).join(" + ")}`,
    `referencia perfil ${getExpertiseById(state.selectedExpertise).label} (x${benchmark.profileCoef.toFixed(2)} sobre banda Mid)`
  ];
  if (pending.length > 0) {
    footnote.push(`sin datos: ${pending.map((track) => track.label).join(", ")}`);
  }
  els.benchFootnote.textContent = footnote.join(" · ");
}

function renderCurrencyToggle() {
  const currencies = getDisplayCurrencies();
  const activeCurrency = getCurrencyConfig(state.displayCurrency);
  const activeIndex = currencies.findIndex(({ id }) => id === state.displayCurrency);
  const prevCurrency = currencies[(activeIndex - 1 + currencies.length) % currencies.length];
  const nextCurrency = currencies[(activeIndex + 1) % currencies.length];

  els.currencyToggle.dataset.current = state.displayCurrency;
  els.currencyToggle.dataset.direction = state.currencyMotionDirection > 0 ? "next" : "prev";
  els.currencyToggle.innerHTML = `
    <div class="currency-carousel" role="tablist" aria-label="Cambiar moneda">
      <div class="currency-stage">
        <div class="currency-highlight" aria-hidden="true"></div>
        <div class="currency-window">
        <div class="currency-track">
          <button
            class="currency-item currency-item-side"
            data-currency="${prevCurrency.id}"
            type="button"
            role="tab"
            aria-selected="false"
          >
            <span class="currency-item-code">${prevCurrency.label}</span>
          </button>
          <button
            class="currency-item currency-item-active"
            data-currency="${activeCurrency.id}"
            type="button"
            role="tab"
            aria-selected="true"
          >
            <span class="currency-item-code">${activeCurrency.label}</span>
          </button>
          <button
            class="currency-item currency-item-side"
            data-currency="${nextCurrency.id}"
            type="button"
            role="tab"
            aria-selected="false"
          >
            <span class="currency-item-code">${nextCurrency.label}</span>
          </button>
        </div>
        </div>
      </div>
      <div class="currency-nav-row" aria-hidden="true">
        <button class="currency-nav" data-currency-shift="-1" type="button" aria-label="Moneda anterior">←</button>
        <button class="currency-nav" data-currency-shift="1" type="button" aria-label="Moneda siguiente">→</button>
      </div>
    </div>
  `;

  els.currencyToggle.querySelectorAll("[data-currency]").forEach((button) => {
    button.addEventListener("click", () => {
      state.displayCurrency = button.dataset.currency;
      syncUI();
    });
  });

  els.currencyToggle.querySelectorAll("[data-currency-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.dataset.currencyShift);
      const nextIndex = (activeIndex + step + currencies.length) % currencies.length;
      state.currencyMotionDirection = step;
      state.displayCurrency = currencies[nextIndex].id;
      syncUI();
    });
  });
}

function renderResult() {
  if (!state.pricingData) {
    return;
  }

  if (!hasSelectedService()) {
    els.resultServiceTitle.textContent = "Selecciona un servicio";
    els.resultPriceValue.textContent = "ARS 0";
    els.resultPriceValue.dataset.rollValue = "ARS 0";
    els.resultRange.textContent = "Elegí un servicio para calcular el presupuesto.";
    els.breakdown.innerHTML = "";
    els.conversion.innerHTML = "";
    els.resultPill.hidden = true;
    els.benchmarkSection.hidden = true;
    renderCurrencyToggle();
    els.copyButton.disabled = true;
    els.pdfButton.disabled = true;
    return;
  }

  const quote = calculateQuote();
  els.resultServiceTitle.textContent = getCurrentService().name;
  const currencyChanged = state.renderedCurrency !== null && state.renderedCurrency !== state.displayCurrency;
  state.renderedCurrency = state.displayCurrency;
  rollText(els.resultPriceValue, formatMoney(convertUsd(quote.suggestedUsd, state.displayCurrency), state.displayCurrency), {
    direction: currencyChanged ? state.currencyMotionDirection : 0,
    delay: MOTION.instant,
    sound: true
  });
  els.resultRange.textContent = `Objetivo de tiempo: ${formatHours(quote.totalHours)} · ${getRevisionById(state.selectedRevision).label}`;
  renderConversion(quote);
  renderBreakdown(quote);
  renderResultPill();
  renderBenchmark(quote);
  renderCurrencyToggle();
  els.copyButton.disabled = false;
  els.pdfButton.disabled = false;
}

function getDialConfig(kind) {
  if (kind === "complexity") {
    return {
      list: state.pricingData.complexity,
      selected: state.selectedComplexity,
      label: els.complexityLabel,
      meta: els.complexityMeta,
      seg: els.complexitySeg,
      shortLabel: (item) => item.label,
      metaLabel: (item) => `×${item.coef.toFixed(2).replace(".", ",")}`
    };
  }

  return {
    list: state.pricingData.revisions,
    selected: state.selectedRevision,
    label: els.revisionsLabel,
    meta: els.revisionsMeta,
    seg: els.revisionsSeg,
    shortLabel: (item) => item.label.replace(/ rondas?$/, ""),
    metaLabel: (item) =>
      item.extra_hours_coef > 0 ? `+${Math.round(item.extra_hours_coef * 100)}% horas` : "Sin horas extra"
  };
}

function setDial(kind, index) {
  const { list } = getDialConfig(kind);
  const item = list[Math.max(0, Math.min(index, list.length - 1))];
  if (kind === "complexity") {
    state.selectedComplexity = item.id;
  } else {
    state.selectedRevision = item.id;
  }
}

// Los botones del selector se arman una sola vez: si se regeneran en cada
// syncUI, el foco del teclado se pierde al elegir una opcion.
function renderDial(kind) {
  const config = getDialConfig(kind);
  const index = config.list.findIndex((item) => item.id === config.selected);
  const item = config.list[index];
  const prevIndex = Number(config.seg.dataset.index ?? index);
  config.seg.dataset.index = String(index);

  if (config.seg.childElementCount !== config.list.length) {
    config.seg.innerHTML = config.list
      .map((option, i) => `<button class="dial-seg-btn" type="button" data-seg="${kind}" data-index="${i}">${config.shortLabel(option)}</button>`)
      .join("");
  }

  config.seg.querySelectorAll(".dial-seg-btn").forEach((button, i) => {
    button.classList.toggle("is-active", i === index);
    button.setAttribute("aria-pressed", String(i === index));
  });
  watchSegThumb(config.seg);
  placeSegThumb(config.seg);
  // El valor rueda hacia arriba al subir y hacia abajo al bajar, y el
  // multiplicador llega despues, como explicacion del cambio.
  rollText(config.label, item.label, { direction: Math.sign(index - prevIndex), whole: true });
  fadeSwap(config.meta, config.metaLabel(item));
  document.querySelectorAll(`.dial-btn[data-slider="${kind}"]`).forEach((button) => {
    const dir = Number(button.dataset.dir);
    button.disabled = dir < 0 ? index === 0 : index === config.list.length - 1;
  });
}

function renderLiveBudget() {
  if (!hasSelectedService()) {
    els.livePrices.forEach((node) => { node.textContent = ""; });
    els.liveHours.forEach((node) => { node.textContent = ""; });
    return;
  }

  const quote = calculateQuote();
  const price = formatMoney(convertUsd(quote.suggestedUsd, state.displayCurrency), state.displayCurrency);
  const hours = formatHours(quote.totalHours);
  // El precio arranca cuando la pastilla va por la mitad, no cuando llega.
  els.livePrices.forEach((node) => rollText(node, price, { delay: MOTION.instant, sound: true }));
  els.liveHours.forEach((node) => fadeSwap(node, hours, MOTION.base));
}

function renderFlow() {
  const step = STEP_META[state.currentStep];
  els.currentStepName.textContent = `${step.title} · ${state.currentStep + 1}/${STEP_META.length}`;
  els.stepScreens.forEach((screen, index) => {
    screen.classList.toggle("is-active", index === state.currentStep);
  });
  if (state.currentStep === 0) {
    scheduleServiceCardLayout();
  }
  els.timeline.querySelectorAll(".timeline-step").forEach((node, index) => {
    node.classList.toggle("is-active", index === state.currentStep);
    node.classList.toggle("is-complete", index < state.currentStep);
  });
  syncCompassMode();
  state.resultSheet?.sync(state.currentStep === STEP_META.length - 1);
  trackStepChange();
}

// renderFlow corre en cada syncUI, o sea con cada movimiento de slider. Solo
// se registra cuando el paso cambia de verdad, si no el embudo queda inflado.
function trackStepChange() {
  if (state.trackedStep === state.currentStep) {
    return;
  }

  state.trackedStep = state.currentStep;
  track("ver_paso", {
    paso: state.currentStep + 1,
    nombre: STEP_META[state.currentStep].title
  });

  const isResultStep = state.currentStep === STEP_META.length - 1;
  if (isResultStep && !state.trackedQuote && hasSelectedService()) {
    state.trackedQuote = true;
    track("ver_cotizacion", getQuoteDimensions());
  }
}

function syncUI() {
  ensureOutputType();
  renderServiceSummary();
  renderProfileStep();
  renderDial("complexity");
  renderDial("revisions");
  renderLiveBudget();

  document.querySelectorAll(".type-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.type === state.selectedService);
  });

  renderDeliverables();
  renderResult();
  renderFlow();
}

// Las filas del recibo entran de arriba hacia abajo, en el orden en que se
// leen. Solo al llegar al resultado: si se re-dibujan por un cambio de moneda,
// cambian en el lugar.
function staggerReceipt() {
  els.breakdown.classList.remove("is-entering");
  void els.breakdown.offsetWidth;
  els.breakdown.classList.add("is-entering");
  window.setTimeout(() => els.breakdown.classList.remove("is-entering"), 900);
}

function goToStep(stepIndex) {
  if (stepIndex > 0 && !hasSelectedService()) {
    return;
  }

  const nextStep = Math.max(0, Math.min(stepIndex, STEP_META.length - 1));
  if (nextStep !== state.currentStep) {
    Sound.step(nextStep > state.currentStep);
  }
  // Avanzar entra desde la derecha, volver desde la izquierda: el mismo
  // camino en las dos direcciones.
  document.body.dataset.stepDirection = nextStep >= state.currentStep ? "forward" : "back";
  state.currentStep = nextStep;
  renderFlow();
  if (nextStep === STEP_META.length - 1) {
    staggerReceipt();
  }
}

function getQuoteText() {
  if (!hasSelectedService()) {
    return "";
  }

  const quote = calculateQuote();
  const service = getCurrentService();

  return [
    `PRESUPUESTO - ${service.name}`,
    `Mercado: ${getMarketById(state.selectedMarket).label}`,
    `Perfil: ${getExpertiseById(state.selectedExpertise).label}`,
    `Cliente: ${getBrandTierById(state.selectedBrandTier).label}`,
    `Complejidad: ${getComplexityById(state.selectedComplexity).label}`,
    `Output: ${getOutputTypeById(state.selectedOutputType).label}`,
    "",
    `Precio sugerido: ${formatMoney(quote.suggestedUsd, "usd")} / ${formatMoney(quote.suggestedArs, "ars")}`,
    `Objetivo de horas: ${quote.totalHours.toFixed(1)}h`,
    ...(quote.benchmark
      ? [`Ventana de mercado: ${formatHours(quote.benchmark.budget.min)} a ${formatHours(quote.benchmark.budget.max)}`]
      : []),
    "",
    "Fases:",
    `- Estrategia: ${quote.breakdown.estrategia.hours.toFixed(1)}h / ${formatMoney(quote.breakdown.estrategia.usd, "usd")}`,
    `- Diseño: ${quote.breakdown.diseno.hours.toFixed(1)}h / ${formatMoney(quote.breakdown.diseno.usd, "usd")}`,
    `- Producción: ${quote.breakdown.produccion.hours.toFixed(1)}h / ${formatMoney(quote.breakdown.produccion.usd, "usd")}`,
    "",
    "Items:",
    ...quote.lineItems.map((item) => `- ${item.label}: ${item.hours.toFixed(1)}h / ${formatMoney(item.usd, "usd")}`),
    "",
    getDolarBlueLabel(),
    "Brutally Clear Branding"
  ].join("\n");
}

async function copyBreakdown() {
  if (!hasSelectedService()) {
    return;
  }

  try {
    await navigator.clipboard.writeText(getQuoteText());
    track("copiar_desglose", getQuoteDimensions());
    els.copyFeedback.textContent = "✓ Copiado";
    Sound.chip(true);
    window.setTimeout(() => {
      els.copyFeedback.textContent = "";
    }, 2000);
  } catch {
    els.copyFeedback.textContent = "No se pudo copiar. Proba de nuevo.";
  }
}

function drawTicketLine(doc, y, xStart = 12, xEnd = 93) {
  doc.setDrawColor(160, 160, 160);
  doc.setLineDashPattern([1, 2], 0);
  doc.line(xStart, y, xEnd, y);
  doc.setLineDashPattern([], 0);
}

function registerPdfFonts(doc) {
  const fontList = doc.getFontList?.() || {};

  if (!fontList.Satoshi) {
    doc.addFileToVFS("Satoshi-Variable.ttf", SATOSHI_REGULAR_BASE64);
    doc.addFont("Satoshi-Variable.ttf", "Satoshi", "normal");
    doc.addFileToVFS("Satoshi-Variable-Bold.ttf", SATOSHI_BOLD_BASE64);
    doc.addFont("Satoshi-Variable-Bold.ttf", "Satoshi", "bold");
  }

  if (!fontList.SpaceMono) {
    doc.addFileToVFS("SpaceMono-Regular.ttf", SPACE_MONO_REGULAR_BASE64);
    doc.addFont("SpaceMono-Regular.ttf", "SpaceMono", "normal");
    doc.addFileToVFS("SpaceMono-Bold.ttf", SPACE_MONO_BOLD_BASE64);
    doc.addFont("SpaceMono-Bold.ttf", "SpaceMono", "bold");
  }
}

async function getBongLogoPngDataUrl() {
  const logo = document.querySelector(".bong-logo");
  if (!logo) {
    return null;
  }

  const clone = logo.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "82");
  clone.setAttribute("height", "96");
  clone.style.color = "#12271f";

  const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);

  try {
    // Con timeout: si el navegador no dispara ni onload ni onerror sobre el
    // blob del SVG, el await queda colgado para siempre y el PDF nunca sale
    // ni avisa. Mejor exportar sin logo que no exportar.
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      const timer = window.setTimeout(() => reject(new Error("logo timeout")), 3000);
      image.onload = () => {
        window.clearTimeout(timer);
        resolve(image);
      };
      image.onerror = (error) => {
        window.clearTimeout(timer);
        reject(error);
      };
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 82;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return null;
    }

    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downloadPdf() {
  if (!hasSelectedService()) {
    return;
  }

  if (!window.jspdf?.jsPDF) {
    els.copyFeedback.textContent = "jsPDF no cargo todavia.";
    return;
  }

  const quote = calculateQuote();
  const service = getCurrentService();
  const dolarBlueMeta = getDolarBlueMeta();
  const fxMeta = getFxMeta();
  const displayCurrencyConfig = getCurrencyConfig(state.displayCurrency);
  const displayTotal = convertUsd(quote.suggestedUsd, state.displayCurrency);
  const visibleLineItems = quote.lineItems.slice(0, 6);
  const methodologyLines = [
    "PRECIOS DE REFERENCIA BASADOS EN",
    "EXPERIENCIA REAL Y CONTRASTADOS CON",
    "DATOS DE MERCADO 2025. DEBEN USARSE",
    "COMO APROXIMACION PARA EL CALCULO",
    "Y ANALISIS PROPIO."
  ];
  const benchmarkPdfLines = quote.benchmark ? 1 : 0;
  const estimatedContentBottom =
    150 + // start of metadata block
    5 * 7 + // rows
    10 + // spacer after rows divider
    8 + // fases title
    3 * 7 + // fases rows
    10 + // spacer after fases divider
    8 + // items title
    visibleLineItems.length * 6.5 +
    benchmarkPdfLines * 6;
  const footerBlockHeight = 34;
  const calculatedHeight = Math.ceil(estimatedContentBottom + footerBlockHeight + 16);
  const pdfHeight = Math.max(250, calculatedHeight);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [110, pdfHeight]
  });
  registerPdfFonts(doc);
  const exportDate = new Date().toLocaleDateString("es-AR");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pad = 12;
  const right = pageWidth - pad;
  const centerX = pageWidth / 2;
  const logoDataUrl = await getBongLogoPngDataUrl();
  const rateSourceLabel = state.displayCurrency === "ars"
    ? `FUENTE COTIZACION ${displayCurrencyConfig.code}: ${dolarBlueMeta.source.toUpperCase()}`
    : state.displayCurrency === "usd"
      ? ""
      : `FUENTE COTIZACION ${displayCurrencyConfig.code}: ${fxMeta.source.toUpperCase()}`;

  doc.setFillColor(248, 247, 243);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", centerX - 7, 14, 14, 16.4);
  }

  doc.setTextColor(30, 30, 30);
  doc.setFont("Satoshi", "bold");
  doc.setFontSize(8.5);
  doc.text("BONG STUDIO", centerX, 38, { align: "center" });
  doc.setFontSize(11.5);
  doc.text("Brutally Clear Branding", centerX, 45, { align: "center" });
  doc.setFontSize(13);
  doc.text(service.name.toUpperCase(), pad, 58);

  doc.setFont("SpaceMono", "normal");
  doc.setFontSize(7.5);
  doc.text(`FECHA ${exportDate}`, pad, 66);
  if (state.displayCurrency === "ars") {
    doc.text(`DOLAR BLUE ${Math.round(dolarBlueMeta.venta).toLocaleString("es-AR")}`, pad, 71);
    doc.text(`ACTUALIZADO ${dolarBlueMeta.fechaLabel} ${dolarBlueMeta.horaLabel}`, pad, 76);
    doc.text(rateSourceLabel, pad, 81);
  } else if (state.displayCurrency === "usd") {
    doc.text("MONEDA BASE USD", pad, 71);
    doc.text("SIN CONVERSION ADICIONAL", pad, 76);
  } else {
    doc.text(`COTIZACION ${displayCurrencyConfig.code} DESDE USD`, pad, 71);
    doc.text(`ACTUALIZADO ${fxMeta.date}`, pad, 76);
    doc.text(rateSourceLabel, pad, 81);
  }

  drawTicketLine(doc, 88, pad, right);

  const rows = [
    ["Mercado", getMarketById(state.selectedMarket).label],
    ["Cliente", getBrandTierById(state.selectedBrandTier).label],
    ["Complejidad", getComplexityById(state.selectedComplexity).label],
    ["Output", getOutputTypeById(state.selectedOutputType).label],
    ["Revisiones", getRevisionById(state.selectedRevision).label]
  ];

  let y = 108;
  doc.setFontSize(8.5);
  rows.forEach(([key, value]) => {
    doc.setFont("SpaceMono", "normal");
    doc.text(key.toUpperCase(), pad, y);
    doc.setFont("Satoshi", "normal");
    doc.text(String(value), 44, y);
    y += 7;
  });

  drawTicketLine(doc, y + 1, pad, right);
  y += 10;

  doc.setFont("Satoshi", "bold");
  doc.setFontSize(10);
  doc.text("FASES", pad, y);
  y += 8;
  doc.setFont("SpaceMono", "normal");
  [
    ["Estrategia", quote.breakdown.estrategia],
    ["Diseno", quote.breakdown.diseno],
    ["Produccion", quote.breakdown.produccion]
  ].forEach(([label, value]) => {
    doc.text(label.toUpperCase(), pad, y);
    doc.text(`${value.hours.toFixed(1)}H`, 56, y);
    doc.text(
      `${displayCurrencyConfig.code} ${formatMoney(convertUsd(value.usd, state.displayCurrency), state.displayCurrency)}`,
      right,
      y,
      { align: "right" }
    );
    y += 7;
  });

  drawTicketLine(doc, y + 1, pad, right);
  y += 10;
  doc.setFont("Satoshi", "bold");
  doc.setFontSize(10);
  doc.text("ITEMS", pad, y);
  y += 8;
  doc.setFont("SpaceMono", "normal");
  visibleLineItems.forEach((item) => {
    doc.text(item.label.toUpperCase().slice(0, 22), pad, y);
    doc.text(`${item.hours.toFixed(1)}H`, 56, y);
    doc.text(
      `${displayCurrencyConfig.code} ${formatMoney(convertUsd(item.usd, state.displayCurrency), state.displayCurrency)}`,
      right,
      y,
      { align: "right" }
    );
    y += 6.5;
  });

  drawTicketLine(doc, y + 1, pad, right);
  y += 10;

  doc.setFont("Satoshi", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL SUGERIDO", pad, y);
  y += 12;
  doc.setFont("SpaceMono", "bold");
  doc.setFontSize(20);
  doc.text(`USD ${formatMoney(quote.suggestedUsd, "usd")}`, pad, y);
  y += 8;
  doc.setFontSize(11);
  doc.text(`${displayCurrencyConfig.code} ${formatMoney(displayTotal, state.displayCurrency)}`, pad, y);
  y += 9;

  doc.setFont("SpaceMono", "normal");
  doc.setFontSize(8.5);
  doc.text(`HORAS ${quote.totalHours.toFixed(1)}`, pad, y);
  y += 6;
  doc.text(`PERFIL ${getExpertiseById(state.selectedExpertise).label.toUpperCase()}`, pad, y);

  if (quote.benchmark) {
    y += 6;
    doc.text(
      `VENTANA ${Math.round(quote.benchmark.budget.min)}-${Math.round(quote.benchmark.budget.max)} H`,
      pad,
      y
    );
  }

  const footerStartY = y + 12;
  drawTicketLine(doc, footerStartY - 5, pad, right);
  doc.setFont("Satoshi", "normal");
  doc.setFontSize(7);
  methodologyLines.forEach((line, index) => {
    doc.text(line, pad, footerStartY + index * 4.2);
  });
  doc.setFont("SpaceMono", "normal");
  doc.setFontSize(7.5);
  doc.text("BONGSTUDIO.AR", pad, footerStartY + 24.5);

  const fileDate = new Date().toISOString().slice(0, 10);
  doc.save(`presupuesto-${service.id}-${fileDate}.pdf`);
}
function bindEvents() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slider], [data-seg]");
    if (!button || button.disabled) return;

    const kind = button.dataset.slider || button.dataset.seg;
    const { list, selected } = getDialConfig(kind);
    const current = list.findIndex((item) => item.id === selected);
    const index = button.dataset.seg ? Number(button.dataset.index) : current + Number(button.dataset.dir);
    setDial(kind, index);
    syncUI();
  });

  els.currencyCycle.addEventListener("click", () => {
    const currencies = getDisplayCurrencies();
    const index = currencies.findIndex(({ id }) => id === state.displayCurrency);
    state.currencyMotionDirection = 1;
    state.displayCurrency = currencies[(index + 1) % currencies.length].id;
    syncUI();
  });

  els.editButton.addEventListener("click", () => goToStep(0));

  els.copyButton.addEventListener("click", copyBreakdown);
  // downloadPdf es async: sin este catch, cualquier falla queda como rejection
  // sin manejar y el usuario ve el boton sin respuesta.
  els.pdfButton.addEventListener("click", () => {
    // Se registra despues de resolver, asi un PDF que fallo no cuenta como
    // exportado.
    downloadPdf()
      .then(() => {
        Sound.confirm();
        track("exportar_pdf", getQuoteDimensions());
      })
      .catch((error) => {
        els.copyFeedback.textContent = "No se pudo generar el PDF.";
        console.error(error);
      });
  });
  // El link abre en pestana nueva, asi que el evento llega a irse sin
  // necesidad de sendBeacon ni de demorar la navegacion.
  els.masterclassBadge?.addEventListener("click", () => {
    track("click_masterclass", {
      paso: state.currentStep + 1,
      servicio: state.selectedService || "ninguno"
    });
  });
  els.themeToggle.addEventListener("click", toggleThemeWithTransition);
  els.soundToggle.addEventListener("click", () => {
    Sound.setEnabled(!Sound.isEnabled());
    syncSoundToggle();
    Sound.chip(true);
  });
  window.addEventListener("pointermove", updateCompassPointer);
  window.addEventListener("touchstart", updateCompassPointer, { passive: true });
  window.addEventListener("touchmove", updateCompassPointer, { passive: true });
  window.addEventListener("mousemove", updateCompassPointer);
  window.addEventListener("resize", () => {
    if (state.currentStep === 0) {
      scheduleServiceCardLayout();
    }
  });
  els.compassButton.addEventListener("click", () => {
    if (state.currentStep === STEP_META.length - 1) {
      goToStep(state.currentStep - 1);
      return;
    }

    goToStep(state.currentStep + 1);
  });
}

async function init() {
  initTheme();
  cacheDom();
  initSound();
  syncSoundToggle();
  // En el telefono el desglose del resultado vive en una hoja que asoma abajo.
  state.resultSheet = createResultSheet({
    sheet: document.querySelector("#result-sheet"),
    grab: document.querySelector("#sheet-grab"),
    body: document.querySelector("#sheet-body"),
    scrim: document.querySelector("#sheet-scrim"),
    hint: document.querySelector("#sheet-hint"),
    movable: [els.breakdown, els.resultPill, els.benchmarkSection, els.masterclassBadge],
    onOpen: staggerReceipt
  });

  try {
    await initCurrency();
    await loadPricingData();
    await loadBenchmarkData();
    initAnalytics();
    els.currencyFooter.textContent = getDolarBlueLabel();
    buildStaticUI();
    bindEvents();
    syncAddonSelection();
    ensureOutputType();
    syncUI();
    requestAnimationFrame(() => {
      document.body.classList.add("app-ready");
      setMobileInsets();
    });
  } catch (error) {
    els.copyFeedback.textContent = "No se pudieron cargar los datos de precios.";
    console.error(error);
  }
}

init();
