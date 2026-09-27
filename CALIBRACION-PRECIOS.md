# Calibración de precios Bong

Referencia de trabajo para ajustar el modelo sin mover horas a ciegas.
Números al 2026-09-27, salidos de `data/pricing.json`.

Convención de todas las tablas:

- complejidad `Media`, output default de cada servicio, mercado `LATAM`, 2 rondas, sin extras
- cada celda es `USD · presupuesto de horas`
- el presupuesto de horas **no** es cuánto tarda el trabajo: es el tiempo que deja
  ese precio a tarifa de mercado (`horas = precio / tarifa de referencia`). Por eso
  no cambia con el perfil.

## Cómo se arma el precio

1. **Tabla ancla** (`anchor.targets`): Branding completo × tipo de cliente × perfil.
   Todo el modelo se calibra desde acá.
2. **Horas por fase** (`H_a` estrategia, `H_b` diseño, `H_c` producción) de cada
   servicio: definen cuánto vale cada uno respecto del ancla.
3. **Tipo de cliente**, partido en dos:
   - `hours_coef` (scope: más páginas de manual, más aplicaciones). Cada servicio
     toma una parte según su `tier_hours_weight`:
     horas × (1 + peso × (hours_coef − 1)).
   - `rate_coef` (posicionamiento: lo que vale la hora) — se aplica a todo.

   | Peso | Servicios | Startup | Empresa |
   | ---: | --- | ---: | ---: |
   | 1 | Branding completo, Manual de marca | ×2,03 | ×3,26 |
   | 0,1 | Logotipo, Identidad visual | ×1,44 | ×1,76 |
   | 0 | Piezas (y Logo animado) | ×1,38 | ×1,59 |

   El manual pasa de 40 a 100 páginas, así que escala como el branding. Un logo
   para una empresa es casi el mismo logo: sube por tarifa y por un poco más de
   presentación y aplicaciones. Un post es el mismo post.

4. **Mercado**: USA ×2,0 y Europa ×1,7 sobre LATAM. No es la tarifa de un
   diseñador que vive allá: es el mismo perfil latino cobrándole a un cliente de
   afuera. No mueve el presupuesto de horas.

La fórmula vive en `app.js` (`calculateQuote`, `getBasePhaseHours`,
`getBrandTierCoefs`) y está replicada en `scripts/lib/quote.mjs`.
Si cambia una, hay que cambiar la otra.

## Tabla ancla — Branding completo

| Tipo de cliente | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Emprendimiento | 742 (obj. 700) | 1253 (obj. 1250) | 1832 (obj. 1700) | 3004 (obj. 3000) |
| Startup | 1505 (obj. 1400) | 2541 (obj. 2500) | 3717 (obj. 3600) | 6093 (obj. 6000) |
| Empresa | 2421 (obj. 2500) | 4088 (obj. 3750) | 5980 (obj. 6000) | 9803 (obj. 9000) |

Desvío máximo: 9,0% (tolerancia 10%).

## Todos los servicios

### Emprendimiento

| Servicio | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Branding completo | 742 · 54.1 h | 1253 · 54.1 h | 1832 · 54.1 h | 3004 · 54.1 h |
| Identidad visual | 490 · 37.1 h | 828 · 37.1 h | 1211 · 37.1 h | 1986 · 37.1 h |
| Manual de marca | 311 · 23.5 h | 525 · 23.5 h | 768 · 23.5 h | 1259 · 23.5 h |
| Logotipo | 197 · 14.9 h | 333 · 14.9 h | 488 · 14.9 h | 799 · 14.9 h |
| Logo animado | 103 · 8.8 h | 175 · 8.8 h | 255 · 8.8 h | 419 · 8.8 h |
| Presentación corporativa | 191 · 16.3 h | 323 · 16.3 h | 472 · 16.3 h | 774 · 16.3 h |
| Plantillas Canva x5 | 103 · 8.8 h | 175 · 8.8 h | 255 · 8.8 h | 419 · 8.8 h |
| Post animado | 65 · 5.6 h | 110 · 5.6 h | 161 · 5.6 h | 263 · 5.6 h |
| Papelería básica | 65 · 5.6 h | 110 · 5.6 h | 161 · 5.6 h | 264 · 5.6 h |
| Banner digital | 30 · 2.6 h | 51 · 2.6 h | 75 · 2.6 h | 122 · 2.6 h |
| Pieza RRSS | 21 · 1.8 h | 35 · 1.8 h | 51 · 1.8 h | 84 · 1.8 h |

### Startup

