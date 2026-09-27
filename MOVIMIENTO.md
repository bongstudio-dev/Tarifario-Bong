# Movimiento y sonido

Cómo se mueve y cómo suena el cotizador, y por qué. El código vive en
`motion.js` (animaciones), `sound.js` (sonidos) y los tokens `--t-*`, `--ease-*`
y `--stagger` de `styles.css`. Salió del análisis de la sección de dólares de
Brubank, pasado por el sistema de Bong.

## La idea

El movimiento dirige, no decora. Cada animación responde una pregunta: qué
cambió, de dónde vino, qué sigue. Y nunca hace esperar: si la persona toca algo
en medio de una animación, esa animación sigue desde donde está.

La sensación que buscamos mezcla dos escuelas:

| De Material Design | De Liquid Glass (Apple) |
|---|---|
| Duraciones y curvas como tokens, siempre las mismas | Los objetos son fluidos: la pastilla elegida es una sola pieza que viaja y se estira, no dos que se apagan y se prenden |
| Curvas que desaceleran: arranca rápido, llega suave | Todo es interrumpible y retoma desde la posición actual |
| Press con escala: el botón se hunde al tocarlo | Estiramiento elástico en la dirección del movimiento, que se recompone al llegar |
| Transiciones con eje: avanzar entra desde la derecha, volver desde la izquierda | Los bordes se desvanecen en vez de cortar (el carrusel de monedas) |
| Primero el componente, después el contenido | Continuidad: lo que cambia se transforma en el lugar, no desaparece |

De Liquid Glass tomamos el comportamiento, no el material. No hay vidrio,
transparencias ni refracción. Las superficies siguen siendo verdes y opacas,
separadas por luz.

## Tres reglas

1. **Consecución.** Lo que pasa por un mismo toque va en orden causal: primero
   reacciona lo que tocaste, después cambia el dato y al final llega la
   explicación.
2. **Lógica narrativa.** El movimiento cuenta hacia dónde fue el valor. Si el
   precio sube, los dígitos ruedan hacia arriba. Si la pastilla va a la
   derecha, el sonido es más agudo.
3. **Suavidad sin fricción.** Duraciones cortas, curvas que desaceleran y nada
   que bloquee el input. Ninguna interacción directa pasa de 500 ms.

## Tokens

| Token | Valor | Para qué |
|---|---|---|
| `--t-instant` | 90 ms | Press de botón |
| `--t-fast` | 180 ms | Cambios de color, chips, textos que aparecen |
| `--t-base` | 280 ms | La pastilla que viaja, dígitos, relleno de chips |
| `--t-slow` | 420 ms | Cambio de paso |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Casi todo |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Desplazamientos entre pantallas |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Soltar un botón (rebote leve) |
| `--stagger` | 40 ms | Escalonado entre elementos hermanos |

`motion.js` repite las mismas cifras en `MOTION`. Si se cambia una, se cambian
las dos.

## Un cambio, de punta a punta

Qué pasa cuando alguien toca "Estudio" en el selector de perfil:

| Tiempo | Qué se ve | Qué se oye |
|---|---|---|
| 0 ms | El botón se hunde a 0,97 | tick seco |
| 0–280 ms | La pastilla viaja hacia Estudio y se estira un 8% en esa dirección | |
| 90 ms | Empiezan a rodar los dígitos del presupuesto | |
| 180 ms | El multiplicador (×1,00) aparece con fade y 4 px de subida | |
| 200 ms | La pastilla ya llegó | blip (G5 a la derecha, E5 a la izquierda); vibración leve en Android |
| ~530 ms | Terminan de rodar los dígitos | glide hacia arriba si subió, hacia abajo si bajó |

Primero el dato, después el porqué.

## Piezas

### Selector con pastilla que viaja

`renderSeg` y `renderDial` (en `app.js`) llaman a `placeSegThumb`.

- La pastilla es un solo elemento (`.seg-thumb`) detrás de los botones. Los
  botones no tienen fondo propio; solo cambian de color.
- Se mueve con `transform` y `width` por **CSS transition**, no por keyframes.
  Una transición que se interrumpe arranca desde el valor actual, que es
  justo lo que pedimos.
- El estiramiento es aparte: una animación de `scale` (1 → 1,08 → 1) con el
  origen del lado hacia el que va.
- `watchSegThumb` la reubica sin animar cuando el selector cambia de tamaño o
  aparece. Por ejemplo, al entrar a un paso: mientras el paso está oculto, los
  botones miden 0.

