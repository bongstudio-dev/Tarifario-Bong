#!/usr/bin/env python3
"""
espinazo — genera y valida la estructura derivada de un manual de marca.

La idea: la estructura del manual vive en UN solo archivo (el espinazo).
Todo lo que se puede calcular desde ahi — codigos de seccion, folios,
contadores de modulo, nombres de frame, campos de pie — se calcula.
Nunca se tipea.

Uso:
    python3 espinazo.py manuales/eyd.yaml
    python3 espinazo.py manuales/eyd.yaml --salida build
    python3 espinazo.py manuales/eyd.yaml --diff build/figma-fill.json

Salidas (en --salida, por defecto ./build):
    espinazo.csv     tabla canonica, una fila por pagina
    figma-fill.json  mapa de relleno: que plantilla instanciar y con que valores
    indice.md        indice legible con estados y bloqueantes
"""

import argparse
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

import yaml

ESTADOS = ("completo", "basico", "muestra", "pendiente", "bloqueado")
FAMILIAS = ("A", "B", "C")


# ---------------------------------------------------------------- utilidades

def slug(texto):
    """'Área de exclusión' -> 'Area_de_exclusion'"""
    plano = unicodedata.normalize("NFKD", texto or "")
    plano = "".join(c for c in plano if not unicodedata.combining(c))
    plano = re.sub(r"[^0-9A-Za-z]+", "_", plano).strip("_")
    return "_".join(p.capitalize() if p.islower() else p for p in plano.split("_"))


def dd(n):
    return f"{n:02d}"


class Problema:
    def __init__(self, nivel, regla, detalle):
        self.nivel = nivel      # "ERROR" | "AVISO"
        self.regla = regla
        self.detalle = detalle

    def __str__(self):
        marca = "✗" if self.nivel == "ERROR" else "!"
        return f"  {marca} [{self.regla}] {self.detalle}"


# ---------------------------------------------------------------- construccion

