const FALLBACK_BLUE = {
  compra: 1415,
  venta: 1435,
  fechaActualizacion: "2026-03-18T19:05:00.000Z"
};

const FALLBACK_FX = {
  base: "USD",
  rates: {
    EUR: 0.92,
    BRL: 5.03,
    UYU: 39.1,
    CLP: 968,
    MXN: 17.2,
    COP: 3910
  },
  date: "2026-03-18",
  source: "frankfurter.dev"
};

const BLUE_CACHE_KEY = "bong-dolar-blue";
const FX_CACHE_KEY = "bong-fx-rates";
const CACHE_TTL_MS = 60 * 60 * 1000;
const FX_QUOTES = ["EUR", "BRL", "UYU", "CLP", "MXN", "COP"];

const DISPLAY_CURRENCIES = [
  { id: "usd", label: "USD", code: "USD", locale: "en-US" },
  { id: "ars", label: "ARS", code: "ARS", locale: "es-AR" },
  { id: "eur", label: "EUR", code: "EUR", locale: "de-DE" },
  { id: "brl", label: "BRL", code: "BRL", locale: "pt-BR" },
  { id: "uyu", label: "UYU", code: "UYU", locale: "es-UY" },
  { id: "clp", label: "CLP", code: "CLP", locale: "es-CL" },
  { id: "mxn", label: "MXN", code: "MXN", locale: "es-MX" },
  { id: "cop", label: "COP", code: "COP", locale: "es-CO" }
];

let blueRate = {
  ...FALLBACK_BLUE,
  timestamp: 0
};

let fxRates = {
  ...FALLBACK_FX,
  timestamp: 0
};

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, payload) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    console.warn(`No se pudo persistir el cache ${key}`, error);
  }
}

async function initBlueRate() {
  const cached = readCache(BLUE_CACHE_KEY);
  const now = Date.now();

  if (cached) {
    blueRate = cached;
  }

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return blueRate;
  }

  try {
    const response = await fetch("https://dolarapi.com/v1/dolares/blue", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("No se pudo consultar dolarapi.com");
    }

    const data = await response.json();
    blueRate = {
      compra: data.compra,
      venta: data.venta,
      fechaActualizacion: data.fechaActualizacion,
      timestamp: now
    };
    writeCache(BLUE_CACHE_KEY, blueRate);
  } catch {
    if (!cached) {
      blueRate = { ...FALLBACK_BLUE, timestamp: now };
    }
  }

  return blueRate;
}

async function initFxRates() {
  const cached = readCache(FX_CACHE_KEY);
  const now = Date.now();

  if (cached) {
    fxRates = cached;
  }

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return fxRates;
  }

  try {
    const response = await fetch(
      `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${FX_QUOTES.join(",")}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("No se pudo consultar frankfurter.dev");
    }

    const data = await response.json();
    const rates = {};
    data.forEach((entry) => {
      rates[entry.quote] = entry.rate;
    });

    fxRates = {
      base: "USD",
      rates,
      date: data[0]?.date || FALLBACK_FX.date,
      source: "frankfurter.dev",
      timestamp: now
    };
    writeCache(FX_CACHE_KEY, fxRates);
  } catch {
    if (!cached) {
      fxRates = { ...FALLBACK_FX, timestamp: now };
    }
  }

  return fxRates;
}

export async function initCurrency() {
  await Promise.all([initBlueRate(), initFxRates()]);
  return { blueRate, fxRates };
}

export function getDisplayCurrencies() {
  return DISPLAY_CURRENCIES;
}

export function convertUsd(amountUsd, currencyId) {
  if (currencyId === "usd") {
    return amountUsd;
  }

  if (currencyId === "ars") {
    return amountUsd * blueRate.venta;
  }

  const currency = DISPLAY_CURRENCIES.find((item) => item.id === currencyId);
  const rate = currency ? fxRates.rates[currency.code] : null;
  return rate ? amountUsd * rate : amountUsd;
}

export function usdToArs(amountUsd) {
  return convertUsd(amountUsd, "ars");
}

export function getCurrencyConfig(currencyId) {
  return DISPLAY_CURRENCIES.find((item) => item.id === currencyId) || DISPLAY_CURRENCIES[0];
}

export function getDolarBlueLabel() {
  const date = new Date(blueRate.fechaActualizacion);
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  const relativeText = diffMinutes < 60
    ? `hace ${diffMinutes} min`
    : `hace ${Math.round(diffMinutes / 60)} h`;

  return `Dólar blue: $${Math.round(blueRate.venta).toLocaleString("es-AR")} · Actualizado ${relativeText}`;
}

export function getDolarBlueMeta() {
  const date = new Date(blueRate.fechaActualizacion);

  return {
    compra: blueRate.compra,
    venta: blueRate.venta,
    fechaActualizacion: blueRate.fechaActualizacion,
    fechaLabel: date.toLocaleDateString("es-AR"),
    horaLabel: date.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit"
    }),
    source: "dolarapi.com"
  };
}

export function getFxMeta() {
  return {
    base: fxRates.base,
    date: fxRates.date,
    source: fxRates.source,
    rates: fxRates.rates
  };
}
