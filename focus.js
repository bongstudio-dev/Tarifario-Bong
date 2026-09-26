// Resultado en modo foco (solo telefono). La card del resultado scrollea
// entera, en vez de un scroll chico adentro. Arranca como cualquier paso:
// debajo del header y arriba del dock, con su aire. Al bajar, el dock se
// esconde y el borde de abajo de la card baja a ocupar ese lugar; el header
// se queda y el espacio de arriba no cambia. Al subir, el dock vuelve.

const mobileQuery = window.matchMedia("(max-width: 720px)");
const THRESHOLD = 6; // px de scroll antes de decidir la direccion
const TOP_ZONE = 24; // cerca del tope el dock siempre esta

export function createResultFocus({ scroller }) {
  let active = false;
  let onResultStep = false;
  let lastY = 0;
  let lastHeight = 0;

  function setDockHidden(hidden) {
    document.body.classList.toggle("is-dock-hidden", hidden);
  }

  function onScroll() {
    const y = scroller.scrollTop;
    // Cuando la card crece o se achica, el navegador corrige el scroll solo.
    // Ese movimiento no es de la persona: si se leyera, al fondo de la pagina
    // el dock se esconderia y volveria en loop.
    if (scroller.clientHeight !== lastHeight) {
      lastHeight = scroller.clientHeight;
      lastY = y;
      return;
    }
    if (y <= TOP_ZONE) {
      setDockHidden(false);
    } else if (y > lastY + THRESHOLD) {
      setDockHidden(true);
    } else if (y < lastY - THRESHOLD) {
      setDockHidden(false);
    } else {
      return;
    }
    lastY = y;
  }

  function sync(isResultStep) {
    onResultStep = isResultStep;
    const shouldBeActive = mobileQuery.matches && isResultStep;
    if (shouldBeActive === active) {
      return;
    }
    active = shouldBeActive;
    document.body.classList.toggle("is-result-focus", active);
    scroller.scrollTop = 0;
    lastY = 0;
    lastHeight = scroller.clientHeight;
    setDockHidden(false);
  }

  scroller.addEventListener("scroll", () => active && onScroll(), { passive: true });
  mobileQuery.addEventListener("change", () => sync(onResultStep));

  return { sync };
}
