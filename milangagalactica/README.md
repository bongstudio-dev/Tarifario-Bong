# milangagalactica · ASCII con volumen

Arte para el Instagram de milangagalactica (soy yo: fotografía, 3D, motion y
dirección de arte). Este documento resume la técnica que ya está resuelta y
abre la búsqueda de conceptos. La técnica no se toca; lo que sigue son ideas.

## Archivos

| Archivo | Qué es | Link publicado |
|---|---|---|
| `ascii-3d.html` | La técnica final: escenas 3D en WebGL dibujadas con caracteres, con panel de ajustes y linterna | https://claude.ai/artifact/2ReTYHQQrGyt5vmZDB32LW |
| `ascii-2d.html` | La serie 2D anterior. La escena "Órbita" fue la que abrió el camino | https://claude.ai/artifact/DJid3R1uLU7DGS2QBuvzNc |
| `arlequin-ascii.html` | Primera prueba del Arlequín con la misma técnica: cuatro escenas, arranca en modo Color | https://claude.ai/artifact/T2r7fWLWxU8UJ5FGRZRRTU |
| `deriva.html` | Deriva: el juego a pantalla llena, con menú hecho de caracteres. Se adapta solo: en el celu aparecen los botones táctiles, en la compu se maneja con el teclado | https://claude.ai/artifact/JKjksFR9wwbNTdnKw2mtud |

Pendiente: migrar `deriva.html` a una página https propia (fuera de claude.ai)
para que ande el giroscopio del celu. Se probó un rato en el sitio del
cotizador (#32) y se bajó (#33).

Los dos archivos abren solos en el navegador. El 3D necesita internet para
cargar Three.js (r128, desde cdnjs) y la fuente IBM Plex Mono (Google Fonts).

## La técnica

### El principio: 2D y 3D al mismo tiempo

La grilla de caracteres es una capa 2D fija encima de una escena 3D real.
Las letras nunca se mueven ni cambian de tamaño: cada una se queda en su
celda y solo cambia de carácter según la luz que recibe esa parte del objeto.

- **El 2D es la capa de texto:** grilla fija, monoespaciada, alineada. Se lee
  como tipografía.
- **El 3D vive adentro de la grilla:** en qué carácter aparece y cómo cambia de
  un cuadro al siguiente (rotación, luz, sombra, perspectiva).

Es el mismo principio de ["I made GTA in ASCII"](https://www.youtube.com/watch?v=KddYLl8LySo):
un rayo por celda, la grilla quieta, el mundo 3D solo decide qué letra va.

### Cómo funciona por dentro

1. Cada escena es un objeto 3D real en Three.js, con luces y materiales.
2. Se renderiza a una resolución mínima: el tamaño de la grilla de caracteres,
   con 2 × 2 muestras por celda para suavizar bordes.
3. Cada celda toma la luz de su canal de color más fuerte y le aplica
   exposición, contraste y gamma.
4. Si la luz queda por debajo del umbral de negro, la celda queda vacía. Ese
   vacío es el espacio negativo, y las sombras se leen como ausencia.
5. La luz elige el carácter dentro de una rampa (de `.` a `$`), con dither para
   suavizar los saltos.
6. En las celdas vacías aparecen estrellas quietas que titilan.

### Lo que no funcionó (no volver ahí)

- **Letras que se mueven en 3D.** Probé un cursor-esfera con gravedad que
  arrancaba letras y las hacía orbitar. Técnicamente andaba, pero las letras
  pasaban a ser objetos en el espacio y se perdía el 2D. Deja de ser arte.
- **Caracteres elegidos por forma** (muestrear 6 zonas por celda y elegir el
  glifo con la tinta más parecida, para que los bordes salgan como `/ \ | _`).
  Da más 3D, pero las escenas quedan como grabado técnico, más pesadas y menos
  vivas. El equilibrio se rompe hacia el 3D.
- **Cielos cargados.** En la serie 2D, los degradés de cielo llenos de
  caracteres ahogaban todo. Lo que funcionó fue negro, un elemento y un gesto.

### Interacción que respeta la grilla

Una **linterna 3D**: un foco que sale desde la cámara y apunta al cursor (o al
dedo). Alumbra el volumen real, sigue la curvatura del objeto y no aparece si
apuntás al vacío. Las letras no se mueven; solo cambian por la luz.

## Parámetros que me gustan

| Ajuste | Valor |
|---|---|
| Formato | 4:5 |
| Densidad | Baja (60 columnas × 45 filas) |
| Caracteres | Fino |
| Modo | Tinta (blanco sobre negro) |
| Dither | Ruido, al 60 % |
| Contraste | 1.80 |
| Exposición | 0.90 |
| Gamma | 2.00 |
| Umbral de negro | 17 % |
| Velocidad | 2.55× |
| Estrellas | 2.1× |
| Linterna | 1.20× |
| Apertura de la linterna | 9° |

Reglas de composición: fondo negro, mucho espacio negativo, un solo elemento,
un solo movimiento.

## Escenas que ya existen (en `ascii-3d.html`)

- **Planeta con anillos:** gira sobre su eje; el anillo pasa por delante y por
  detrás y recibe la sombra del planeta.
- **Toroide:** el donut que gira en dos ejes, guiño al donut.c de Andy Sloane.
- **Nudo:** un tubo anudado que rota.
- **Asteroide:** roca irregular de caras planas que da tumbos.
- **Giroscopio:** tres anillos anidados, cada uno en su eje, con una estrella
  quieta en el centro.
- **Sistema:** un sol que ilumina de verdad; cada planeta muestra su fase según
  dónde está.

## Conceptos para explorar

1. **Luz que revela.** Cada post es un objeto que casi no se ve, y la luz lo va
   descubriendo de a poco. El concepto es la linterna. Funciona en video y en
   carrusel.
2. **Objetos cotidianos en órbita.** Cosas comunes (una milanesa, un mate, una
   llave) tratadas como planetas, girando solas en el negro. El nombre
   milangagalactica ya propone esa mezcla de lo doméstico y lo cósmico.
3. **Un objeto, doce luces.** El mismo objeto iluminado de doce maneras, como
   una serie de grabados. Explota el equilibrio 2D/3D sin cambiar de forma.
4. **Fases.** Ciclos lentos (luna, eclipse, día y noche) donde el objeto aparece
   y desaparece en el negro. Minimalista y en loop.
5. **Córdoba en ASCII.** Lugares y objetos de Córdoba reconstruidos en volumen
   simple y vistos como si fueran otro planeta. Pistas:
   - **El cielo de Córdoba:** el Observatorio Astronómico de Córdoba (1871) y la
     Estación Astrofísica de Bosque Alegre. La ciudad tiene historia real
     mirando al espacio.
   - **El Uritorco:** el cerro de Capilla del Monte y toda su mitología de ovnis.
     Es el cruce natural entre Córdoba y lo galáctico.
   - **Las sierras:** perfiles de cerros como horizontes de otro planeta, con la
     linterna recorriendo el relieve.
   - **Íconos de la ciudad:** la Catedral, el Cabildo o el Faro del Bicentenario
     como monolitos que giran solos en el negro.

## Preguntas para arrancar la próxima conversación

- ¿Qué parte de mi trabajo de foto y 3D quiero que se cruce con esto?
- ¿La serie es de loops cortos (Reels) o de imágenes fijas (carrusel)?
- ¿Cuántos posts tiene la primera serie y con qué ritmo salen?
- ¿Hay un objeto o un lugar de Córdoba que quiera sí o sí?
