// Microinteracciones del cotizador. El movimiento dirige, no decora: cada
// animacion responde que cambio y hacia donde, en orden causal (primero
// reacciona lo que tocaste, despues el dato, al final la explicacion) y nunca
// bloquea el input. Todo es interrumpible: si llega otro cambio a mitad de
// camino, arranca desde el estado actual.

import { Sound } from "./sound.js?v=30";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export const MOTION = {
  instant: 90,
  fast: 180,
  base: 280,
  stagger: 40,
  easeOut: "cubic-bezier(0.22, 1, 0.36, 1)"
};

export function prefersReducedMotion() {
  return reducedMotion.matches;
}

function numericValue(text) {
  const digits = String(text).replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

const rollTokens = new WeakMap();

// Rolling de digitos: solo ruedan los caracteres que cambian, alineados desde
// la derecha (unidades con unidades). Si el valor sube ruedan hacia arriba, si
// baja hacia abajo. Con `whole`, la palabra entera rueda como una sola columna
// (Baja -> Media).
export function rollText(element, next, { direction = 0, delay = 0, whole = false, sound = false } = {}) {
  const prev = element.dataset.rollValue ?? element.textContent;
  element.dataset.rollValue = next;

  if (prev === next) {
    return;
  }

  const token = {};
  rollTokens.set(element, token);

  if (!prev || prefersReducedMotion() || !element.isConnected || element.offsetParent === null) {
    element.textContent = next;
    return;
  }

  const dir = direction || Math.sign(numericValue(next) - numericValue(prev)) || 1;
  const from = dir > 0 ? "100%" : "-100%";
  const to = dir > 0 ? "-100%" : "100%";
  const columns = whole ? [[prev, next]] : alignFromRight(prev, next);

  element.textContent = "";
  element.setAttribute("aria-label", next);
  let longest = 0;

  columns.forEach(([oldChar, newChar], index) => {
    if (oldChar === newChar) {
      element.append(document.createTextNode(newChar));
      return;
    }

    const column = document.createElement("span");
    column.className = "roll";
    column.setAttribute("aria-hidden", "true");
    const incoming = document.createElement("span");
    incoming.className = "roll-in";
    incoming.textContent = newChar;
    const outgoing = document.createElement("span");
    outgoing.className = "roll-out";
    outgoing.textContent = oldChar;
    column.append(incoming, outgoing);
    element.append(column);

    // Odometro: las unidades arrancan primero y el cambio sube hacia la
    // izquierda, 14ms por columna.
    const lag = whole ? 0 : (columns.length - 1 - index) * 14;
    const timing = { duration: MOTION.base, delay: delay + lag, easing: MOTION.easeOut, fill: "both" };
    incoming.animate({ transform: [`translateY(${from})`, "translateY(0)"] }, timing);
    outgoing.animate({ transform: ["translateY(0)", `translateY(${to})`], opacity: [1, 0] }, timing);
    longest = Math.max(longest, delay + lag + MOTION.base);
  });

  // Al terminar vuelve a texto plano, salvo que ya haya arrancado otro cambio.
  // Recien ahi suena: si el rolling se interrumpe, su llegada no suena.
  window.setTimeout(() => {
    if (rollTokens.get(element) === token) {
      element.textContent = next;
      element.removeAttribute("aria-label");
      if (sound) {
        if (dir > 0) Sound.up();
        else Sound.down();
      }
    }
  }, longest + 20);
}

function alignFromRight(prev, next) {
  const width = Math.max(prev.length, next.length);
  const a = prev.padStart(width, "\u0000");
  const b = next.padStart(width, "\u0000");
  const columns = [];
  for (let i = 0; i < width; i += 1) {
    if (b[i] === "\u0000") continue;
    columns.push([a[i] === "\u0000" ? "" : a[i], b[i]]);
  }
  return columns;
}

// La explicacion llega despues del dato: fade + 4px hacia arriba, con retraso.
export function fadeSwap(element, text, delay = MOTION.fast) {
  if (element.textContent === text) {
    return;
  }

  element.textContent = text;
  if (prefersReducedMotion() || element.offsetParent === null) {
    return;
  }

  element.animate(
    { opacity: [0, 1], transform: ["translateY(4px)", "translateY(0)"] },
    { duration: MOTION.fast, delay, easing: MOTION.easeOut, fill: "backwards" }
  );
}

// Selector de opciones con pastilla que se desliza. La posicion va por CSS
// transition, que al interrumpirse retoma desde donde esta. Mientras viaja se
// estira un 8% en la direccion del movimiento y se recompone al llegar.
export function placeSegThumb(container, { animate = true } = {}) {
  let thumb = container.querySelector(":scope > .seg-thumb");
  if (!thumb) {
    thumb = document.createElement("span");
    thumb.className = "seg-thumb";
    thumb.setAttribute("aria-hidden", "true");
    container.prepend(thumb);
    animate = false;
  }

  const active = container.querySelector(".is-active");
  if (!active || container.offsetParent === null) {
    thumb.style.opacity = active ? thumb.style.opacity : "0";
    return;
  }

  const left = active.offsetLeft;
  const width = active.offsetWidth;
  const prevLeft = Number(thumb.dataset.left ?? left);
  thumb.dataset.left = String(left);
  const moved = left !== prevLeft;

  if (!animate || prefersReducedMotion()) {
    thumb.classList.add("is-snapping");
    thumb.style.transform = `translateX(${left}px)`;
    thumb.style.width = `${width}px`;
    thumb.style.opacity = "1";
    void thumb.offsetWidth;
    thumb.classList.remove("is-snapping");
    return;
  }

  thumb.style.transform = `translateX(${left}px)`;
  thumb.style.width = `${width}px`;
  thumb.style.opacity = "1";

  if (moved) {
    const toRight = left > prevLeft;
    thumb.style.transformOrigin = toRight ? "left center" : "right center";
    thumb.animate({ scale: ["1 1", "1.08 1", "1 1"] }, { duration: MOTION.base, easing: MOTION.easeOut });
    // Blip y vibracion cuando la pastilla llega, no al tocar. Si se vuelve a
    // tocar antes, la llegada anterior no suena.
    window.clearTimeout(arrivals.get(container));
    arrivals.set(container, window.setTimeout(() => {
      Sound.toggle(toRight);
      vibrate();
    }, ARRIVAL_MS));
  }
}

// La transicion es de 280ms con ease-out: a los 200ms ya se ve llegada.
const ARRIVAL_MS = 200;
const arrivals = new WeakMap();

// Reubica sin animar cuando el selector cambia de tamano o aparece (al entrar
// a un paso, al rotar el telefono).
const thumbObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver((entries) => entries.forEach(({ target }) => placeSegThumb(target, { animate: false })))
  : null;

export function watchSegThumb(container) {
  if (thumbObserver && !container.dataset.thumbWatched) {
    container.dataset.thumbWatched = "true";
    thumbObserver.observe(container);
  }
}

// Vibracion leve, solo donde exista (Android).
function vibrate() {
  if (typeof navigator.vibrate === "function" && !prefersReducedMotion()) {
    navigator.vibrate(8);
  }
}