### Dígitos que ruedan

`rollText(elemento, texto, opciones)`.

- Compara el texto viejo con el nuevo, alineados desde la derecha (unidades
  con unidades). Solo ruedan los caracteres que cambian; los puntos de miles
  y el signo se quedan quietos si no cambian.
- Cada caracter que cambia es una columna que recorta a su alto: el nuevo
  entra, el viejo sale.
- **Dirección:** si el número sube, ruedan hacia arriba. Con `direction` se
  fuerza. Al cambiar de moneda se usa la dirección del carrusel, porque ahí
  "subir" no significa nada.
- **Odómetro:** las unidades arrancan primero y cada columna hacia la izquierda
  espera 14 ms más.
- Con `whole: true` rueda la palabra entera como una sola columna
  (Baja → Media).
- Al terminar vuelve a texto plano. Si llegó otro cambio antes, ese cierre no
  se ejecuta ni suena: manda el último.
- Si el elemento está oculto, cambia sin animar.

### La explicación llega después

`fadeSwap(elemento, texto, retraso)` cambia un texto y lo hace aparecer con
fade y 4 px de subida, por defecto a los 180 ms. Se usa para los
multiplicadores, la descripción del tipo de cliente, el contador de extras y
las horas. Si el texto no cambió, no hace nada.

### Chips de extras

Todo por CSS, en `.toggle-chip`:

- El verde crece desde el círculo del + (`clip-path: circle()`), que es donde
  cayó el dedo. Al apagarse se vacía hacia el mismo punto.
- El + gira un cuarto y se va; el tilde se dibuja (`stroke-dashoffset`).
- El texto cambia de color 40 ms después del relleno, cuando el verde ya pasó
  por debajo.

### Press

Botones circulares, selectores y chips se hunden en 90 ms (0,96 los botones,
0,97 los selectores y chips) y vuelven con `--ease-spring`. El truco es que el
`:active` pisa solo la duración:
la bajada es instantánea y la subida tiene rebote.

### Cambio de paso

- `goToStep` marca `data-step-direction` en el `body`. El paso nuevo entra
  24 px desde la derecha al avanzar y desde la izquierda al volver.
- El contenido del paso sube escalonado cada 40 ms.
- Al llegar al resultado, las filas del recibo entran de arriba hacia abajo,
  en el orden en que se leen. Solo al llegar: si se redibujan por un cambio
  de moneda, cambian en el lugar.

### Resultado en modo foco (solo teléfono)

`focus.js`. En el teléfono, la card del resultado scrollea entera (precio,
acciones, conversión, desglose, presupuesto de tiempo y masterclass), en vez de
un scroll chico adentro. Arranca como cualquier paso: debajo del header y
arriba del dock, con el mismo aire. El header no se mueve.

El dock sigue al scroll 1:1, como las barras de Chrome en Android o el "hide on
scroll" de Material. No hay umbrales ni timers decidiendo cuándo aparece: su
posición es una función del scroll.

```
hidden = clamp(hidden + delta, 0, D)   // D = lugar que ocupa el dock
hidden = min(hidden, y, max - y)       // topes arriba y abajo
```

- Cada píxel que se baja, el dock baja un píxel y la card se abre un píxel
  hacia abajo. Al subir, al revés.
- **El tope de abajo es el que hace que todo cierre.** El contenido reserva
  abajo D px, el lugar del dock. A medida que se llega al final, el dock
  vuelve a entrar exactamente en lo que ese espacio reservado quedaría a la
  vista. Nunca se ve aire vacío y nunca se tapa lo último: al final del todo,
  la masterclass queda justo arriba del dock. Es lo que hace Safari, que
  muestra sus barras al terminar la página, y tiene sentido narrativo: al
  terminar de leer vuelve lo que sigue, la navegación.
- El tope de arriba hace lo mismo: en el tope, el dock está.
- Si se suelta a mitad de camino, el dock termina de entrar o de salir hacia
  el lado más cercano, con una transición de 280 ms. Mientras el dedo
  scrollea no hay transición: sigue al scroll.
- La card nunca cambia de alto: mide siempre el alto completo y se recorta
  con `clip-path`. El dock se mueve con `translate`, que compone con su
  animación de entrada. Nada toca el layout mientras se scrollea, así no hay
  saltos y iOS no corta la inercia.
- El rebote elástico de iOS en los bordes se descarta (el scroll se acota a
  `0..max` antes de calcular).
