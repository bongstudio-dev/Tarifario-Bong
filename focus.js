// Resultado en modo foco (solo telefono). La card del resultado scrollea
// entera, en vez de un scroll chico adentro. Arranca como cualquier paso:
// debajo del header y arriba del dock, con su aire. Al bajar, el dock se
// esconde y la card se abre hacia abajo (un recorte, no un cambio de alto:
// ver styles.css); el header se queda. Al subir, el dock vuelve.

const mobileQuery = window.matchMedia("(max-width: 720px)");
const THRESHOLD = 6; // px de scroll antes de decidir la direccion
const TOP_ZONE = 24; // cerca del tope el dock siempre esta

export function createResultFocus({ scroller }) {
  let active = false;
  let onResultStep = false;
  let lastY = 0;

  function setDockHidden(hidden) {
    document.body.classList.toggle("is-dock-hidden", hidden);
  }

  function onScroll() {
    const y = scroller.scrollTop;
    const max = scroller.scrollHeight - scroller.clientHeight;
    // El rebote elastico de iOS en los bordes no es la persona scrolleando:
    // al volver del rebote de abajo, el dock no tiene que aparecer.
    if (y < 0 || y > max) {
      return;
    }
    if (y <= TOP_ZONE) {
      setDockHidden(false);
    } else if (y > lastY + THRESHOLD) {
      setDockHidden(true);
    } else if (y < lastY - THRESHOLD && y < max - 1) {
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
    setDockHidden(false);
  }

  scroller.addEventListener("scroll", () => active && onScroll(), { passive: true });
  mobileQuery.addEventListener("change", () => sync(onResultStep));

  return { sync };
}
