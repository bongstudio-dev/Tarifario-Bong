# Framework de marcas Bong

Un sistema de marca agéntico, en el sentido del ensayo de littleplains
(*Agentic Systems Are the Future of Brands*): cada pieza que sale es una
decisión sobre qué es la marca, cada vez las toman más personas y más agentes,
y todos trabajan desde versiones distintas de la compañía. El agente, además,
"no sabe qué archivo está vigente: va a hacer una elección razonable y seguir".

El framework ataca eso en tres frentes:

1. **Una sola fuente de verdad**, el `marca.json`, que leen el MCP y el portal web por igual.
2. **Vigencia explícita**: lo retirado está listado con su reemplazo, así un
   logo de 2019 encontrado en una carpeta se reconoce como viejo (`es_vigente`).
3. **Un sistema vivo**: cuando el sistema no cubre algo, el agente lo resuelve
   con lo más cercano aprobado, lo dice, y lo anota (`reportar_hueco`). Ese
   registro, con dueño para cada área (`responsables`), es la lista de trabajo
   de la próxima versión del manual. No hace falta esperar una reunión o un PDF nuevo.

Es lo mismo que plantea el capítulo 4 del caso Profertil, llevado un paso más allá: **un sistema
que depende del estudio es un sistema incompleto**. El generador de patrones y
el buscador de íconos ya sacaban al estudio del medio para las piezas
cotidianas. Esto le da el mismo sistema a la IA que usa el cliente: cualquier
persona de la compañía le pide a Claude "armame la portada de la presentación
para productores" y Claude responde con la paleta, las formas, los íconos y
las reglas de la marca, no con colores inventados.

Cada marca es un **kit**: markdown que una persona hojea y un agente lee
(estrategia, voz, dirección de arte con el porqué de cada regla, decisiones),
más un `marca.json` con los valores que usan las herramientas. Es el mismo
formato que muestra littleplains con el kit de Sonata. El código es el mismo
para todas las marcas.

```
marcas/
  _plantilla/              de acá sale cada marca nueva
  profertil/
    marca.json             valores: colores, duplas, formas, íconos, patrón, recetas
    kit/LEEME.md           cómo usar el kit y cómo decidir cuando no alcanza
    kit/estrategia.md
    kit/voz.md
    kit/direccion-de-arte.md   cada regla con qué, por qué y dónde
    kit/decisiones.md      qué se decidió y por qué, por versión
  eyd/                     alta hecha, todo pendiente
framework/
  nucleo.mjs               las funciones: color, contraste, íconos, patrón, recetas
  servidor.mjs             el servidor MCP (stdio y HTTP), sin dependencias
  validar.mjs              chequea los marca.json
  prueba.mjs               prueba de punta a punta del protocolo
```

`nucleo.mjs` no usa nada de Node: el portal web de cada marca puede importarlo
tal cual, así el generador de la web y el del MCP son la misma función y no
dos versiones parecidas.

## Lo que puede hacer Claude con una marca

| Tool | Para qué |
|---|---|
| `que_necesitas_hacer` | La entrada del manual por tarea. "Un cartel de obra" → receta con pasos y qué tools usar |
| `marca` | Resumen, principios, qué hay cargado y qué falta |
| `colores` | Paleta con hex y rol; principales, duplas y terciarias |
| `validar_combinacion` | ¿Esta combinación está aprobada? Si no, cuál usar. Si le pasan un hex ajeno, dice cuál de la marca es el más cercano |
| `contraste` | WCAG AA/AAA de texto sobre fondo |
| `buscar_iconos` / `icono` | Búsqueda en la iconografía oficial y SVG listo, en el color de su categoría o en pastilla |
| `forma` | El alfabeto de formas, en SVG y en color de la marca |
| `generar_patron` | El patrón del sistema en SVG. Misma semilla, mismo patrón |
| `leer_kit` | El kit en texto: índice, o la sección que pida la receta |
| `tipografia`, `glosario`, `changelog` | El manual, consultable |
| `revisar_texto` | Voz y terminología de la marca |
| `tokens` | Variables CSS o JSON para proveedores web |
| `es_vigente` | ¿Este hex, logo, archivo o término es de la versión actual? Si no, qué lo reemplaza |
| `responsables` | Quién decide cada parte del sistema, para saber con quién validar |
| `reportar_hueco` | Anota lo que el sistema no cubrió y qué decidió el agente en su lugar |

El servidor le pasa a Claude unas instrucciones de uso al conectarse: arrancar
por `que_necesitas_hacer`, no inventar colores ni íconos, validar combinaciones
y contraste, pasar por `es_vigente` todo lo que la persona traiga de afuera,
reportar los huecos, y **decir que falta un dato** cuando viene como
`{ "pendiente": "…" }` en vez de completarlo. Eso último es lo que permite
publicar una marca a medio cargar sin que la IA rellene los huecos.

## Dar de alta una marca

1. Copiar `marcas/_plantilla/` a `marcas/<id>/`, poner el `id` y el `nombre`
   en `marca.json` y el nombre en los markdown de `kit/`.
