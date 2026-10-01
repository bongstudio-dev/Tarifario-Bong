# Dirección de arte

Cada regla dice qué, por qué y dónde aplica. Los valores (hex, formas, íconos)
están en `../marca.json` y se piden por las herramientas; acá está el criterio.

## Formas

- **Ninguna forma es arbitraria: todas descienden de la hoja del logo.**
  Por qué: la hoja de la espiga ancla el sistema al logo; una forma que no sale
  de ahí rompe el parentesco y la pieza deja de leerse como Profertil.
  Dónde: siempre. No se suman formas que no estén en el alfabeto.
- **Las formas son pregnantes solas y modulares en combinación.**
  Por qué: se diseñaron con peso visual para funcionar como máscaras y como
  ordenadores del layout, no como decoración.
  Dónde: usalas para enmarcar una foto, ordenar la página o sostener un título.
- **Una forma grande antes que muchas chicas.** *(borrador)*
  Por qué: si son pregnantes solas, tres formas compiten y ninguna ordena.
  Dónde: carteles, portadas, vía pública. El patrón es la excepción.

## Patrón

- **El patrón se genera, no se dibuja.**
  Por qué: sale de cuatro piezas a sangre (hoja, cuarto, medio, círculo)
  rotadas de a 90°; dibujarlo a mano introduce formas y ángulos que no están
  en el sistema. Dónde: siempre; con el generador web o `generar_patron`.
- **Anotá la semilla del patrón que se aprobó.** *(borrador)*
  Por qué: la misma semilla da el mismo patrón; es la forma de repetirlo en
  otra pieza o corregirlo sin rehacerlo. Dónde: piezas de campaña o serie.

## Color

- **No se eligen colores sueltos: se usa una principal, una dupla o una
  terciaria ya aprobada.**
  Por qué: Profertil tenía una paleta amplia sin jerarquía ni reglas de
  combinación; cada equipo combinaba distinto. Las combinaciones armadas sacan
  esa decisión de quien no es diseñador. Dónde: siempre.
- **Cada nivel crece desde el anterior: 3 principales, 4 duplas, 4 terciarias.**
  Por qué: la terciaria es una dupla más un tercero; si necesitás un acento,
  subís de nivel sin salir del sistema. Dónde: elegí el nivel más bajo que
  resuelva la pieza.
- **Tres duplas no sirven para texto sobre fondo.** *(borrador)*
  Por qué: verde + azul claro, amarillo + naranja y terra + verde no llegan al
  contraste mínimo (1.29, 1.72 y 2.86). Funcionan como color de formas, no
  como texto. Dónde: el texto va en tinta o blanco; chequealo con `contraste`.

## Iconografía

- **Solo íconos del set oficial.**
  Por qué: 164 íconos con trazo unificado en grilla de 24 px; uno de stock se
  nota al lado de los demás. Dónde: siempre. Si falta uno, se reporta.
- **El color del ícono dice de qué área es.**
  Por qué: las seis categorías replican las áreas reales de la compañía
  (Producción, Sostenibilidad, Comunidad, Comercial, Seguridad, Datos).
  Dónde: cuando el ícono identifica un área; en una pieza de una sola dupla,
  el ícono puede ir en el color de la dupla.

## Tipografía

- **Principal geométrica, secundaria para lectura corrida.**
  Por qué: la principal dialoga con la geometría de las formas; la secundaria
  resuelve el texto largo del manual, los informes técnicos y la comunicación
  con productores. Dónde: títulos con la principal, párrafos con la secundaria.
  *Familias pendientes de cargar.*

## Logo

- **El logotipo se conserva tal cual: no se redibuja, no se deforma, no se
  recolorea fuera de la paleta.**
  Por qué: está instalado hace veinticinco años; el diagnóstico decidió
  conservarlo porque su reconocimiento es el activo más grande de la marca.
  Dónde: siempre, con el archivo vectorial original.
- **Se respeta el área de resguardo.**
  Por qué: si algo entra en ese aire mínimo, el logo deja de leerse como logo.
  Dónde: siempre; la medida se corrigió para aplicaciones chicas en la v1.3.2.
  *Medida pendiente de cargar.*