def construir(spec):
    """Recorre el espinazo y devuelve una fila por pagina, con todo lo derivado."""
    manual = spec["manual"]
    catalogo = spec.get("plantillas", {})
    divisorias = list(spec.get("divisorias", []))

    filas = []
    orden = 0
    folio = 0

    def campos_de(nombre_plantilla):
        entrada = catalogo.get(nombre_plantilla) or {}
        return entrada.get("campos", {})

    def nueva_fila(**kw):
        nonlocal orden
        orden += 1
        fila = {
            "orden": orden,
            "id": "",
            "codigo": "",
            "tipo": "",
            "seccion_num": "",
            "seccion_nombre": "",
            "familia": "",
            "modulo_num": "",
            "modulo_nombre": "",
            "pagina_num": "",
            "titulo": "",
            "plantilla": "",
            "estado": "",
            "bloqueante": "",
            "folio": "",
            "nav": "",
            "archivo": "",
            "campos": {},
        }
        fila.update(kw)
        return fila

    # --- portada -----------------------------------------------------------
    portada = manual.get("portada")
    if portada:
        plantilla = portada.get("plantilla", "T1_portada")
        campos = dict(portada.get("campos", {}))
        disponibles = campos_de(plantilla)
        if "version" in disponibles:
            campos.setdefault("version", manual.get("version", ""))
        if "titulo" in disponibles:
            campos.setdefault("titulo", f'{manual.get("marca","")} {manual.get("titulo","")}'.strip())
        filas.append(nueva_fila(
            codigo="PORTADA",
            tipo="portada",
            titulo=campos.get("titulo", "Portada"),
            plantilla=plantilla,
            estado=portada.get("estado", "pendiente"),
            archivo="00_Portada",
            campos=campos,
        ))

    # --- secciones ---------------------------------------------------------
    usadas = []
    for s_i, seccion in enumerate(spec.get("secciones", [])):
        s_num = seccion.get("num", s_i)
        s_nom = seccion.get("nombre", "")
        familia = seccion.get("familia", "")

        # divisoria: se toma del pool, en orden, salvo que la seccion la rechace
        if seccion.get("divisoria", True):
            if len(usadas) < len(divisorias):
                div = divisorias[len(usadas)]
                usadas.append(div)
                campos = {"seccion_num": dd(s_num), "seccion_nombre": s_nom}
                filas.append(nueva_fila(
                    codigo=dd(s_num),
                    tipo="divisoria",
                    seccion_num=dd(s_num),
                    seccion_nombre=s_nom,
                    familia=familia,
                    titulo=s_nom,
                    plantilla=div.get("plantilla", ""),
                    estado=seccion.get("estado", "pendiente"),
                    archivo=f"{dd(s_num)}_{slug(s_nom)}",
                    campos=campos,
                ))
            else:
                filas.append(nueva_fila(
                    codigo=dd(s_num),
                    tipo="divisoria",
                    seccion_num=dd(s_num),
                    seccion_nombre=s_nom,
                    familia=familia,
                    titulo=s_nom,
                    plantilla="__SIN_DIVISORIA__",
                    estado="pendiente",
                    archivo=f"{dd(s_num)}_{slug(s_nom)}",
                    campos={},
                ))

        for m_i, modulo in enumerate(seccion.get("modulos", []), start=1):
            m_num = modulo.get("num", m_i)
            m_nom = modulo.get("nombre", "")
            paginas = modulo.get("paginas", []) or []
            total_modulo = len(paginas)

            for p_i_auto, pagina in enumerate(paginas, start=1):
                # el numero se calcula por posicion, salvo que se fije a mano
                # (fijarlo sirve para conservar nombres de frame que ya existen)
                p_i = pagina.get("num", p_i_auto)
                plantilla = pagina.get("plantilla", manual.get("plantilla_default", "T0_base"))
                disponibles = campos_de(plantilla)
                campos = dict(pagina.get("campos", {}))

                # el titulo de la pagina llena $titulo salvo que se pise a mano
                if "titulo" in disponibles and "titulo" not in campos:
                    campos["titulo"] = pagina.get("titulo", "")

                # --- campos derivados: nunca se escriben a mano
                if "pie_marca" in disponibles:
                    campos["pie_marca"] = manual.get("pie_marca", "")
                if "pie_seccion" in disponibles:
                    campos["pie_seccion"] = f"{dd(s_num)} · {s_nom}"
                if "folio" in disponibles:
                    folio += 1
                    campos["folio"] = str(folio)
                    folio_fila = folio
                else:
                    folio_fila = ""

                codigo = f"{dd(s_num)}.{dd(m_num)}.{dd(p_i)}"
                # identidad estable, independiente del numero: es lo que permite
                # ver que una pagina se corrio de codigo en vez de leerla como
                # una pagina nueva. Se puede fijar a mano con `id:`.
                identidad = pagina.get("id") or f"{slug(s_nom)}/{slug(m_nom)}/{slug(pagina.get('titulo',''))}"
                filas.append(nueva_fila(
                    id=identidad,
                    codigo=codigo,
                    tipo="contenido",
                    seccion_num=dd(s_num),
                    seccion_nombre=s_nom,
                    familia=familia,
                    modulo_num=dd(m_num),
                    modulo_nombre=m_nom,
                    pagina_num=dd(p_i),
                    titulo=pagina.get("titulo", ""),
                    plantilla=plantilla,
                    estado=pagina.get("estado", "pendiente"),
                    bloqueante=pagina.get("bloqueante", ""),
                    folio=folio_fila,
                    nav=f"{p_i}/{total_modulo}",
                    archivo=f"{codigo}_{slug(s_nom)}_{slug(m_nom)}_{p_i}",
                    campos=campos,
                ))

    return filas


# ---------------------------------------------------------------- validacion

