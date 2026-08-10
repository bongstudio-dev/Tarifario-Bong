// Google Analytics 4.
//
// Poner el Measurement ID abajo para activarlo (formato G-XXXXXXXXXX, esta en
// GA4 > Admin > Flujos de datos). Mientras quede vacio no se carga ningun
// script externo ni se envia nada: la herramienta funciona igual.
//
// Los eventos mandan configuracion de cotizacion, nunca datos de la persona.
const MEASUREMENT_ID = "";

let enabled = false;

function respectsDoNotTrack() {
  return (
    navigator.doNotTrack === "1" ||
    window.doNotTrack === "1" ||
    navigator.msDoNotTrack === "1"
  );
}

export function initAnalytics() {
  if (!MEASUREMENT_ID || enabled || respectsDoNotTrack()) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  script.addEventListener("error", () => {
    // Bloqueador de anuncios o red caida: que no rompa nada.
    enabled = false;
  });
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID);
  enabled = true;
}

export function track(eventName, params = {}) {
  if (!enabled || typeof window.gtag !== "function") {
    return;
  }

  try {
    window.gtag("event", eventName, params);
  } catch (error) {
    // La medicion nunca debe tumbar la cotizacion.
    console.warn("No se pudo registrar el evento", eventName, error);
  }
}
