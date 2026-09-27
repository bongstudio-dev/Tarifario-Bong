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
   Fija los coeficientes de perfil y el producto horas × tarifa de cada tipo de
   cliente.
2. **Horas por fase** (`H_a` estrategia, `H_b` diseño, `H_c` producción) de cada
   servicio: definen cuánto vale respecto del ancla.
3. **Perfil**: Junior ×0,50, Senior ×1,82 y Estudio ×2,82 sobre Mid en branding.
   El salto pesa menos donde se paga menos criterio: cada servicio lo modula con
   su `expertise_weight`, como exponente alrededor de Mid
   (Mid × (coef / Mid)^peso). Mid queda fijo.

   | Peso | Servicios | Junior | Senior | Estudio |
   | ---: | --- | ---: | ---: | ---: |
   | 1 | Branding completo, Logotipo | ×0,50 | ×1,82 | ×2,82 |
   | 0,95 | Identidad visual | ×0,52 | ×1,76 | ×2,68 |
   | 0,9 | Manual de marca, Presentación | ×0,54 | ×1,71 | ×2,54 |
   | 0,85 | Papelería, Logo animado | ×0,55 | ×1,66 | ×2,41 |
   | 0,8 | Post animado | ×0,57 | ×1,61 | ×2,29 |
   | 0,75 | Pieza RRSS, Banner, Plantillas Canva | ×0,59 | ×1,57 | ×2,17 |

4. **Tipo de cliente**, partido en dos:
   - `rate_coef` (posicionamiento): Startup ×1,20 y Empresa ×1,43. Se aplica a
     todo; en una pieza suelta es lo único que cambia.
   - `hours_coef` (alcance: más páginas de manual, más aplicaciones): Startup
     ×1,325 y Empresa ×1,875. Cada servicio toma una parte según su
     `tier_hours_weight`: horas × (1 + peso × (hours_coef − 1)).

   | Peso | Servicios | Startup | Empresa |
   | ---: | --- | ---: | ---: |
   | 1,2 | Manual de marca | ×1,67 | ×2,93 |
   | 1 | Branding completo | ×1,59 | ×2,68 |
   | 0,4 | Identidad visual | ×1,36 | ×1,93 |
   | 0,3 | Logotipo | ×1,32 | ×1,81 |
   | 0 | Piezas (y Logo animado) | ×1,20 | ×1,43 |

   El manual es lo que más crece con el cliente (de 40 a más de 100 páginas).

5. **Mercado**: USA ×2,0 y Europa ×1,7 sobre LATAM. No es la tarifa de un
   diseñador que vive allá: es el mismo perfil latino cobrándole a un cliente de
   afuera. No mueve el presupuesto de horas.
6. **Ejes chicos**: complejidad Baja ×0,77 y Alta ×1,42 sobre Media; rondas
   (1 / 3 / +3) suman 0% / 35% / 60% de las horas de diseño y producción, contra
   15% con 2 rondas; salida Motion ×1,4 e Interactivo ×1,9.

La fórmula vive en `app.js` (`calculateQuote`, `getBasePhaseHours`,
`getBrandTierCoefs`, `getProfileCoef`) y está replicada en `scripts/lib/quote.mjs`.
Si cambia una, hay que cambiar la otra.

## Tabla ancla — Branding completo

| Tipo de cliente | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Emprendimiento | 550 (obj. 550) | 1100 (obj. 1100) | 1999 (obj. 2000) | 3099 (obj. 3100) |
| Startup | 874 (obj. 875) | 1748 (obj. 1750) | 3178 (obj. 3180) | 4927 (obj. 4930) |
| Empresa | 1474 (obj. 1475) | 2948 (obj. 2950) | 5360 (obj. 5360) | 8308 (obj. 8300) |

Desvío máximo: 0,1% (tolerancia 10%).

## Todos los servicios

### Emprendimiento

| Servicio | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Branding completo | 550 · 47.5 h | 1100 · 47.5 h | 1999 · 47.5 h | 3099 · 47.5 h |
| Identidad visual | 363 · 31.4 h | 701 · 31.4 h | 1236 · 31.4 h | 1874 · 31.4 h |
| Manual de marca | 300 · 25.1 h | 559 · 25.1 h | 957 · 25.1 h | 1420 · 25.1 h |
| Logotipo | 179 · 16.0 h | 358 · 16.0 h | 651 · 16.0 h | 1009 · 16.0 h |
| Logo animado | 102 · 9.3 h | 183 · 9.3 h | 305 · 9.3 h | 442 · 9.3 h |
| Presentación corporativa | 143 · 13.5 h | 266 · 13.5 h | 456 · 13.5 h | 676 · 13.5 h |
| Plantillas Canva x5 | 90 · 7.7 h | 152 · 7.7 h | 238 · 7.7 h | 331 · 7.7 h |
| Papelería básica | 60 · 5.5 h | 108 · 5.5 h | 180 · 5.5 h | 261 · 5.5 h |
| Post animado | 40 · 3.5 h | 70 · 3.5 h | 113 · 3.5 h | 160 · 3.5 h |
| Banner digital | 20 · 1.7 h | 33 · 1.7 h | 52 · 1.7 h | 73 · 1.7 h |
| Pieza RRSS | 15 · 1.3 h | 25 · 1.3 h | 39 · 1.3 h | 54 · 1.3 h |

