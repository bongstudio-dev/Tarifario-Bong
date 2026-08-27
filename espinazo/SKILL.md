---
name: espinazo
description: Arma y mantiene la estructura de un manual de marca desde un único archivo YAML, derivando códigos de sección, folios, contadores, nombres de frame y campos de pie. Use cuando el usuario mencione armar un manual de marca, estructurar un brandbook, arquitectura de información de un manual, tabla de contenidos de manual, numeración de secciones, name system de páginas, o cuando haya que agregar o mover páginas en un manual que ya existe.
---

# Espinazo de manual de marca

Cubre la **familia B** del trabajo de manuales: las secciones de estructura fija
y contenido producido. La familia A (tokens: color, tipografía, escala) la cubre
`design-system-generator`; la familia C (estrategia, valores, tono) la cubre
`metodo-bong`.

## Cuándo usarla

- Arrancar la estructura de un manual de marca nuevo
- Agregar, mover o sacar páginas de un manual que ya está en producción
- Antes de cotizar: contar páginas por familia para dimensionar el alcance
- Cuando hay dudas de si el Figma y la tabla de contenidos siguen coincidiendo

## Regla central

**Todo lo derivable se deriva.** Nunca escribir a mano:

- códigos de sección `SS.MM.PP`
- números de página / folios
- contadores `n/N` de módulo
- nombres de frame
- textos de pie de página

Todo eso sale de `espinazo.py`. Lo único que se escribe a mano es: qué
secciones hay, qué módulos, qué páginas, con qué plantilla, en qué estado.

Esto no es preferencia de estilo. En el manual de Profertil, agregar una sola
página obligó a actualizar el contador `/7 → /8` a mano en todas las páginas de
un módulo, y la estructura terminó viviendo en tres archivos que dejaron de
coincidir a los once días.

## Flujo

### 1. Leer las plantillas del Figma

Antes de escribir el YAML, sacar el catálogo real de plantillas del archivo:

```
mcp__Figma__get_metadata(fileKey=..., nodeId=<pagina de plantillas>)
```

Anotar cada plantilla y sus campos `$`. Las plantillas de divisoria no llevan
`$folio` — por eso las divisorias no entran en la numeración de páginas, y eso
tiene que quedar reflejado en el catálogo.

### 2. Escribir el espinazo

Copiar `manuales/eyd.yaml` como base. Definir secciones con su **familia**:

- **A** derivada de tokens → costo fijo, igual en todos los manuales
- **B** sistemática → escala con SKUs y formatos
- **C** depende del cliente → la única que bloquea

Marcar como `bloqueado` toda página que espera algo del cliente, **siempre**
con el motivo en `bloqueante:`. Una página bloqueada que no dice por qué es un
error de validación.

### 3. Generar y validar

```bash
python3 espinazo.py manuales/<marca>.yaml --salida build
```

Sale con código 1 si hay errores. Revisar `build/indice.md` con el equipo.

### 4. Diffear antes de tocar Figma

```bash
python3 espinazo.py manuales/<marca>.yaml --salida build --diff build/figma-fill.json
```

Muestra qué se agregó, qué se fue y qué se corrió de código. Es lo que evita
la bifurcación.

### 5. Bajar a Figma

`build/figma-fill.json` dice, por cada página, qué plantilla instanciar y qué
va en cada campo `$`. Se consume con `mcp__Figma__use_figma`.

**Antes de escribir en un archivo de cliente, confirmarlo con el usuario.**
Crear decenas de frames en un archivo vivo no se deshace cómodo.

## Al cotizar

El resumen por familia de `indice.md` es la herramienta de estimación. El
tamaño de un manual no lo define la cantidad de secciones: lo define cuánta
familia C tiene la organización del otro lado — submarcas, audiencias,
programas, requisitos normativos, y cuánta gente aprueba.

Referencia:

| Manual | Familia C | Resultado |
| --- | --- | --- |
| Profertil | 22 audiencias, ~20 productos, 9 programas, comité | 125 págs, versionándose 9 meses después |
| arda | sin submarcas, dos fundadoras deciden | entrega única, sin changelog |
| E&D Herbs | línea única + cumplimiento FDA | ~67 págs proyectadas |

## Estados

`completo` · `basico` · `muestra` · `pendiente` · `bloqueado`

Declararlos explícitamente al entregar. Es lo que permitió que Profertil
entregara 125 páginas útiles sin fingir que estaba todo terminado.

## Qué no hace

- No escribe el contenido de las páginas. Eso es `metodo-bong` (familia C) y
  trabajo de redacción.
- No genera tokens ni escalas. Eso es `design-system-generator` (familia A).
- No dibuja. Emite el andamio y los valores; el diseño se hace en Figma.