def validar(spec, filas):
    """Las reglas salen de los errores reales del manual de Profertil."""
    problemas = []
    catalogo = spec.get("plantillas", {})
    divisorias = spec.get("divisorias", [])

    # 1. codigos duplicados
    vistos = {}
    for f in filas:
        if f["codigo"] in ("", "PORTADA"):
            continue
        vistos.setdefault(f["codigo"], []).append(f["archivo"])
    for codigo, quienes in vistos.items():
        if len(quienes) > 1:
            problemas.append(Problema("ERROR", "codigo_duplicado",
                                      f"{codigo} aparece {len(quienes)} veces: {', '.join(quienes)}"))

    # 2. saltos de numeracion dentro de cada modulo
    #    (el caso Profertil: 01.06.04 -> 01.06.06, sin .05)
    por_modulo = {}
    for f in filas:
        if f["tipo"] != "contenido":
            continue
        por_modulo.setdefault((f["seccion_num"], f["modulo_num"]), []).append(int(f["pagina_num"]))
    for (s, m), nums in por_modulo.items():
        # se deduplica primero: si hay codigos repetidos ya lo reporta la regla 1,
        # y contarlos aca inventaria un hueco que no existe
        unicos = set(nums)
        faltan = sorted(set(range(1, max(unicos) + 1)) - unicos)
        if faltan:
            problemas.append(Problema("ERROR", "numeracion_salteada",
                                      f"modulo {s}.{m}: falta(n) {', '.join(dd(n) for n in faltan)}"))

    # 2b. saltos entre modulos de una misma seccion
    por_seccion = {}
    for f in filas:
        if f["tipo"] != "contenido":
            continue
        por_seccion.setdefault(f["seccion_num"], set()).add(int(f["modulo_num"]))
    for s, nums in por_seccion.items():
        esperado = set(range(1, max(nums) + 1))
        faltan = sorted(esperado - nums)
        if faltan:
            problemas.append(Problema("ERROR", "modulo_salteado",
                                      f"seccion {s}: falta(n) los modulos {', '.join(dd(n) for n in faltan)}"))

    # 3. paginas de contenido que no van a llevar folio
    #    (su plantilla no tiene $folio, asi que quedan fuera de la numeracion)
    for f in filas:
        if f["tipo"] == "contenido" and f["folio"] == "":
            problemas.append(Problema("AVISO", "contenido_sin_folio",
                                      f'{f["archivo"]}: {f["plantilla"]} no tiene $folio, la pagina queda sin numerar'))

    # 4. la plantilla existe en el catalogo leido de Figma
    for f in filas:
        if f["plantilla"] == "__SIN_DIVISORIA__":
            continue
        if f["plantilla"] and f["plantilla"] not in catalogo:
            problemas.append(Problema("ERROR", "plantilla_inexistente",
                                      f'{f["archivo"]} usa "{f["plantilla"]}", que no esta en el catalogo'))

    # 5. campos que la plantilla no tiene
    for f in filas:
        disponibles = (catalogo.get(f["plantilla"]) or {}).get("campos", {})
        if not disponibles:
            continue
        for campo in f["campos"]:
            if campo not in disponibles:
                problemas.append(Problema("AVISO", "campo_desconocido",
                                          f'{f["archivo"]}: ${campo} no existe en {f["plantilla"]}'))

    # 6. divisorias: una por seccion, sin repetir, pool suficiente
    necesitan = sum(1 for s in spec.get("secciones", []) if s.get("divisoria", True))
    if necesitan > len(divisorias):
        problemas.append(Problema("ERROR", "divisorias_insuficientes",
                                  f"{necesitan} secciones necesitan divisoria y hay {len(divisorias)} en el pool"))
    elif necesitan < len(divisorias):
        problemas.append(Problema("AVISO", "divisorias_sobrantes",
                                  f"quedan {len(divisorias) - necesitan} divisorias sin usar"))
    plantillas_div = [d.get("plantilla") for d in divisorias]
    repetidas = {p for p in plantillas_div if plantillas_div.count(p) > 1}
    if repetidas:
        problemas.append(Problema("ERROR", "divisoria_repetida",
                                  f"repetidas en el pool: {', '.join(sorted(repetidas))}"))

    # 7. estados y bloqueantes
    for f in filas:
        if f["estado"] and f["estado"] not in ESTADOS:
            problemas.append(Problema("ERROR", "estado_invalido",
                                      f'{f["archivo"]}: "{f["estado"]}" no es un estado valido'))
        if f["estado"] == "bloqueado" and not f["bloqueante"]:
            problemas.append(Problema("ERROR", "bloqueante_sin_declarar",
                                      f'{f["archivo"]} esta bloqueado y no dice por que'))

    # 8. familia declarada
    for seccion in spec.get("secciones", []):
        fam = seccion.get("familia")
        if fam not in FAMILIAS:
            problemas.append(Problema("AVISO", "familia_invalida",
                                      f'seccion {seccion.get("nombre")}: familia "{fam}" (esperado A, B o C)'))

    return problemas