2. Ir reemplazando cada `{ "pendiente": "…" }` por el dato real. Lo que no se
   tenga todavía se deja así: el MCP lo informa como faltante.
3. Validar y probar:

```bash
node framework/validar.mjs <id> --detalle
node framework/prueba.mjs
```

`validar.mjs` corta si hay una referencia rota (una dupla que nombra un color
que no existe, un ícono en una categoría no declarada, una receta que nombra
una tool que no existe) y avisa, sin cortar, cuando una dupla no tiene
contraste para texto.

Los SVG de íconos y formas van como el contenido interno del `<svg>` (los
`<path>`, sin la etiqueta de afuera), en la grilla del `viewBox` declarado.
Para Profertil salieron de los `<symbol>` de `caso-profertil-maqueta.html`;
para una marca nueva salen del Figma.

## El registro de huecos

Cada `reportar_hueco` suma una línea a `registro/<marca>.jsonl` (o a la
carpeta de `REGISTRO`), con fecha, versión de la marca, qué se pidió, qué
faltaba y qué decidió el agente. Claude también lo puede leer como recurso
(`marca://<id>/huecos.json`). No se versiona en git: es dato de uso del cliente.

El ciclo es: el registro se revisa con el responsable, lo que se resuelve
entra al `marca.json` con una versión nueva y su línea en el changelog, y el
MCP sirve esa versión desde el próximo pedido. `validar.mjs` no deja publicar
una versión sin su entrada en el changelog.

En un host con disco efímero, `REGISTRO` tiene que apuntar a un volumen persistente.

## Conectarlo

**Claude Code**

```bash
claude mcp add profertil -- node /ruta/al/repo/framework/servidor.mjs --marca profertil
```

**Claude Desktop.** En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "profertil": {
      "command": "node",
      "args": ["/ruta/al/repo/framework/servidor.mjs", "--marca", "profertil"]
    }
  }
}
```

**claude.ai (conector para todo el equipo del cliente).** Necesita el servidor
publicado por HTTPS en cualquier host de Node (GitHub Pages no sirve, es
estático):

```bash
MARCA=profertil HOST=0.0.0.0 PUERTO=8787 \
MCP_TOKEN=<secreto-largo> URL_PUBLICA=https://profertil.marca.bongstudio.ar/<secreto-largo> \
node framework/servidor.mjs --http
```

En claude.ai → Configuración → Conectores → Agregar conector personalizado,
con la URL `https://profertil.marca.bongstudio.ar/<secreto-largo>/mcp`. El
token va en la ruta porque el formulario del conector no deja poner headers;
cualquier otro cliente puede mandarlo como `Authorization: Bearer <token>`.

Publicado así, el servidor también sirve los SVG por URL (`/patron.svg`,
`/icono/<id>.svg`, `/forma/<id>.svg`, `/tokens.css`) y las tools devuelven
el link de descarga junto con el código.

## Por qué markdown y MCP a la vez

El kit en markdown ya funciona solo: Claude Code o Codex abiertos en el repo lo
leen sin nada más, igual que el de Sonata. El MCP es para quien no abre un
repo: el equipo de Comunicaciones o un proveedor desde claude.ai, que necesitan
las mismas reglas y además herramientas que calculen (contraste, combinaciones
aprobadas, patrón, vigencia) en vez de confiar en que el modelo lo haga bien.

Las reglas en prosa viven solo en el kit y los valores solo en `marca.json`.
Nada está escrito en los dos lados.

## Qué falta

- **Profertil** (cargado desde el Manual de Marca v1.1.4 en Figma, que es el
  canon): faltan los SVG oficiales de las 18 formas y de la biblioteca de
  íconos (las del MCP son reconstrucciones de la maqueta, marcadas
  `reconstruccion`), los links a logos y recursos descargables, el contacto en
  Comunicaciones Integradas, la tipografía del slogan (el Master dice Gabarito,
  el manual no lo documenta) y las reglas de documentos, papelería y
  señalética, que en el manual son láminas visuales. Exportar desde Figma no se
  puede desde la nube: el entorno bloquea figma.com; se hace desde la Mac.
- **E&D Herbs**: la carpeta está creada desde la plantilla. Fuentes: el manual en
  Figma (`9ra05S5WOcK9ihSZ7Dlprg`, 100 páginas) y las páginas de Manual,
  Brandkit y Brandboard en Notion.
- **Componentes con código**, como en el kit de Sonata: botón, tarjeta,
  portada con patrón, firma de mail, en HTML/CSS sobre los tokens. Es lo que
  deja que el agente arme una pieza entera y no solo que elija bien los colores.
- **El estudio "¿Qué querés hacer?"**: una página donde alguien de Profertil
  elige un pedido ("una portada", "un mail a productores") y el agente la arma
  leyendo el kit, con vista previa y código.
- **Auth de verdad** si el cliente lo pide: hoy es un token compartido por
  marca. Para usuarios individuales hace falta OAuth.
- El **portal web** de cada marca sobre `nucleo.mjs` (el generador y el buscador
  de la maqueta, leyendo del `marca.json`).
- Moverlo a un repo propio. Está acá porque nació de la maqueta del caso, pero
  no tiene nada que ver con el cotizador.
