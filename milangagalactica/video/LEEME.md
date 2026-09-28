# Videos de Deriva (9:16)

Grabaciones del juego a 1080 × 1920, 30 fps, con un piloto automático que
maneja solo. Los MP4 no se guardan en el repo por el peso.

- `grabar.js`: arma cada escena (laberinto, avenida, monte, nada, horizonte),
  maneja con el piloto automático y manda cada cuadro a ffmpeg.
- `cambios-para-grabar.diff`: lo que se le cambia a `deriva.html` para grabar
  (formato 9:16 fijo, tiempo cuadro por cuadro, cámara alta tipo dron, ojos
  más cerca en la nada, tipografía local).

Para volver a grabar hace falta Playwright con Chromium, Three.js r128 y la
tipografía IBM Plex Mono al lado de la página de grabación, y ffmpeg con
libx264. El video completo se arma uniendo los cinco clips con fundidos a
negro de 0,6 s.