# ---------------------------------------------------------------- diff

def diff(filas, ruta_anterior):
    """Detecta la bifurcacion: que paginas se agregaron, se fueron o se renumeraron."""
    previo = json.loads(Path(ruta_anterior).read_text(encoding="utf-8"))
    # se compara por identidad (seccion/modulo/titulo), no por codigo: asi una
    # pagina que se corrio de numero se ve como movida y no como nueva
    antes = {p.get("id") or p["archivo"]: p["codigo"] for p in previo.get("paginas", [])}
    ahora = {f["id"] or f["archivo"]: f["codigo"] for f in filas}

    agregadas = sorted(set(ahora) - set(antes))
    quitadas = sorted(set(antes) - set(ahora))
    movidas = sorted(a for a in set(antes) & set(ahora) if antes[a] != ahora[a])
    return agregadas, quitadas, movidas


# ---------------------------------------------------------------- salidas

COLUMNAS = ["orden", "id", "codigo", "tipo", "seccion_num", "seccion_nombre", "familia",
            "modulo_num", "modulo_nombre", "pagina_num", "titulo", "plantilla",
            "estado", "bloqueante", "folio", "nav", "archivo"]


def emitir_csv(filas, destino):
    with open(destino, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNAS, extrasaction="ignore")
        w.writeheader()
        for f in filas:
            w.writerow(f)


def emitir_fill(spec, filas, destino):
    """Contrato con Figma: por cada pagina, que plantilla instanciar y que poner
    en cada campo $. Si un valor es lista, se reparte entre los nodos repetidos
    de ese campo, en orden."""
    payload = {
        "manual": spec["manual"].get("marca", ""),
        "version": spec["manual"].get("version", ""),
        "figma_file": spec["manual"].get("figma_file", ""),
        "pagina_plantillas": spec["manual"].get("pagina_plantillas", ""),
        "total_paginas": sum(1 for f in filas if f["folio"] != ""),
        "total_frames": len(filas),
        "paginas": [
            {
                "orden": f["orden"],
                "id": f["id"],
                "codigo": f["codigo"],
                "archivo": f["archivo"],
                "plantilla": f["plantilla"],
                "estado": f["estado"],
                "campos": f["campos"],
            }
            for f in filas
        ],
    }
    Path(destino).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


SIMBOLO = {"completo": "●", "basico": "◐", "muestra": "◐",
           "pendiente": "○", "bloqueado": "✗"}


