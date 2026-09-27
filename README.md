# Cotizador Bong

Calculadora de presupuestos de diseño. Vive en <https://cotizador.bongstudio.ar>.

Sitio estático servido por GitHub Pages desde `main`. No hay build ni dependencias:
se abre `index.html` y funciona.

## Publicar un cambio

```bash
node scripts/check-benchmark.mjs
```

Si toca CSS o JS, subir el sufijo de versión de los assets **antes** de pushear.
Sin esto el navegador sigue sirviendo los archivos viejos y el cambio no le
llega a quien ya usó el cotizador:

```bash
node scripts/bump-version.mjs
```

`data/pricing.json` y `data/benchmark.json` se piden con `cache: "no-store"`,
así que esos dos llegan frescos siempre y no necesitan bump.

## Cómo se calcula el precio

Todo se calibra desde la tabla ancla de `data/pricing.json` (`anchor.targets`):
branding completo × tipo de cliente × perfil. El resto de los servicios escala
desde ahí con la fórmula por fases.

Las horas que se muestran **no son una estimación de cuánto tarda el trabajo**.
Son el presupuesto de tiempo que hace que ese precio quede a tarifa de mercado:
`horas = precio / tarifa de referencia`. Más horas trabajadas, tarifa más baja.

`scripts/check-benchmark.mjs` valida, sobre todas las combinaciones posibles:

- que el modelo reproduzca la tabla ancla dentro del 10%
- que subir cualquier eje nunca baje el precio
- que el presupuesto de horas no dependa del perfil

Corrélo después de tocar `pricing.json` o `benchmark.json`.

La fórmula que usan los scripts vive en `scripts/lib/quote.mjs` y replica la de
`app.js`: si cambia una, hay que cambiar la otra.

## Contra el criterio de la IA

```bash
node scripts/check-ia.mjs          # reporte
node scripts/check-ia.mjs --md     # en markdown, para pegar en un PR
node scripts/check-ia.mjs --strict # falla si algún caso queda fuera de rango
```

Compara 117 casos contra `data/ia-reference.json`: rangos en USD (mín, típico,
máx) y horas de trabajo que estimó la IA **sin ver el modelo**. Los casos mueven
un eje por vez desde el default (perfil, tipo de cliente, mercado, complejidad,
rondas, salida) y suman las esquinas caras (Estudio · Empresa · USA).

Lo más útil es la tabla de forma: compara cuánto multiplica cada eje en el
modelo y en la IA, por categoría. Así se ve qué coeficiente mirar. Como el
benchmark, ubica y no decide.

Para regenerar la referencia (si cambian servicios u opciones, el check avisa):

1. `node scripts/build-ia-prompt.mjs > scripts/ia-reference-prompt.md`. El
   prompt solo lleva nombres y descripciones: ni horas, ni coeficientes, ni
   tabla ancla.
2. Pasárselo a una IA en un contexto que no vea el repo y guardar su JSON en
   `data/ia-reference.json`, con los metadatos del archivo actual.

## Referencia de mercado

`data/benchmark.json` mezcla pistas ponderadas. Cada percentil lleva un campo
`confidence` que dice si es observado, derivado o fallback — mirarlo antes de
defender un número. La pista `estudios` está declarada pero sin datos: necesita
tarifas horarias de estudios en USD.

El benchmark **no corrige el precio**. Desde que el modelo está anclado a la
tabla propia, mover el precio ahí lo sacaría del ancla. Ubica, no decide.

## Movimiento

Las animaciones (`motion.js`, `focus.js`) siguen reglas propias: orden causal,
todo interrumpible, nada que haga esperar. Están documentadas en
[`MOVIMIENTO.md`](MOVIMIENTO.md); leerlo antes de sumar una animación.

## Analytics

GA4 en `analytics.js`. Si el Measurement ID queda vacío no se carga ningún
script externo ni se envía nada. Respeta Do Not Track.

Los parámetros de los eventos (`servicio`, `tipo_cliente`, `perfil`,
`precio_usd`, `horas_objetivo`, etc.) no se ven en los reportes de GA4 hasta
registrarlos como dimensiones personalizadas en Admin.

## Imagen de preview

`assets/img/og-cotizador.png` (1200×630) es la que se ve al compartir el link.
Hoy es una pieza hecha a mano, no la que genera el script: `build-og-image.mjs`
sigue ahí pero **la pisa** si se corre, así que no lo corras salvo que quieras
volver a la versión generada desde `scripts/og-template.html`.

```bash
node scripts/build-og-image.mjs
```
