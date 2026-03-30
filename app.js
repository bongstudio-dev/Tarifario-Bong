import {
  convertUsd,
  getCurrencyConfig,
  getDisplayCurrencies,
  getDolarBlueLabel,
  getDolarBlueMeta,
  getFxMeta,
  initCurrency,
  usdToArs
} from "./currency.js";
import {
  SATOSHI_BOLD_BASE64,
  SATOSHI_REGULAR_BASE64,
  SPACE_MONO_BOLD_BASE64,
  SPACE_MONO_REGULAR_BASE64
} from "./pdf-fonts.js";

const CATEGORY_ICONS = {
  Branding: `
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="4.5"></circle>
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"></circle>
    </svg>
  `,
  Identidad: `
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 2.5 13.5 8 8 13.5 2.5 8Z"></path>
      <path d="M8 5.25 10.75 8 8 10.75 5.25 8Z" fill="currentColor" stroke="none"></path>
    </svg>
  `,
  Piezas: `
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 3h10v10H3Z"></path>
      <path d="M5.5 5.5h5v5h-5Z" fill="currentColor" stroke="none"></path>
    </svg>
  `
};

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
  selectedService: null,
  selectedMarket: "latam",
  selectedExpertise: "mid",
  selectedComplexity: "mid",
  selectedRevision: "2",
  selectedOutputType: null,
  selectedAddons: new Set(),
  serviceOrder: [],
  displayCurrency: "ars",
  currencyMotionDirection: 1,
  currentStep: 0,
  hasTouchedService: false
};

const els = {};
const serviceCardsById = new Map();
const serviceSlotPositions = [];
const serviceSlotNodes = [];
const SERVICE_CARD_GAP = 10;
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

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("bong-theme", theme);
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

function initTheme() {
  const storedTheme = localStorage.getItem("bong-theme");
  const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(storedTheme || (preferredDark ? "dark" : "light"));
}

function cacheDom() {
  els.typeGrid = document.querySelector("#type-grid");
  els.marketSelect = document.querySelector("#market-select");
  els.levelPills = document.querySelector("#level-pills");
  els.includedDeliverables = document.querySelector("#included-deliverables");
  els.deliverablesGrid = document.querySelector("#deliverables-grid");
  els.deliverablesCopy = document.querySelector("#deliverables-copy");
  els.complexityRange = document.querySelector("#complexity-range");
  els.revisionsRange = document.querySelector("#revisions-range");
  els.complexityLabel = document.querySelector("#complexity-label");
  els.revisionsLabel = document.querySelector("#revisions-label");
  els.resultPrice = document.querySelector("#result-price");
  els.resultServiceTitle = document.querySelector("#result-service-title");
  els.resultRange = document.querySelector("#result-range");
  els.resultMeta = document.querySelector("#result-meta");
  els.breakdown = document.querySelector("#breakdown");
  els.copyButton = document.querySelector("#copy-button");
  els.pdfButton = document.querySelector("#pdf-button");
  els.copyFeedback = document.querySelector("#copy-feedback");
  els.themeToggle = document.querySelector("#theme-toggle");
  els.currencyToggle = document.querySelector("#currency-toggle");
  els.currencyFooter = document.querySelector("#currency-footer");
  els.dockStep = document.querySelector("#dock-step");
  els.timeline = document.querySelector("#timeline");
  els.currentStepName = document.querySelector("#current-step-name");
  els.compassButton = document.querySelector("#compass-button");
  els.stepScreens = Array.from(document.querySelectorAll(".step-screen"));
}