- En desktop no cambia nada.

### Carrusel de monedas

Las monedas vecinas viven en una ventana con la forma de la pastilla
(`.currency-window`) y una máscara que las desvanece hacia los bordes. Se
insinúa qué hay antes y después sin que nada asome afuera.

## Sonido

Micro sonidos sintetizados con Web Audio, sin archivos. Si nadie los nota
conscientemente pero la UI se siente mejor, están bien calibrados.

- **Una sola escala:** pentatónica mayor en Do, una octava arriba del Do
  central (C6 a C7). Cualquier combinación suena armónica, y en ese registro
  suena liviano.
- **Timbre de campanita de vidrio.** Cada nota es una sine más un parcial
  inarmónico a ×2,76 (el de una barra o una copa) a un cuarto del volumen, que
  dura la mitad. Por eso suena a cristal y no a "bip". Ataque de 4 ms, sin
  click, y caída exponencial que se desvanece en vez de cortarse.
- **Salen con el evento visual, no con el toque.** El blip suena cuando llega
  la pastilla, el glide cuando terminan los dígitos. La excepción es el tick,
  que acompaña al hundimiento.
- **Lo que avanza sube de tono y lo que retrocede baja.**

| Evento | Sonido | Gain |
|---|---|---|
| Hundir un botón | toque de cristal, G7, 35 ms | 0,006 |
| Llega la pastilla | campanita G6 a la derecha / E6 a la izquierda, 140 ms | 0,018 |
| Terminan los dígitos | campanita que resbala C6 → E6 si sube, E6 → C6 si baja, 160 ms | 0,014 |
| Prender o apagar un extra, copiar | dos campanitas C6 + G6 (al revés al apagar), 60 ms entre sí | 0,016 |
| Cambiar de paso | ruido filtrado, 4,2 kHz al avanzar y 3 kHz al volver, 90 ms | 0,008 |
| Exportar el PDF | arpegio C6–E6–G6–C7, la última nota con cola larga | 0,02 |

Para escucharlos uno por uno: `sonido-test.html` (sin links, no se indexa).
Abajo tiene un diagnóstico por si en algún teléfono no suena.

Reglas:

- Cada tipo de sonido suena como mucho una vez cada 40 ms. No se apilan.
- Si una animación se interrumpe, su sonido de llegada no suena.
- **iOS:** el audio solo se habilita adentro del gesto, con `touchend` o
  `click`. `unlock()` reanuda el contexto ahí y toca un buffer mudo. Se
  escucha en cada gesto, porque iOS vuelve a suspender el audio cuando la
  pestaña pasa a segundo plano.
- **Modo silencio:** en Safari se usa la sesión `ambient`. Respeta el switch
  de silencio del iPhone y no corta la música que la persona tenga sonando.
  Con el iPhone en silencio, el cotizador no suena, y así tiene que ser.
- El botón de parlante del header prende y apaga todo. La preferencia se
  guarda en `localStorage` (`bong-sound`).
- Nada suena en hover ni en scroll.

## Accesibilidad

Con `prefers-reduced-motion: reduce`:

- No hay desplazamientos ni escalas. La pastilla salta a su lugar y los
  dígitos cambian sin rodar.
- Se mantiene el cruce de color en 180 ms, así el cambio de estado se sigue
  viendo.
- Los sonidos se mantienen, porque no son movimiento.

## Para sumar una animación nueva

1. ¿Qué pregunta responde? Si no responde ninguna, no va.
2. ¿En qué lugar de la secuencia cae? Reacción (0 ms), dato (~90 ms) o
   explicación (~180 ms).
3. Usar los tokens. Nada de duraciones sueltas.
4. Si se puede interrumpir, que sea con transición CSS o que retome desde el
   estado actual. Nunca reiniciar.
5. Si lleva sonido, que salga cuando el evento visual termina y que respete el
   throttle.
6. Revisar `prefers-reduced-motion`.

## Cómo probar

- **Tocar rápido y repetido.** Seis cambios de perfil en medio segundo: la
  pastilla tiene que terminar en la opción correcta, el número en su valor
  final, y sonar un solo blip y un solo glide.
- **Movimiento reducido.** Emularlo en DevTools (Rendering → Emulate CSS media
  feature `prefers-reduced-motion`).
- **Volumen.** Con auriculares y con el parlante del teléfono, el switch de
  silencio apagado y el volumen a mitad: se tiene que percibir apenas.
