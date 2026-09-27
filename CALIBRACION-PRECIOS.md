# Calibración de precios Bong

Referencia de trabajo para ajustar el modelo sin mover horas a ciegas.
Números al 2026-09-27, salidos de `data/pricing.json`.

**Criterio:** el cotizador tiene que dar valores parecidos a los que da una IA.
Mucha gente compara el número contra ChatGPT, y si no se parecen, la herramienta
pierde confianza. `node scripts/check-ia.mjs` mide esa distancia; la tabla ancla
fija el nivel del branding.

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
   servicio: definen cuánto vale respecto del ancla. Están calibradas para que
   cada servicio quede, en la mediana de sus casos, en el típico de la IA.
3. **Tipo de cliente**, partido en dos:
   - `rate_coef` (posicionamiento): Startup ×1,20 y Empresa ×1,43. Se aplica a todo
     y es lo que la IA le da a una pieza suelta.
   - `hours_coef` (alcance: más páginas de manual, más aplicaciones): Startup ×1,64
     y Empresa ×2,17. Cada servicio toma una parte según su `tier_hours_weight`:
     horas × (1 + peso × (hours_coef − 1)).

   | Peso | Servicios | Startup | Empresa |
   | ---: | --- | ---: | ---: |
   | 1 | Branding completo | ×1,97 | ×3,10 |
   | 0,8 | Manual de marca | ×1,81 | ×2,77 |
   | 0,25 | Identidad visual | ×1,39 | ×1,85 |
   | 0,2 | Logotipo | ×1,35 | ×1,76 |
   | 0 | Piezas (y Logo animado) | ×1,20 | ×1,43 |

4. **Mercado**: USA ×2,0 y Europa ×1,7 sobre LATAM. No es la tarifa de un
   diseñador que vive allá: es el mismo perfil latino cobrándole a un cliente de
   afuera. No mueve el presupuesto de horas.
5. **Ejes chicos**: complejidad Baja ×0,77 y Alta ×1,42 sobre Media; rondas
   (1 / 3 / +3) suman 0% / 35% / 60% de las horas de diseño y producción, contra
   15% con 2 rondas; salida Motion ×1,4 e Interactivo ×1,9.

La fórmula vive en `app.js` (`calculateQuote`, `getBasePhaseHours`,
`getBrandTierCoefs`) y está replicada en `scripts/lib/quote.mjs`.
Si cambia una, hay que cambiar la otra.

## Tabla ancla — Branding completo

| Tipo de cliente | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Emprendimiento | 742 (obj. 700) | 1253 (obj. 1250) | 1832 (obj. 1700) | 2553 (obj. 2550) |
| Startup | 1460 (obj. 1400) | 2465 (obj. 2500) | 3606 (obj. 3600) | 5025 (obj. 5100) |
| Empresa | 2302 (obj. 2500) | 3887 (obj. 3750) | 5686 (obj. 6000) | 7923 (obj. 7650) |

Desvío máximo: 7,9% (tolerancia 10%).

## Todos los servicios

### Emprendimiento

| Servicio | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Branding completo | 742 · 54.1 h | 1253 · 54.1 h | 1832 · 54.1 h | 2553 · 54.1 h |
| Identidad visual | 415 · 31.4 h | 701 · 31.4 h | 1025 · 31.4 h | 1428 · 31.4 h |
| Manual de marca | 331 · 25.1 h | 559 · 25.1 h | 818 · 25.1 h | 1139 · 25.1 h |
| Logotipo | 212 · 16.0 h | 358 · 16.0 h | 524 · 16.0 h | 730 · 16.0 h |
| Logo animado | 109 · 9.3 h | 183 · 9.3 h | 268 · 9.3 h | 374 · 9.3 h |
| Presentación corporativa | 158 · 13.5 h | 266 · 13.5 h | 389 · 13.5 h | 542 · 13.5 h |
| Plantillas Canva x5 | 90 · 7.7 h | 152 · 7.7 h | 222 · 7.7 h | 310 · 7.7 h |
| Papelería básica | 64 · 5.5 h | 108 · 5.5 h | 159 · 5.5 h | 221 · 5.5 h |
| Post animado | 41 · 3.5 h | 70 · 3.5 h | 102 · 3.5 h | 142 · 3.5 h |
| Banner digital | 20 · 1.7 h | 33 · 1.7 h | 49 · 1.7 h | 68 · 1.7 h |
| Pieza RRSS | 15 · 1.3 h | 25 · 1.3 h | 36 · 1.3 h | 51 · 1.3 h |

### Startup