async function loadPricingData() {
  const response = await fetch("./data/pricing.json");
  if (!response.ok) {
    throw new Error("No se pudo cargar pricing.json");
  }

  state.pricingData = await response.json();
  state.selectedService = null;
  state.selectedOutputType = null;
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

function getDefaultCurrencyForMarket(marketId) {
  return DEFAULT_CURRENCY_BY_MARKET[marketId] || "usd";
}

function getCurrentService() {
  return state.selectedService ? getServiceById(state.selectedService) : null;
}

function selectService(service) {
  els.compassButton?.style.setProperty("--compass-rotation-from", getCompassRotation());
  state.selectedService = service.id;
  state.selectedOutputType = service.default_output_type;
  state.hasTouchedService = true;
  syncAddonSelection();
  syncUI();
  animateCompassReady();
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
  if (!state.selectedOutputType) {
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

function getBasePhaseHours() {
  return getAllSelectedLineItems().reduce(
    (acc, item) => {
      acc.a += item.H_a;
      acc.b += item.H_b;
      acc.c += item.H_c;
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
  const multiplier = expertise.coef * complexity.coef * outputType.coef * market.coef * Y;
  const phaseValuesUsd = {
    a: phaseHours.a * X_a * multiplier,
    b: phaseHours.b * X_b * multiplier,
    c: phaseHours.c * X_c * multiplier
  };
  const suggestedUsd = phaseValuesUsd.a + phaseValuesUsd.b + phaseValuesUsd.c;
  const suggestedArs = usdToArs(suggestedUsd);

  const lineItems = getAllSelectedLineItems().map((item) => {
    const hours = item.H_a + item.H_b + item.H_c;
    const baseValue = item.H_a * X_a + item.H_b * X_b + item.H_c * X_c;
    const usd = baseValue * multiplier;
    return {
      label: item.label,
      hours,
      usd,
      ars: usdToArs(usd)
    };
  });

  const revisionValueUsd = (revisionHours.design * X_b + revisionHours.production * X_c) * multiplier;

  if (revisionValueUsd > 0) {
    lineItems.push({
      label: getRevisionById(state.selectedRevision).label,
      hours: revisionHours.design + revisionHours.production,
      usd: revisionValueUsd,
      ars: usdToArs(revisionValueUsd)
    });
  }

  return {
    suggestedUsd,
    suggestedArs,
    totalHours: phaseHours.a + phaseHours.b + phaseHours.c,
    phaseHours,
    breakdown: {
      estrategia: { usd: phaseValuesUsd.a, ars: usdToArs(phaseValuesUsd.a), hours: phaseHours.a },
      diseno: { usd: phaseValuesUsd.b, ars: usdToArs(phaseValuesUsd.b), hours: phaseHours.b },
      produccion: { usd: phaseValuesUsd.c, ars: usdToArs(phaseValuesUsd.c), hours: phaseHours.c }
    },
    lineItems
  };
}

function createServiceCard(service) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "type-card";
  button.dataset.type = service.id;
  button.innerHTML = `
    <span class="type-card-mark" aria-hidden="true">${CATEGORY_ICONS[service.category] || CATEGORY_ICONS.Branding}</span>
    <span class="type-card-title">${service.name}</span>
  `;
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

  const inset = 0;
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

    if (cursorX > inset && cursorX + width > gridWidth) {
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
  serviceSlotPositions.forEach((slot) => {
    if (slot.id === exceptId) {
      return;
    }
    const card = serviceCardsById.get(slot.id);
    if (!card) {
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

function createPill({ id, label, included = false }, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pill";
  button.dataset.value = id;
  button.textContent = label;

  if (included) {
    button.classList.add("is-included");
  } else if (onClick) {
    button.addEventListener("click", onClick);
  }

  return button;
}

function buildStaticUI() {
  state.serviceOrder = state.pricingData.services.map((service) => service.id);

  state.pricingData.services.forEach((service) => {
    els.typeGrid.appendChild(createServiceCard(service));
  });

  state.pricingData.markets.forEach((market) => {
    const option = document.createElement("option");
    option.value = market.id;
    option.textContent = market.label;
    els.marketSelect.appendChild(option);
  });

  state.pricingData.expertise
    .slice()
    .sort((a, b) => EXPERTISE_ORDER.indexOf(a.id) - EXPERTISE_ORDER.indexOf(b.id))
    .forEach((expertise) => {
      const normalizedExpertise = {
        ...expertise,
        label: expertise.id === "std" ? "Estudio" : expertise.label
      };
      const pill = createPill(normalizedExpertise, () => {
        state.selectedExpertise = normalizedExpertise.id;
        syncUI();
      });
      els.levelPills.appendChild(pill);
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

function renderDeliverables() {
  const service = getCurrentService();
  els.includedDeliverables.innerHTML = "";
  els.deliverablesGrid.innerHTML = "";

  if (!service) {
    els.deliverablesCopy.textContent = "Primero elegí un servicio para destrabar outputs y extras.";
    return;
  }

  state.pricingData.output_types.forEach((outputType) => {
    const pill = createPill(outputType, () => {
      state.selectedOutputType = outputType.id;
      syncUI();
    });
    pill.classList.toggle("active", state.selectedOutputType === outputType.id);
    els.includedDeliverables.appendChild(pill);
  });

  getOptionalAddons().forEach((deliverable) => {
    const pill = createPill({ id: deliverable.id, label: deliverable.label }, () => {
      if (state.selectedAddons.has(deliverable.id)) {
        state.selectedAddons.delete(deliverable.id);
      } else {
        state.selectedAddons.add(deliverable.id);
      }
      syncUI();
    });
    pill.classList.toggle("active", state.selectedAddons.has(deliverable.id));
    els.deliverablesGrid.appendChild(pill);
  });

  els.deliverablesCopy.textContent = `${service.name}: elegi el formato de salida y sumá solo los extras que cambian horas reales.`;
}

function animateValue(element, nextValue) {
  const currentValue = Number(element.dataset.rawValue || 0);
  const target = Math.round(nextValue);
  const start = performance.now();
  const duration = 280;

  if (currentValue === target) {
    element.textContent = formatMoney(target, state.displayCurrency);
    element.dataset.rawValue = String(target);
    return;
  }

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = currentValue + (target - currentValue) * eased;
    element.textContent = formatMoney(value, state.displayCurrency);

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      element.dataset.rawValue = String(target);
    }
  }

  requestAnimationFrame(frame);
}

function renderMeta() {
  if (!hasSelectedService()) {
    els.resultMeta.innerHTML = "";
    return;
  }

  const chips = [
    `Mercado: ${getMarketById(state.selectedMarket).label}`,
    `Perfil: ${getExpertiseById(state.selectedExpertise).label}`,
    `Complejidad: ${getComplexityById(state.selectedComplexity).label}`,
    `Output: ${getOutputTypeById(state.selectedOutputType).label}`
  ];

  els.resultMeta.innerHTML = chips.map((chip) => `<span class="meta-chip">${chip}</span>`).join("");
}

function renderBreakdown(quote) {
  const phaseRows = Object.entries(quote.breakdown).map(([phase, amount]) => `
    <div class="breakdown-row">
      <span class="phase"><span class="phase-dot"></span>${phase === "estrategia" ? "Estrategia" : phase === "diseno" ? "Diseno" : "Produccion"} · ${amount.hours.toFixed(1)}h</span>
      <span class="amount">${formatMoney(convertUsd(amount.usd, state.displayCurrency), state.displayCurrency)}</span>
    </div>
  `);

  const lineRows = quote.lineItems.map((item) => `
    <div class="breakdown-row breakdown-row-subtle">
      <span class="phase">${item.label} · ${item.hours.toFixed(1)}h</span>
      <span class="amount">${formatMoney(convertUsd(item.usd, state.displayCurrency), state.displayCurrency)}</span>
    </div>
  `);

  els.breakdown.innerHTML = [...phaseRows, ...lineRows].join("");
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
    els.resultPrice.textContent = "ARS 0";
    els.resultPrice.dataset.rawValue = "0";
    els.resultRange.textContent = "Elegí un servicio para calcular el presupuesto.";
    els.breakdown.innerHTML = "";
    els.resultMeta.innerHTML = "";
    renderCurrencyToggle();
    els.copyButton.disabled = true;
    els.pdfButton.disabled = true;
    return;
  }

  const quote = calculateQuote();
  els.resultServiceTitle.textContent = getCurrentService().name;
  animateValue(els.resultPrice, convertUsd(quote.suggestedUsd, state.displayCurrency));
  els.resultRange.textContent = `Total estimado: ${quote.totalHours.toFixed(1)} horas · ${getRevisionById(state.selectedRevision).label}`;
  renderMeta();
  renderBreakdown(quote);
  renderCurrencyToggle();
  els.copyButton.disabled = false;
  els.pdfButton.disabled = false;
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
}

function syncUI() {
  ensureOutputType();
  els.marketSelect.value = state.selectedMarket;
  els.complexityRange.value = String(state.pricingData.complexity.findIndex((item) => item.id === state.selectedComplexity) + 1);
  els.revisionsRange.value = String(state.pricingData.revisions.findIndex((item) => item.id === state.selectedRevision) + 1);
  els.complexityLabel.textContent = getComplexityById(state.selectedComplexity).label;
  els.revisionsLabel.textContent = getRevisionById(state.selectedRevision).label;
  els.resultPrice.dataset.rawValue = "";

  document.querySelectorAll(".type-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.type === state.selectedService);
  });

  document.querySelectorAll("#level-pills .pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.value === state.selectedExpertise);
  });

  renderDeliverables();
  renderResult();
  renderFlow();
}

function goToStep(stepIndex) {
  if (stepIndex > 0 && !hasSelectedService()) {
    return;
  }

  state.currentStep = Math.max(0, Math.min(stepIndex, STEP_META.length - 1));
  renderFlow();
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
    `Complejidad: ${getComplexityById(state.selectedComplexity).label}`,
    `Output: ${getOutputTypeById(state.selectedOutputType).label}`,
    "",
    `Precio sugerido: ${formatMoney(quote.suggestedUsd, "usd")} / ${formatMoney(quote.suggestedArs, "ars")}`,
    `Horas totales: ${quote.totalHours.toFixed(1)}h`,
    "",
    "Fases:",
    `- Estrategia: ${quote.breakdown.estrategia.hours.toFixed(1)}h / ${formatMoney(quote.breakdown.estrategia.usd, "usd")}`,
    `- Diseno: ${quote.breakdown.diseno.hours.toFixed(1)}h / ${formatMoney(quote.breakdown.diseno.usd, "usd")}`,
    `- Produccion: ${quote.breakdown.produccion.hours.toFixed(1)}h / ${formatMoney(quote.breakdown.produccion.usd, "usd")}`,
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
    els.copyFeedback.textContent = "✓ Copiado";
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
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
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
    "EXPERIENCIA REAL. NO REFLEJAN",
    "NECESARIAMENTE VARIABLES DE MERCADO Y",
    "DEBEN USARSE COMO APROXIMACION PARA EL",
    "CALCULO Y ANALISIS PROPIO."
  ];
  const estimatedContentBottom =
    150 + // start of metadata block
    4 * 7 + // rows
    10 + // spacer after rows divider
    8 + // fases title
    3 * 7 + // fases rows
    10 + // spacer after fases divider
    8 + // items title
    visibleLineItems.length * 6.5;
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
  els.marketSelect.addEventListener("change", (event) => {
    state.selectedMarket = event.target.value;
    state.displayCurrency = getDefaultCurrencyForMarket(state.selectedMarket);
    syncUI();
  });

  els.complexityRange.addEventListener("input", (event) => {
    const index = Number(event.target.value) - 1;
    state.selectedComplexity = state.pricingData.complexity[index].id;
    syncUI();
  });

  els.revisionsRange.addEventListener("input", (event) => {
    const index = Number(event.target.value) - 1;
    state.selectedRevision = state.pricingData.revisions[index].id;
    syncUI();
  });

  els.copyButton.addEventListener("click", copyBreakdown);
  els.pdfButton.addEventListener("click", downloadPdf);
  els.themeToggle.addEventListener("click", toggleThemeWithTransition);
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

  try {
    await initCurrency();
    await loadPricingData();
    els.currencyFooter.textContent = getDolarBlueLabel();
    buildStaticUI();
    bindEvents();
    syncAddonSelection();
    ensureOutputType();
    syncUI();
    requestAnimationFrame(() => {
      document.body.classList.add("app-ready");
    });
  } catch (error) {
    els.copyFeedback.textContent = "No se pudieron cargar los datos de precios.";
    console.error(error);
  }
}

init();
