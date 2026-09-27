// Resultado en modo foco (solo telefono). La card del resultado scrollea
// entera y arranca como cualquier paso: debajo del header y arriba del dock.
//
// El dock sigue al scroll 1:1, como las barras de Chrome en Android o el
// "hide on scroll" de Material: cada pixel que se baja, el dock baja un pixel
// y la card se abre un pixel hacia abajo; al subir, al reves. No hay umbrales
// ni timers decidiendo: la posicion del dock es una funcion del scroll.
//
//   hidden = clamp(hidden + delta, 0, D)      D = lugar que ocupa el dock
//   hidden = min(hidden, y, max - y)          topes arriba y abajo
//
// El segundo renglon es el que hace que todo cierre. El contenido reserva
// abajo D px (el lugar del dock). A medida que se llega al final, el dock
// vuelve a entrar exactamente en lo que ese espacio reservado quedaria a la
// vista: nunca se ve aire vacio y nunca se tapa lo ultimo. Al final del todo
// la masterclass queda justo arriba del dock, como Safari que muestra sus
// barras al terminar la pagina. Arriba es igual: en el tope el dock esta.
//
// La card nunca cambia de alto (se recorta con clip-path) y el dock se mueve
// con `translate`: nada de layout mientras se scrollea, asi no hay saltos y
// iOS no corta la inercia. Al soltar a mitad de camino, el dock termina de
// entrar o salir con una animacion corta.

import { prefersReducedMotion } from "./motion.js?v=41";

const mobileQuery = window.matchMedia("(max-width: 720px)");
const GAP = 14; // aire entre la card y el dock, igual que en los otros pasos
const SETTLE_MS = 140; // sin eventos de scroll durante esto = el gesto termino

export function createResultFocus({ scroller, dock }) {
  let active = false;
  let onResultStep = false;
  let hidden = 0; // px del dock escondidos, de 0 a room
  let room = 0; // D: lo que ocupa el dock visto desde la card
  let travel = 0; // cuanto tiene que bajar el dock para salir de pantalla
  let lastY = 0;
  let frame = 0;
  let settleTimer = 0;

  function measure() {
    // Se mide con el dock en su lugar y la card sin recorte.
    scroller.style.clipPath = "none";
    dock.style.translate = "";
    // El borde de abajo de la card sale del shell, que no se anima: la card
    // entra con una escala de 0.992 y medirla en ese momento descuadra 2px.
    const shell = scroller.closest(".app-shell");
    const cardBottom = shell.getBoundingClientRect().bottom - parseFloat(getComputedStyle(shell).paddingBottom);
    const dockTop = dock.getBoundingClientRect().top;
    room = Math.max(0, Math.round(cardBottom - (dockTop - GAP)));
    travel = Math.max(0, Math.round(window.innerHeight - dockTop + 8));
    scroller.style.setProperty("--focus-room", `${room}px`);
  }

  function bounds() {
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const y = Math.min(Math.max(scroller.scrollTop, 0), max); // sin el rebote de iOS
    return { y, max };
  }

  function apply() {
    frame = 0;
    scroller.style.clipPath = `inset(0 0 ${room - hidden}px 0 round 24px)`;
    dock.style.translate = room > 0 ? `0 ${(hidden / room) * travel}px` : "";
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(apply);
  }

  function track() {
    const { y, max } = bounds();
    hidden = Math.min(Math.max(hidden + (y - lastY), 0), room);
    hidden = Math.min(hidden, y, max - y);
    lastY = y;
    schedule();

    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settle, SETTLE_MS);
  }

  // Al soltar a mitad de camino, termina hacia el lado mas cercano, siempre
  // dentro de los topes.
  function settle() {
    const { y, max } = bounds();
    const target = Math.min(hidden > room / 2 ? room : 0, y, max - y);
    if (target === hidden) return;
    hidden = target;
    const animate = !prefersReducedMotion();
    scroller.classList.toggle("is-settling", animate);
    dock.classList.toggle("is-settling", animate);
    apply();
    window.setTimeout(() => {
      scroller.classList.remove("is-settling");
      dock.classList.remove("is-settling");
    }, 300);
  }

  function reset() {
    window.clearTimeout(settleTimer);
    cancelAnimationFrame(frame);
    frame = 0;
    hidden = 0;
    lastY = 0;
    scroller.style.clipPath = "";
    scroller.style.removeProperty("--focus-room");
    dock.style.translate = "";
    scroller.classList.remove("is-settling");
    dock.classList.remove("is-settling");
  }

  function sync(isResultStep) {
    onResultStep = isResultStep;
    const shouldBeActive = mobileQuery.matches && isResultStep;
    if (shouldBeActive === active) {
      return;
    }
    active = shouldBeActive;
    document.body.classList.toggle("is-result-focus", active);
    reset();
    if (active) {
      scroller.scrollTop = 0;
      // Espera a que el layout del modo foco este aplicado para medir.
      requestAnimationFrame(() => {
        if (!active) return;
        measure();
        apply();
      });
    }
  }

  scroller.addEventListener("scroll", () => active && track(), { passive: true });
  window.addEventListener("resize", () => {
    if (!active) return;
    hidden = 0;
    lastY = bounds().y;
    measure();
    apply();
  });
  mobileQuery.addEventListener("change", () => sync(onResultStep));

  return { sync };
}