| Servicio | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Branding completo | 1460 · 88.8 h | 2465 · 88.8 h | 3606 · 88.8 h | 5025 · 88.8 h |
| Identidad visual | 578 · 36.4 h | 975 · 36.4 h | 1426 · 36.4 h | 1988 · 36.4 h |
| Manual de marca | 601 · 37.9 h | 1014 · 37.9 h | 1483 · 37.9 h | 2067 · 37.9 h |
| Logotipo | 287 · 18.1 h | 485 · 18.1 h | 709 · 18.1 h | 988 · 18.1 h |
| Logo animado | 130 · 9.3 h | 220 · 9.3 h | 322 · 9.3 h | 448 · 9.3 h |
| Presentación corporativa | 189 · 13.5 h | 319 · 13.5 h | 467 · 13.5 h | 651 · 13.5 h |
| Plantillas Canva x5 | 108 · 7.7 h | 182 · 7.7 h | 267 · 7.7 h | 372 · 7.7 h |
| Papelería básica | 77 · 5.5 h | 130 · 5.5 h | 190 · 5.5 h | 265 · 5.5 h |
| Post animado | 50 · 3.5 h | 84 · 3.5 h | 123 · 3.5 h | 171 · 3.5 h |
| Banner digital | 24 · 1.7 h | 40 · 1.7 h | 59 · 1.7 h | 82 · 1.7 h |
| Pieza RRSS | 18 · 1.3 h | 30 · 1.3 h | 44 · 1.3 h | 61 · 1.3 h |

### Empresa

| Servicio | Junior | Mid | Senior | Estudio |
| --- | ---: | ---: | ---: | ---: |
| Branding completo | 2302 · 117.5 h | 3887 · 117.5 h | 5686 · 117.5 h | 7923 · 117.5 h |
| Identidad visual | 767 · 40.6 h | 1295 · 40.6 h | 1894 · 40.6 h | 2639 · 40.6 h |
| Manual de marca | 916 · 48.5 h | 1547 · 48.5 h | 2263 · 48.5 h | 3154 · 48.5 h |
| Logotipo | 374 · 19.8 h | 632 · 19.8 h | 924 · 19.8 h | 1288 · 19.8 h |
| Logo animado | 155 · 9.3 h | 262 · 9.3 h | 383 · 9.3 h | 534 · 9.3 h |
| Presentación corporativa | 225 · 13.5 h | 381 · 13.5 h | 557 · 13.5 h | 776 · 13.5 h |
| Plantillas Canva x5 | 129 · 7.7 h | 217 · 7.7 h | 318 · 7.7 h | 443 · 7.7 h |
| Papelería básica | 92 · 5.5 h | 155 · 5.5 h | 227 · 5.5 h | 316 · 5.5 h |
| Post animado | 59 · 3.5 h | 100 · 3.5 h | 146 · 3.5 h | 203 · 3.5 h |
| Banner digital | 28 · 1.7 h | 48 · 1.7 h | 70 · 1.7 h | 97 · 1.7 h |
| Pieza RRSS | 21 · 1.3 h | 36 · 1.3 h | 52 · 1.3 h | 73 · 1.3 h |

## Contra la IA

`node scripts/check-ia.mjs`: 117 de 117 casos dentro del rango de la IA; distancia
mediana al típico 6%; 98 de 117 casos a menos de 15% del típico.

Lo que queda lejos viene de la tabla ancla:

- **Escalera de perfiles.** La IA ve a Junior más barato (×0,50 del Mid en
  branding; la tabla da ×0,59) y a Senior y Estudio más caros (×1,82 y ×2,82; la
  tabla da ×1,46 y ×2,04).
- **Branding Mid para Startup y Empresa.** La tabla pide 2.500 y 3.750; la IA
  dice 1.750 y 2.950.

## Historial (2026-09-27)

1. **Manual y Canva**: Manual de 1/5/10 a 2/10/20 (quedaba por debajo del
   Logotipo); Canva x5 de 0/1/4 a 0/2,4/9,6. El tipo de cliente deja de sumar
   horas en piezas.
2. **Check contra la IA** (`scripts/check-ia.mjs`, `data/ia-reference.json`).
3. **Mercado y Logo animado**: USA ×2,0 y Europa ×1,7 (perfil latino cobrando
   afuera); Logo animado es solo animar y pasa a Piezas.
4. **Identidad**: peso de alcance por servicio (`tier_hours_weight`).
5. **Piezas chicas**: RRSS, Banner y Post animado bajan de nivel.
6. **Acercar a la IA**: tabla ancla de Estudio −15% (3.000 / 6.000 / 9.000 →
   2.550 / 5.100 / 7.650, coeficiente 1,0 → 0,85); tipo de cliente repartido
   entre tarifa y alcance sin mover el ancla; complejidad Alta, rondas y salidas
   a lo que dice la IA; horas de cada servicio escaladas a la mediana de sus
   casos. Distancia mediana al típico de 14% a 6%.

## Regla de calibración

1. Si cambia el nivel del branding, cambiar la tabla ancla, no las horas del
   branding.
2. Para el resto de los servicios, correr `node scripts/check-ia.mjs` y mover
   horas por fase (manteniendo la proporción entre fases) o el coeficiente del
   eje que muestre brecha.
3. Correr `node scripts/check-benchmark.mjs`: ancla dentro del 10%, monotonía y
   presupuesto de horas independiente del perfil.
4. Actualizar estas tablas y los rangos de `cuanto-cobrar-por-diseno/index.html`.