| Servicio | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Branding completo | 1505 · 79.6 h | 2541 · 79.6 h | 3717 · 79.6 h | 6093 · 79.6 h |
| Identidad visual | 709 · 38.9 h | 1196 · 38.9 h | 1750 · 38.9 h | 2869 · 38.9 h |
| Manual de marca | 631 · 34.6 h | 1065 · 34.6 h | 1559 · 34.6 h | 2555 · 34.6 h |
| Logotipo | 285 · 15.6 h | 482 · 15.6 h | 705 · 15.6 h | 1155 · 15.6 h |
| Logo animado | 143 · 8.8 h | 241 · 8.8 h | 352 · 8.8 h | 578 · 8.8 h |
| Presentación corporativa | 264 · 16.3 h | 446 · 16.3 h | 652 · 16.3 h | 1068 · 16.3 h |
| Plantillas Canva x5 | 143 · 8.8 h | 241 · 8.8 h | 352 · 8.8 h | 578 · 8.8 h |
| Post animado | 90 · 5.6 h | 151 · 5.6 h | 222 · 5.6 h | 363 · 5.6 h |
| Papelería básica | 90 · 5.6 h | 152 · 5.6 h | 223 · 5.6 h | 365 · 5.6 h |
| Banner digital | 42 · 2.6 h | 70 · 2.6 h | 103 · 2.6 h | 169 · 2.6 h |
| Pieza RRSS | 29 · 1.8 h | 48 · 1.8 h | 70 · 1.8 h | 115 · 1.8 h |

### Empresa

| Servicio | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Branding completo | 2421 · 111.0 h | 4088 · 111.0 h | 5980 · 111.0 h | 9803 · 111.0 h |
| Identidad visual | 863 · 41.0 h | 1457 · 41.0 h | 2131 · 41.0 h | 3493 · 41.0 h |
| Manual de marca | 1015 · 48.3 h | 1714 · 48.3 h | 2507 · 48.3 h | 4110 · 48.3 h |
| Logotipo | 347 · 16.5 h | 586 · 16.5 h | 858 · 16.5 h | 1406 · 16.5 h |
| Logo animado | 165 · 8.8 h | 278 · 8.8 h | 406 · 8.8 h | 666 · 8.8 h |
| Presentación corporativa | 304 · 16.3 h | 514 · 16.3 h | 752 · 16.3 h | 1233 · 16.3 h |
| Plantillas Canva x5 | 165 · 8.8 h | 278 · 8.8 h | 406 · 8.8 h | 666 · 8.8 h |
| Post animado | 104 · 5.6 h | 175 · 5.6 h | 256 · 5.6 h | 419 · 5.6 h |
| Papelería básica | 104 · 5.6 h | 176 · 5.6 h | 257 · 5.6 h | 421 · 5.6 h |
| Banner digital | 48 · 2.6 h | 81 · 2.6 h | 119 · 2.6 h | 195 · 2.6 h |
| Pieza RRSS | 33 · 1.8 h | 56 · 1.8 h | 81 · 1.8 h | 133 · 1.8 h |

## Último ajuste (2026-09-27): tipo de cliente en Identidad

- `config.tier_hours_categories` se reemplaza por `tier_hours_weight` por
  servicio. Manual de marca sigue escalando entero; Logotipo e Identidad visual
  toman el 10% del scope. Es el peso que minimiza la peor brecha contra la IA
  (10% como máximo): Logotipo Mid para Empresa pasa de USD 1088 a 586 (IA 630) e
  Identidad visual de 2702 a 1457 (IA 1250).
- `node scripts/check-ia.mjs`: 102 de 117 casos dentro del rango de la IA. Lo
  que queda afuera son piezas chicas (banner, post animado, post) arriba del
  típico, sobre todo con Empresa o USA.
- La guía `cuanto-cobrar-por-diseno` estaba desactualizada desde el ajuste de
  manual y piezas; se regeneraron sus rangos.

## Ajuste anterior (2026-09-27, contra el criterio de la IA)

- **Mercado**: USA de ×1,35 a ×2,0 y Europa de ×1,25 a ×1,7. Es la mediana por
  servicio que dio la IA para un perfil latino cobrando afuera (USA ×1,7–2,2,
  Europa ×1,5–1,9).
- **Logo animado**: ahora es solo animar un logo existente. Pasa a la categoría
  Piezas, así que el tipo de cliente le sube solo la tarifa. Mid/Emprendimiento
  sigue en USD 175 (la IA dice 180).

`node scripts/check-ia.mjs`: 98 de 117 casos dentro del rango de la IA.

## Ajuste de manual y piezas (2026-09-27)

- **Manual de marca**: fases de 1/5/10 a 2/10/20. Mid/Emprendimiento pasa de
  USD 263 · 11,8 h a USD 525 · 23,5 h, por encima del Logotipo (USD 333).
  Objetivo: USD 400–600, 20–30 h.
- **Plantillas Canva x5**: fases de 0/1/4 a 0/2,4/9,6. Mid/Emprendimiento pasa de
  USD 73 · 3,7 h a USD 175 · 8,8 h. Objetivo: USD 120–180, 8–10 h.
- **Tipo de cliente en piezas**: `hours_coef` deja de aplicarse fuera de Branding e
  Identidad. Pieza RRSS Mid para Empresa pasa de USD 114 · 3,6 h a USD 56 · 1,8 h.

## Regla de calibración

Antes de tocar horas:

1. definir el precio objetivo `Mid / Emprendimiento / complejidad Media`
2. verificar que `Junior` no quede irrealmente alto
3. verificar que `Estudio` siga defendiendo posicionamiento
4. recién después repartir horas por fase, manteniendo la proporción entre fases
5. correr `node scripts/check-benchmark.mjs` y `node scripts/check-ia.mjs`
6. actualizar estas tablas y los rangos de `cuanto-cobrar-por-diseno/index.html`