def emitir_indice(spec, filas, destino):
    manual = spec["manual"]
    out = [f'# {manual.get("marca","")} — {manual.get("titulo","")} `{manual.get("version","")}`', ""]

    total = sum(1 for f in filas if f["folio"] != "")
    out.append(f"{total} páginas numeradas · {len(filas)} frames · generado por espinazo")
    out.append("")
    out.append("`●` completo `◐` básico/muestra `○` pendiente `✗` bloqueado")
    out.append("")

    seccion_actual = None
    modulo_actual = None
    for f in filas:
        if f["tipo"] == "portada":
            out.append(f'**{f["archivo"]}** — portada')
            out.append("")
            continue
        if f["tipo"] == "divisoria":
            seccion_actual = f["codigo"]
            modulo_actual = None
            out.append(f'## {f["codigo"]} · {f["seccion_nombre"]}  ·  familia {f["familia"]}')
            out.append("")
            continue
        if f["modulo_num"] != modulo_actual:
            modulo_actual = f["modulo_num"]
            out.append("")
            out.append(f'**{f["seccion_num"]}.{f["modulo_num"]} {f["modulo_nombre"]}**')
            out.append("")
        marca = SIMBOLO.get(f["estado"], "○")
        folio = f'p. {f["folio"]}' if f["folio"] != "" else "—"
        linea = f'- {marca} `{f["codigo"]}` {f["titulo"]} · {f["plantilla"]} · {folio}'
        if f["bloqueante"]:
            linea += f'  \n  ↳ **bloqueado:** {f["bloqueante"]}'
        out.append(linea)
    out.append("")

    # resumen por familia y por estado
    out.append("## Resumen")
    out.append("")
    por_fam, por_est = {}, {}
    for f in filas:
        if f["tipo"] != "contenido":
            continue
        por_fam[f["familia"]] = por_fam.get(f["familia"], 0) + 1
        por_est[f["estado"]] = por_est.get(f["estado"], 0) + 1
    out.append("| Familia | Páginas |")
    out.append("| --- | ---: |")
    for fam in sorted(por_fam):
        out.append(f"| {fam} | {por_fam[fam]} |")
    out.append("")
    out.append("| Estado | Páginas |")
    out.append("| --- | ---: |")
    for est in ESTADOS:
        if est in por_est:
            out.append(f"| {SIMBOLO[est]} {est} | {por_est[est]} |")
    out.append("")

    Path(destino).write_text("\n".join(out), encoding="utf-8")


# ---------------------------------------------------------------- cli

def main():
    ap = argparse.ArgumentParser(description="Genera y valida el espinazo de un manual de marca.")
    ap.add_argument("espinazo", help="archivo YAML del manual")
    ap.add_argument("--salida", default="build", help="carpeta de salida (por defecto: build)")
    ap.add_argument("--diff", metavar="FIGMA_FILL", help="compara contra un figma-fill.json anterior")
    args = ap.parse_args()

    spec = yaml.safe_load(Path(args.espinazo).read_text(encoding="utf-8"))
    filas = construir(spec)
    problemas = validar(spec, filas)

    destino = Path(args.salida)
    destino.mkdir(parents=True, exist_ok=True)
    emitir_csv(filas, destino / "espinazo.csv")
    emitir_fill(spec, filas, destino / "figma-fill.json")
    emitir_indice(spec, filas, destino / "indice.md")

    marca = spec["manual"].get("marca", "")
    numeradas = sum(1 for f in filas if f["folio"] != "")
    print(f"\n{marca} · {spec['manual'].get('version','')}")
    print(f"{len(filas)} frames · {numeradas} páginas numeradas · "
          f"{sum(1 for f in filas if f['tipo'] == 'divisoria')} divisorias")

    bloqueadas = [f for f in filas if f["estado"] == "bloqueado"]
    if bloqueadas:
        print(f"\nBloqueadas ({len(bloqueadas)}):")
        for f in bloqueadas:
            print(f'  ✗ {f["codigo"]} {f["titulo"]} — {f["bloqueante"]}')

    if args.diff:
        agregadas, quitadas, movidas = diff(filas, args.diff)
        print(f"\nDiff contra {args.diff}:")
        if not (agregadas or quitadas or movidas):
            print("  sin cambios de estructura")
        for a in agregadas:
            print(f"  + {a}")
        for q in quitadas:
            print(f"  - {q}")
        for m in movidas:
            print(f"  ~ {m} cambió de código")

    errores = [p for p in problemas if p.nivel == "ERROR"]
    avisos = [p for p in problemas if p.nivel == "AVISO"]
    print(f"\nValidación: {len(errores)} errores, {len(avisos)} avisos")
    for p in problemas:
        print(p)

    print(f"\nEscrito en {destino}/ → espinazo.csv, figma-fill.json, indice.md\n")
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