### Startup

| Servicio | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Branding completo | 874 · 63.0 h | 1748 · 63.0 h | 3178 · 63.0 h | 4927 · 63.0 h |
| Identidad visual | 492 · 35.5 h | 950 · 35.5 h | 1676 · 35.5 h | 2542 · 35.5 h |
| Manual de marca | 500 · 34.8 h | 932 · 34.8 h | 1596 · 34.8 h | 2368 · 34.8 h |
| Logotipo | 236 · 17.6 h | 471 · 17.6 h | 857 · 17.6 h | 1328 · 17.6 h |
| Logo animado | 122 · 9.3 h | 220 · 9.3 h | 365 · 9.3 h | 530 · 9.3 h |
| Presentación corporativa | 171 · 13.5 h | 319 · 13.5 h | 547 · 13.5 h | 811 · 13.5 h |
| Plantillas Canva x5 | 108 · 7.7 h | 182 · 7.7 h | 286 · 7.7 h | 397 · 7.7 h |
| Papelería básica | 72 · 5.5 h | 130 · 5.5 h | 216 · 5.5 h | 314 · 5.5 h |
| Post animado | 48 · 3.5 h | 84 · 3.5 h | 135 · 3.5 h | 192 · 3.5 h |
| Banner digital | 24 · 1.7 h | 40 · 1.7 h | 63 · 1.7 h | 87 · 1.7 h |
| Pieza RRSS | 18 · 1.3 h | 30 · 1.3 h | 47 · 1.3 h | 65 · 1.3 h |

### Empresa

| Servicio | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Branding completo | 1474 · 89.1 h | 2948 · 89.1 h | 5360 · 89.1 h | 8308 · 89.1 h |
| Identidad visual | 700 · 42.4 h | 1352 · 42.4 h | 2386 · 42.4 h | 3618 · 42.4 h |
| Manual de marca | 878 · 51.4 h | 1638 · 51.4 h | 2805 · 51.4 h | 4162 · 51.4 h |
| Logotipo | 323 · 20.3 h | 646 · 20.3 h | 1175 · 20.3 h | 1821 · 20.3 h |
| Logo animado | 145 · 9.3 h | 262 · 9.3 h | 436 · 9.3 h | 632 · 9.3 h |
| Presentación corporativa | 204 · 13.5 h | 381 · 13.5 h | 652 · 13.5 h | 967 · 13.5 h |
| Plantillas Canva x5 | 129 · 7.7 h | 217 · 7.7 h | 340 · 7.7 h | 473 · 7.7 h |
| Papelería básica | 86 · 5.5 h | 155 · 5.5 h | 258 · 5.5 h | 374 · 5.5 h |
| Post animado | 57 · 3.5 h | 100 · 3.5 h | 161 · 3.5 h | 229 · 3.5 h |
| Banner digital | 28 · 1.7 h | 48 · 1.7 h | 75 · 1.7 h | 104 · 1.7 h |
| Pieza RRSS | 21 · 1.3 h | 36 · 1.3 h | 56 · 1.3 h | 78 · 1.3 h |

## Historial (2026-09-27)

1. **Manual y Canva**: Manual de 1/5/10 a 2/10/20 (quedaba por debajo del
   Logotipo); Canva x5 de 0/1/4 a 0/2,4/9,6. El tipo de cliente deja de sumar
   horas en piezas.
2. **Mercado y Logo animado**: USA ×2,0 y Europa ×1,7 (perfil latino cobrando
   afuera); Logo animado es solo animar un logo existente y pasa a Piezas.
3. **Identidad**: peso de alcance por servicio (`tier_hours_weight`).
4. **Recalibración general**: tabla ancla de Estudio −15% (3.000 / 6.000 / 9.000
   → 2.550 / 5.100 / 7.650, coeficiente 1,0 → 0,85); tipo de cliente repartido
   entre tarifa y alcance sin mover el ancla; complejidad Alta, rondas y salidas
   ajustadas; horas por fase de cada servicio recalibradas.

5. **Tabla ancla nueva**: Emprendimiento 550 / 1.100 / 2.000 / 3.100; Startup
   875 / 1.750 / 3.180 / 4.930; Empresa 1.475 / 2.950 / 5.360 / 8.300. Junior y
   Mid bajan, Senior sube y Estudio vuelve a 3.100 en Emprendimiento. Se suma el
   peso de perfil por servicio (`expertise_weight`) para que el salto entre
   perfiles de un branding no se traslade entero a las piezas.

## Regla de calibración

1. Si cambia el nivel del branding, cambiar la tabla ancla, no las horas del
   branding.
2. Para el resto de los servicios, mover horas por fase (manteniendo la
   proporción entre fases) o el coeficiente del eje que corresponda.
3. Correr `node scripts/check-benchmark.mjs`: ancla dentro del 10%, monotonía y
   presupuesto de horas independiente del perfil.
4. Actualizar estas tablas y los rangos de `cuanto-cobrar-por-diseno/index.html`.
