// Micro sonidos del cotizador. Acompanan al movimiento, no lo reemplazan: si
// nadie los nota conscientemente pero la UI se siente mejor, estan bien.
//
// - Sintetizados con Web Audio, sin archivos.
// - Todos salen de la pentatonica mayor en Do, una octava arriba del Do
//   central (C6), asi cualquier combinacion suena armonica. Lo que avanza sube
//   de tono, lo que retrocede baja.
// - Timbre de campanita de vidrio: cada nota lleva, muy bajo, un parcial
//   inarmonico (x2.76, el de una barra o una copa) que se apaga antes que la
//   fundamental. Es lo que hace que suene a cristal y no a "bip".
// - Suenan en el mismo instante que el evento visual (llega la pastilla,
//   terminan de rodar los digitos), no al tocar. La excepcion es el tick de
//   press, que acompana al hundimiento del boton.
// - El AudioContext nace en el primer toque: antes el navegador lo bloquea.

const STORAGE_KEY = "bong-sound";
const NOTE = { C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, C7: 2093 };
const GLASS_PARTIAL = 2.76; // parcial de una barra libre: suena a cristal
const MIN_GAP_MS = 40;

let ctx = null;
let master = null;
let enabled = readPreference();
const lastPlayed = new Map();

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function init() {
  if (ctx) {
    return ctx;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  // "ambient" en Safari: respeta el modo silencio del iPhone y no corta la
  // musica que la persona tenga sonando.
  if (navigator.audioSession) {
    try {
      navigator.audioSession.type = "ambient";
    } catch {
      // Safari viejo sin audioSession editable: sigue con el default.
    }
  }

  ctx = new AudioContextClass();
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  return ctx;
}

// Los sonidos no se apilan: cada tipo suena como mucho una vez cada 40ms.
function throttled(kind) {
  const now = performance.now();
  if (now - (lastPlayed.get(kind) ?? -Infinity) < MIN_GAP_MS) {
    return true;
  }
  lastPlayed.set(kind, now);
  return false;
}

// Si el contexto todavia no corre (iOS lo deja suspendido hasta un gesto
// valido), el sonido se saltea: programarlo igual lo deja en cola y suena
// tarde, amontonado con otros, cuando el audio arranca.
function ready(kind) {
  if (!enabled || !init()) {
    return false;
  }
  if (ctx.state !== "running") {
    ctx.resume().catch(() => {});
    return false;
  }
  return !throttled(kind);
}

// iOS solo destraba el audio adentro del gesto mismo, y con touchend o click
// (pointerdown no le alcanza). Ahi se reanuda el contexto y se toca un buffer
// mudo de un sample, el truco clasico para que Safari lo de por habilitado.
// Se escucha en cada gesto porque iOS vuelve a suspender el audio cuando la
// pestana pasa a segundo plano ("interrupted").
// El buffer mudo se toca en cada intento hasta que el contexto corre: antes
// se marcaba como hecho en el primer pointerdown, que iOS no toma como gesto,
// y en el touchend (el que si vale) ya no se repetia.
function unlock() {
  if (!init() || ctx.state === "running") {
    return;
  }
  ctx.resume().catch(() => {});
  const silence = ctx.createBufferSource();
  silence.buffer = ctx.createBuffer(1, 1, 22050);
  silence.connect(ctx.destination);
  silence.start(0);
}

// Una nota de campanita. Ataque de 4ms (sin click, sin "pique") y caida
// exponencial larga, que se desvanece en vez de cortarse. El parcial de
// cristal va a un cuarto del volumen y dura la mitad. Con `to`, la nota
// resbala hacia otra (los glides del precio).
function bell({ freq, to, dur = 0.16, gain = 0.02, delay = 0 }) {
  const t = ctx.currentTime + delay;
  voice({ freq, to, t, dur, gain });
  voice({ freq: freq * GLASS_PARTIAL, to: to && to * GLASS_PARTIAL, t, dur: dur * 0.5, gain: gain * 0.25 });
}

function voice({ freq, to, t, dur, gain }) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (to) {
    osc.frequency.exponentialRampToValueAtTime(to, t + Math.min(dur, 0.09));
  }
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Ruido filtrado para el cambio de paso: un aire, no un golpe.
function swish({ center, dur = 0.09, gain = 0.008 }) {
  const t = ctx.currentTime;
  const length = Math.ceil(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = center;
  band.Q.value = 0.9;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  source.connect(band).connect(env).connect(master);
  source.start(t);
  source.stop(t + dur + 0.02);
}

export const Sound = {
  // Press de boton: un toque de cristal minimo, casi una textura.
  tick() {
    if (ready("tick")) bell({ freq: NOTE.C7 * 1.5, dur: 0.035, gain: 0.006 });
  },
  // La pastilla del selector llega: G6 hacia la derecha, E6 hacia la izquierda.
  toggle(toRight) {
    if (ready("toggle")) bell({ freq: toRight ? NOTE.G6 : NOTE.E6, dur: 0.14, gain: 0.018 });
  },
  // Terminan de rodar los digitos del precio: resbala hacia arriba o abajo.
  up() {
    if (ready("price")) bell({ freq: NOTE.C6, to: NOTE.E6, dur: 0.16, gain: 0.014 });
  },
  down() {
    if (ready("price")) bell({ freq: NOTE.E6, to: NOTE.C6, dur: 0.16, gain: 0.014 });
  },
  // Un extra se prende (sube) o se apaga (baja): dos notas de cristal.
  chip(on) {
    if (!ready("chip")) return;
    const [first, second] = on ? [NOTE.C6, NOTE.G6] : [NOTE.G6, NOTE.C6];
    bell({ freq: first, dur: 0.12, gain: 0.016 });
    bell({ freq: second, dur: 0.16, gain: 0.016, delay: 0.06 });
  },
  // Cambio de paso: un aire muy bajo, mas agudo al avanzar que al volver.
  step(forward) {
    if (ready("step")) swish({ center: forward ? 4200 : 3000 });
  },
  // Cierre del relato: el presupuesto exportado. Unico momento con melodia.
  confirm() {
    if (!ready("confirm")) return;
    [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7].forEach((freq, i) =>
      bell({ freq, dur: i === 3 ? 0.4 : 0.2, gain: 0.02, delay: i * 0.05 })
    );
  },
  isEnabled() {
    return enabled;
  },
  setEnabled(value) {
    enabled = value;
    try {
      localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
    } catch {
      // Sin storage la preferencia dura lo que dura la pestana.
    }
  }
};

// Tick en cada boton que se hunde. Solo con puntero real, no en hover.
const PRESSABLE = ".dial-btn, .action-btn, .dial-seg-btn, .toggle-chip, .floating-compass, .type-card, .currency-nav, .currency-item, .dock-btn";

export function initSound() {
  ["touchend", "click", "keydown"].forEach((type) =>
    document.addEventListener(type, unlock, { capture: true, passive: true })
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      unlock();
      const target = event.target.closest(PRESSABLE);
      if (target && !target.disabled) {
        Sound.tick();
      }
    },
    { passive: true }
  );
}
