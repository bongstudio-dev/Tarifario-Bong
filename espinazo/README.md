# espinazo

Genera y valida la estructura derivada de un manual de marca.

La estructura vive en **un solo archivo YAML**. Todo lo que se puede calcular
desde ahí se calcula y nunca se tipea:

- códigos de sección `SS.MM.PP`
- folios corridos
- contadores `n/N` por módulo
- nombres de frame
- los campos `$seccion_num`, `$pie_seccion`, `$pie_marca`, `$folio`, `$titulo`

## Por qué existe

En el manual de Profertil la estructura terminó viviendo en tres archivos que
se separaron en once días: el blueprint (12 nov 2025), la tabla de contenidos
(13 nov) y el name system (24 nov). Para febrero ya no coincidían: numeración
de un dígito contra numeración con cero a la izquierda, cuatro páginas que
existían en uno y no en el otro, el `01.06.05` faltante, y las dos columnas del
name system corridas una fila desde la sección 01.

Y en la v1.1.3, agregar **una** página obligó a actualizar a mano el contador
`/7 → /8` en todas las páginas del módulo y a rehacer los enlaces de navegación.

Todo eso son valores derivados escritos a mano. Esto los deriva.

## Uso

```bash
python3 espinazo.py manuales/eyd.yaml
python3 espinazo.py manuales/eyd.yaml --salida build
python3 espinazo.py manuales/eyd.yaml --diff build/figma-fill.json
```

Sale con código 1 si hay errores de validación, así que sirve en un hook o CI.

Única dependencia: `PyYAML`.

## Salidas

| Archivo | Para qué |
| --- | --- |
| `espinazo.csv` | La tabla canónica, una fila por frame. Es la fuente de verdad para planificar y presupuestar. |
| `figma-fill.json` | El contrato con Figma: por cada página, qué plantilla instanciar y qué va en cada campo `$`. |
| `indice.md` | El índice legible, con estados y bloqueantes. Es lo que se mira en la reunión. |

## El YAML

```yaml
manual:
  marca: E&D Herbs
  version: v0.1
  pie_marca: E&D Herbs · Manual de Marca
  figma_file: 9ra05S5WOcK9ihSZ7Dlprg

plantillas:            # catálogo leído del archivo de Figma
  T0_base:
    campos: {titulo: 1, cuerpo: 1, pie_marca: 1, pie_seccion: 1, folio: 1}
    #                                             ↑ el número es cuántas veces
    #                                               se repite el campo dentro
    #                                               de la plantilla

divisorias:            # pool, se asignan a las secciones en orden
  - {plantilla: T2_divisoria_verde_normal_izq, emblema: comfrey, color: verde}

secciones:
  - num: 3
    nombre: Color
    familia: A         # A derivada · B sistemática · C depende del cliente
    modulos:
      - nombre: La paleta
        paginas:
          - {titulo: "Paleta completa", plantilla: T5_full_bleed}
```

Vos escribís secciones, módulos, títulos, plantilla, estado y bloqueante.
Nada más.

### Estados

`completo` · `basico` · `muestra` · `pendiente` · `bloqueado`

Un `bloqueado` **tiene** que declarar `bloqueante:` con el motivo. Es lo que
permite entregar un manual parcial sin fingir que está terminado, que es lo
que hizo funcionar la entrega C1 de Profertil.

### Familias

Cada sección declara de dónde sale su contenido:

- **A — derivada**: es función de los tokens (logo, color, tipografía). Costo fijo.
- **B — sistemática**: estructura fija, contenido a producir. Escala con SKUs y formatos.
- **C — depende del cliente**: sale del cliente o no sale. Es la única que bloquea.

El resumen del `indice.md` cuenta páginas por familia. Eso es lo que sirve
para cotizar: el tamaño de un manual lo define cuánta familia C tiene la
organización del otro lado, no la cantidad de secciones.

## Qué valida

Cada regla sale de un error real del manual de Profertil.

| Regla | Nivel | Qué agarra |
| --- | --- | --- |
| `codigo_duplicado` | error | dos páginas con el mismo código |
| `numeracion_salteada` | error | el hueco tipo `01.06.04 → 01.06.06` |
| `modulo_salteado` | error | falta un módulo en el medio de una sección |
| `plantilla_inexistente` | error | una plantilla que no está en el catálogo de Figma |
| `divisorias_insuficientes` | error | más secciones que divisorias en el pool |
| `divisoria_repetida` | error | la misma divisoria asignada dos veces |
| `bloqueante_sin_declarar` | error | página bloqueada que no dice por qué |
| `estado_invalido` | error | un estado fuera de la lista |
| `campo_desconocido` | aviso | un `$campo` que la plantilla no tiene |
| `contenido_sin_folio` | aviso | página cuya plantilla no lleva `$folio`: queda sin numerar |
| `divisorias_sobrantes` | aviso | quedan divisorias sin usar |
| `familia_invalida` | aviso | familia que no es A, B ni C |

`manuales/_prueba-fallas.yaml` reproduce todos a propósito. Es el test del
validador:

```bash
python3 espinazo.py manuales/_prueba-fallas.yaml --salida /tmp/prueba
# 7 errores, 4 avisos, exit 1
```

## El diff

Es el detector de bifurcación. Compara contra un `figma-fill.json` anterior y
reporta qué se agregó, qué se fue y qué **se corrió de código**.

Cada página tiene una identidad estable derivada de
`sección/módulo/título` (o fijada a mano con `id:`), independiente de su
número. Por eso una página que se corre no se lee como una página nueva:

```
+ Ilustracion/Biblioteca_De_Emblemas/Emblema_Nuevo_Gliceritos
~ Ilustracion/Biblioteca_De_Emblemas/Indice_De_Emblemas cambió de código
```

En esa misma corrida, agregar una página re-numeró 26 folios sola.

## El puente con Figma

`figma-fill.json` es el contrato. Cada entrada dice qué plantilla instanciar y
qué texto va en cada campo `$`:

```json
{
  "id": "Composicion/La_Grilla/Grilla_De_8_Columnas",
  "codigo": "06.01.01",
  "archivo": "06.01.01_Composicion_La_Grilla_1",
  "plantilla": "T5_full_bleed",
  "campos": {
    "titulo": "Grilla de 8 columnas",
    "pie_marca": "E&D Herbs · Manual de Marca",
    "pie_seccion": "06 · Composición",
    "folio": "44"
  }
}
```

Si un campo se repite dentro de la plantilla (`lista_titulo` aparece 3 veces en
`T3b_lista`), el valor puede ser una lista y se reparte entre los nodos en
orden.

El catálogo de `plantillas:` en el YAML tiene que reflejar lo que hay en la
página `00 · Plantillas` del archivo de Figma. Si se agrega o renombra una
plantilla allá, se actualiza acá y el validador avisa qué páginas quedaron
apuntando a algo que ya no existe.
