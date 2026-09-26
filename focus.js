// Resultado en modo foco (solo telefono). Toda la pantalla del resultado es
// una sola pagina que scrollea entera, en vez de un scroll chico adentro de
// la card. Al bajar, el header sube y el dock baja para dejar todo el alto al
// desglose; al volver a subir, reaparecen. Mientras estan escondidos queda una
// pastilla chica para editar.

const mobileQuery = window.matchMedia("(max-width: 720px)");
const THRESHOLD = 6; // px de scroll antes de decidir la direccion
const TOP_ZONE = 24; // cerca del tope el header siempre esta

export function createResultFocus({ scroller, pill, onEdit }) {
  let active = false;
  let onResultStep = false;
  let lastY = 0;

  function setChromeHidden(hidden) {
    document.body.classList.toggle("is-chrome-hidden", hidden);
    pill.tabIndex = hidden ? 0 : -1;
    pill.setAttribute("aria-hidden", String(!hidden));
  }

  function onScroll() {
    const y = scroller.scrollTop;
    if (y <= TOP_ZONE) {
      setChromeHidden(false);
    } else if (y > lastY + THRESHOLD) {
      setChromeHidden(true);
    } else if (y < lastY - THRESHOLD) {
      setChromeHidden(false);
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
    setChromeHidden(false);
  }

  scroller.addEventListener("scroll", () => active && onScroll(), { passive: true });
  pill.addEventListener("click", () => onEdit?.());
  mobileQuery.addEventListener("change", () => sync(onResultStep));
  setChromeHidden(false);

  return { sync };
}
