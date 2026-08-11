// Lo unico que la guia necesita: el tema compartido con el cotizador, el
// acordeon del FAQ y la aparicion escalonada al scrollear. Sin dependencias y
// sin modulos: es una pagina de contenido, no la app.

const THEME_KEY = "bong-theme";
const OPEN_DURATION = 320;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* Tema ---------------------------------------------------------------- */

// El data-theme ya lo dejo puesto el script inline del head; aca solo queda
// mantener el toggle y el color de la barra del navegador.
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const themeColor = theme === "dark" ? "#004831" : "#f4f1ea";
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.content = themeColor;
  });
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    /* Modo privado: el tema vale para esta pagina y nada mas. */
  }
}

const themeToggle = document.querySelector("#theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
}

/* Acordeon ------------------------------------------------------------ */

// <details> no anima solo: hay que abrirlo, medir el alto real y recien ahi
// animar de 0 a ese alto. Al cerrar va al reves y el open se saca al final,
// porque sacarlo antes esconde el contenido de golpe.
function setupAccordion(item) {
  const summary = item.querySelector(".faq-question");
  const panel = item.querySelector(".faq-answer");
  if (!summary || !panel) return;

  summary.addEventListener("click", (event) => {
    event.preventDefault();

    if (reducedMotion.matches) {
      item.open = !item.open;
      return;
    }

    if (item.dataset.animating) return;
    item.dataset.animating = "1";

    const finish = () => {
      panel.style.height = "";
      delete item.dataset.animating;
    };

    if (item.open) {
      panel.style.height = `${panel.scrollHeight}px`;
      requestAnimationFrame(() => {
        panel.style.height = "0px";
      });
      window.setTimeout(() => {
        item.open = false;
        finish();
      }, OPEN_DURATION);
      return;
    }

    item.open = true;
    const target = panel.scrollHeight;
    panel.style.height = "0px";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.style.height = `${target}px`;
      });
    });
    window.setTimeout(finish, OPEN_DURATION);
  });
}

const faqItems = [...document.querySelectorAll(".faq-item")];
faqItems.forEach(setupAccordion);

// Con el link directo a una pregunta (/…#faq-logo) hay que abrirla, si no la
// persona aterriza en un titulo plegado y parece que la pagina no cargo.
function openFromHash() {
  const id = window.location.hash.slice(1);
  if (!id) return;
  const target = document.getElementById(id);
  if (target?.classList.contains("faq-item")) {
    target.open = true;
  }
}

openFromHash();
window.addEventListener("hashchange", openFromHash);

/* Aparicion ----------------------------------------------------------- */

// El estado oculto lo pone el CSS con .reveal-ready (clase que agrega el head).
// Si no esta, o no hay IntersectionObserver, esto no corre y ya se ve todo.
if (document.documentElement.classList.contains("reveal-ready")) {
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        let step = 0;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          // El escalonado se cuenta por tanda, no por posicion en la pagina:
          // sirve para las 3 o 4 cosas que entran juntas al viewport.
          entry.target.style.animationDelay = `${Math.min(step * 70, 280)}ms`;
          entry.target.classList.add("is-revealed");
          step += 1;
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 }
    );

    document
      .querySelectorAll(".guide-inner > *, .faq-item")
      .forEach((el) => observer.observe(el));
  } else {
    document.documentElement.classList.remove("reveal-ready");
  }
}
