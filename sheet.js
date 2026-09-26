// Hoja del resultado (solo telefono). El precio, las acciones y la conversion
// quedan fijos en la card; el desglose vive en una hoja que asoma abajo con el
// Total y se arrastra hacia arriba para leerla a todo el alto.
//
// - Dos posiciones: asomada y abierta. Se suelta y busca la mas cercana, o la
//   que indique la velocidad del gesto.
// - Interrumpible: si se agarra en medio de una animacion, arranca desde donde
//   esta, no desde la posicion de destino.
// - Cerrada, toda la hoja es superficie de arrastre y un toque la abre.
//   Abierta, se arrastra desde la manija y el contenido scrollea.

import { prefersReducedMotion } from "./motion.js?v=28";
import { Sound } from "./sound.js?v=28";

const mobileQuery = window.matchMedia("(max-width: 720px)");
const FLICK_VELOCITY = 0.45; // px/ms: por encima, manda la direccion del gesto
const TAP_SLOP = 6;

export function createResultSheet({ sheet, grab, body, scrim, hint, movable, onOpen }) {
  // Donde vive cada pieza en desktop, para devolverla si se agranda la ventana.
  const homes = movable.map((node) => ({ node, parent: node.parentNode, next: node.nextSibling }));
  const safeProbe = document.createElement("div");
  safeProbe.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden";
  document.body.append(safeProbe);

  let active = false; // telefono + paso resultado
  let onResultStep = false;
  let open = false;
  let y = 0;
  let drag = null;

  const closedY = () => sheet.offsetHeight - peekHeight();

  function peekHeight() {
    const total = body.querySelector(".receipt-row");
    const totalHeight = total ? total.offsetHeight : 54;
    return grab.offsetHeight + totalHeight + 22 + safeProbe.offsetHeight;
  }

  function currentY() {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(sheet).transform);
    return matrix.m42;
  }

  function place(value, animate) {
    y = value;
    sheet.classList.toggle("is-animating", Boolean(animate) && !prefersReducedMotion());
    sheet.style.transform = `translateY(${value}px)`;
    const closed = closedY();
    const progress = closed > 0 ? Math.max(0, Math.min(1, 1 - value / closed)) : 0;
    scrim.style.opacity = String(progress);
    hint.style.opacity = String(Math.max(0, 1 - progress * 2.5));
  }

  function setOpen(value, { sound = true } = {}) {
    const changed = value !== open;
    open = value;
    sheet.classList.toggle("is-open", value);
    grab.setAttribute("aria-expanded", String(value));
    scrim.style.pointerEvents = value ? "auto" : "none";
    if (!value) {
      body.scrollTop = 0;
    }
    place(value ? 0 : closedY(), true);
    if (changed) {
      if (sound) Sound.step(value);
      if (value) onOpen?.();
    }
  }

  function moveContent(toSheet) {
    if (toSheet) {
      movable.forEach((node) => body.append(node));
    } else {
      homes.forEach(({ node, parent, next }) => parent.insertBefore(node, next && next.parentNode === parent ? next : null));
    }
  }

  // Se llama en cada renderFlow. Solo actua cuando cambia algo.
  function sync(isResultStep) {
    onResultStep = isResultStep;
    const shouldBeActive = mobileQuery.matches && isResultStep;
    document.body.classList.toggle("is-result-sheet", shouldBeActive);

    if (shouldBeActive === active) {
      return;
    }
    active = shouldBeActive;

    if (active) {
      sheet.hidden = false;
      scrim.hidden = false;
      open = false;
      sheet.classList.remove("is-open");
      grab.setAttribute("aria-expanded", "false");
      document.documentElement.style.setProperty("--sheet-peek", `${peekHeight()}px`);
      // Entra desde abajo hasta quedar asomada.
      place(sheet.offsetHeight, false);
      void sheet.offsetWidth;
      place(closedY(), true);
    } else {
      open = false;
      sheet.classList.remove("is-open");
      scrim.style.pointerEvents = "none";
      scrim.style.opacity = "0";
      sheet.hidden = true;
      scrim.hidden = true;
    }
  }

  // --- Arrastre ---
  function onPointerDown(event) {
    if (!active || event.button > 0) return;
    const fromGrab = grab.contains(event.target);
    if (open && !fromGrab) return; // abierta, el contenido scrollea
    drag = { startY: event.clientY, from: currentY(), t: performance.now(), moved: false, id: event.pointerId };
    place(drag.from, false);
    sheet.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dy) > TAP_SLOP) drag.moved = true;
    const closed = closedY();
    let next = drag.from + dy;
    // Resistencia en los topes: se puede pasar un poco, pero cuesta.
    if (next < 0) next = next / 3;
    if (next > closed) next = closed + (next - closed) / 3;
    place(next, false);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.startY;
    const velocity = dy / Math.max(1, performance.now() - drag.t);
    const moved = drag.moved;
    drag = null;
    if (!moved) {
      setOpen(!open);
    } else if (Math.abs(velocity) > FLICK_VELOCITY) {
      setOpen(velocity < 0);
    } else {
      setOpen(y < closedY() / 2);
    }
  }

  function onPointerCancel() {
    if (!drag) return;
    drag = null;
    setOpen(open, { sound: false });
  }

  sheet.addEventListener("pointerdown", onPointerDown);
  sheet.addEventListener("pointermove", onPointerMove);
  sheet.addEventListener("pointerup", onPointerUp);
  sheet.addEventListener("pointercancel", onPointerCancel);
  grab.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(!open);
    }
  });
  scrim.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active && open) setOpen(false);
  });

  window.addEventListener("resize", () => {
    if (!active) return;
    document.documentElement.style.setProperty("--sheet-peek", `${peekHeight()}px`);
    place(open ? 0 : closedY(), false);
  });

  function applyMode() {
    moveContent(mobileQuery.matches);
    sync(onResultStep);
  }
  mobileQuery.addEventListener("change", applyMode);
  applyMode();

  return { sync, close: () => active && setOpen(false) };
}

