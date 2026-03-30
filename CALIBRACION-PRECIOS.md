# Calibracion de precios Bong

Referencia de trabajo para ajustar el sistema sin seguir moviendo horas a ciegas.

Convencion usada en esta tabla:
- complejidad: `Media`
- output: el default de cada servicio
- columnas: valores actuales del sistema y objetivo sugerido en `USD`

## Servicios ancla

| Servicio | Junior actual | Mid actual | Estudio actual | Objetivo sugerido |
| --- | ---: | ---: | ---: | --- |
| Pieza RRSS | 32 | 44 | 63 | mantener |
| Banner digital | 46 | 64 | 92 | mantener |
| Presentacion corporativa | 266 | 372 | 532 | mantener o bajar levemente |
| Logotipo | 311 | 436 | 622 | mantener |
| Manual de marca | 238 | 333 | 476 | mantener |
| Identidad visual | 703 | 984 | 1406 | mantener por ahora |
| Branding completo | 1086 | 1520 | 2172 | mantener o bajar levemente |
| Branding premium | 1277 | 1788 | 2554 | mantener, revisar si premium debe abrir aun mas brecha conceptual y no solo monetaria |

## Lectura

- El sistema ya no esta inflado de forma absurda.
- La familia `logotipo -> identidad visual -> branding completo -> branding premium` ahora tiene una progresion bastante mas entendible.
- `branding premium` sigue siendo el valor mas sensible del sistema: no parece disparatado, pero exige justificar bien el scope premium.
- `presentacion corporativa` es el servicio de piezas que mas probablemente necesite una segunda mirada si queremos una herramienta mas conservadora.

## Regla de calibracion

Antes de tocar horas:

1. definir el precio objetivo `Mid / complejidad media`
2. verificar que `Junior` no quede irrealmente alto
3. verificar que `Estudio` siga defendiendo posicionamiento
4. recien despues repartir horas por fase

## Siguiente ronda sugerida

Si seguimos ajustando, conviene mirar solo estos tres:

- `presentacion`
- `branding_std`
- `branding_premium`

No tocaria por ahora `rrss`, `banner`, `logotipo`, `manual_marca` ni `identidad_visual`.
