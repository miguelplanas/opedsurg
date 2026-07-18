"""Ingesta de examenes FEA Cirugia Pediatrica del SAS (Andalucia).

Autocontenido: no depende del resto del pipeline. Uso:

    python -m ingest.andalucia                # los 4 examenes
    python -m ingest.andalucia andalucia-2021 # uno concreto

Extrae con pdftotext -layout (los PDFs tienen capa de texto), valida
invariantes duras y solo escribe data/exams/<id>.json si todo cuadra.
Si algo falla escribe data/flags/<id>.json y no emite el dataset.
"""

from __future__ import annotations

import glob
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAM_DIR = ROOT / "examenes" / "andalucia"
OUT_DIR = ROOT / "data" / "exams"
FLAG_DIR = ROOT / "data" / "flags"

# Rangos comunes a los 4 examenes (verificados en instrucciones y planillas):
# teorico 1-100, practico 101-150, reservas del teorico 151-153.
THEORY_NUMS = list(range(1, 101))
PRACTICAL_NUMS = list(range(101, 151))
RESERVE_NUMS = list(range(151, 154))
ALL_NUMS = THEORY_NUMS + PRACTICAL_NUMS + RESERVE_NUMS

CONFIG = {
    "andalucia-2015": {
        "exam_glob": "Examen Andaluci*a 2015.pdf",
        "answers_glob": "Respuestas Andaluci*a 2015.pdf",
        "title": "FEA Cirugía Pediátrica · SAS Andalucía 2015",
    },
    "andalucia-2018": {
        "exam_glob": "Examen Andaluci*a 2018.pdf",
        "answers_glob": "Respuestas Andaluci*a 2018.pdf",
        "title": "FEA Cirugía Pediátrica · SAS Andalucía 2018",
    },
    "andalucia-2021": {
        "exam_glob": "Examen Andalucia 2021.pdf",
        "answers_glob": "Respuestas Andalucia 2021.pdf",
        "title": "FEA Cirugía Pediátrica · SAS Andalucía 2021",
    },
    "andalucia-sas-2025": {
        "exam_glob": "Examen OPE SAS 2025.pdf",
        "answers_glob": "Respuestas OPE SAS 2025.pdf",
        "title": "FEA Cirugía Pediátrica · OPE SAS Andalucía 2025",
    },
}

SECTION_RE = re.compile(r"(TEÓRICO|PRÁCTICO|RESERVA)\s*$")
HEADER_CAT_RE = re.compile(r"CIRUGÍA PEDIÁTRICA.*CUESTIONARIO\s*$")
FOOTER_RE = re.compile(r"^\s*Página \d+ de \d+\s*$")
POST_HEADER_RE = re.compile(r"^\s*(Turno libre|PREGUNTAS ACCESO LIBRE)\s*$")
QNUM_RE = re.compile(r"^\s{0,3}(\d{1,3})(?:[ \t]+(\S.*))?$")
OPT_RE = re.compile(r"^\s*([A-D])\)\s*(.*)$")
CASO_RE = re.compile(r"^\s*CASO\s+", re.IGNORECASE)
ANSWER_RE = re.compile(r"(?<![\w])(\d{1,3})\s*(ANULADA|[A-D])(?![\w])")

SECTION_TO_PART = {"TEÓRICO": "comun", "PRÁCTICO": "especifica", "RESERVA": "reserva"}


def find_pdf(pattern: str) -> Path:
    # Los nombres llevan acentos que pueden estar en NFC o NFD segun el
    # sistema de ficheros; casamos por nombre normalizado.
    want = unicodedata.normalize("NFC", pattern.replace("*", ""))
    matches = [
        p
        for p in EXAM_DIR.iterdir()
        if unicodedata.normalize("NFC", p.name) == want
    ]
    if not matches:
        matches = [Path(p) for p in glob.glob(str(EXAM_DIR / pattern))]
    if len(matches) != 1:
        raise FileNotFoundError(f"esperaba 1 PDF para {pattern!r}, hay {len(matches)}")
    return matches[0]


def pdftotext_layout(pdf: Path) -> str:
    res = subprocess.run(
        ["pdftotext", "-layout", str(pdf), "-"],
        capture_output=True,
        text=True,
        check=True,
    )
    if not res.stdout.strip():
        raise RuntimeError(f"pdftotext no devolvio texto para {pdf}")
    return res.stdout


def normalize_lines(lines: list[str]) -> str:
    """Une lineas de un campo: conserva guiones de compuestos a final de
    linea (abdomino- / pelvica -> abdomino-pelvica) y normaliza espacios."""
    out = ""
    for raw in lines:
        piece = " ".join(raw.split())
        if not piece:
            continue
        if not out:
            out = piece
        elif out.endswith("-"):
            out += piece
        else:
            out += " " + piece
    return out.strip()


def split_section_pages(text: str, errors: list[str]):
    """Devuelve dict seccion -> lista de lineas de contenido (sin
    cabeceras ni pies), en orden de lectura.

    Solo la primera pagina de cada seccion lleva cabecera con la etiqueta
    (TEÓRICO/PRÁCTICO/RESERVA); las paginas de continuacion se reconocen
    porque llevan pie ‹‹Página X de Y›› y se asignan a la seccion en curso.
    Portada, instrucciones y contraportada no tienen ni una cosa ni otra.
    """
    sections: dict[str, list[str]] = {"comun": [], "especifica": [], "reserva": []}
    current = None
    for page_no, page in enumerate(text.split("\f"), start=1):
        lines = page.splitlines()
        nonblank_seen = 0
        cat_idx = None
        for i, ln in enumerate(lines):
            if not ln.strip():
                continue
            nonblank_seen += 1
            if HEADER_CAT_RE.search(ln):
                cat_idx = i
                break
            if nonblank_seen >= 5:
                break
        if cat_idx is not None:
            section = None
            sec_idx = None
            for j in range(cat_idx, min(cat_idx + 6, len(lines))):
                m = SECTION_RE.search(lines[j])
                if m:
                    section = SECTION_TO_PART[m.group(1)]
                    sec_idx = j
                    break
            if section is None:
                errors.append(f"pagina {page_no}: cabecera de categoria sin etiqueta de seccion")
                continue
            current = section
            body = lines[sec_idx + 1 :]
            # lineas residuales de cabecera justo debajo (Turno libre, etc.)
            while body and (not body[0].strip() or POST_HEADER_RE.match(body[0])):
                body.pop(0)
        elif current is not None and any(FOOTER_RE.match(ln) for ln in lines):
            body = lines  # pagina de continuacion de la seccion en curso
        else:
            continue  # portada, instrucciones, contraportada
        body = [ln for ln in body if not FOOTER_RE.match(ln) and not POST_HEADER_RE.match(ln)]
        sections[current].extend(body)
    return sections


def parse_questions(lines: list[str], expected_nums: list[int], section: str, errors: list[str]):
    """Maquina de estados sobre las lineas de una seccion.

    Una pregunta solo puede empezar cuando la anterior esta completa
    (4 opciones) y su numero es exactamente el siguiente esperado, con
    indentacion <= 3 espacios (las continuaciones van mas indentadas).
    Los bloques CASO ... entre preguntas se anteponen al enunciado de la
    primera pregunta que les sigue (igual que hace el propio PDF de 2015).
    """
    questions = []
    idx = 0  # siguiente numero esperado
    cur = None  # {'number', 'stem': [lines], 'options': {L: [lines]}}
    cur_field = None  # lista de lineas activa
    caso: list[str] = []
    in_caso = False

    def complete(q) -> bool:
        return q is not None and len(q["options"]) == 4

    def flush(q):
        stem = normalize_lines(q["stem"])
        if q["caso"]:
            stem = normalize_lines(q["caso"]) + "\n\n" + stem
        opts = {L: normalize_lines(ls) for L, ls in q["options"].items()}
        questions.append({"number": q["number"], "stem": stem, "options": opts})

    for ln in lines:
        if not ln.strip():
            continue
        m = QNUM_RE.match(ln)
        if m and idx < len(expected_nums) and int(m.group(1)) == expected_nums[idx] and (cur is None or complete(cur)):
            if cur is not None:
                flush(cur)
            cur = {
                "number": expected_nums[idx],
                "stem": [m.group(2) or ""],
                "options": {},
                "caso": caso,
            }
            caso = []
            in_caso = False
            cur_field = cur["stem"]
            idx += 1
            continue
        om = OPT_RE.match(ln)
        if om and cur is not None:
            letter = om.group(1)
            expected_letter = "ABCD"[len(cur["options"])] if len(cur["options"]) < 4 else None
            if letter == expected_letter and not complete(cur):
                cur["options"][letter] = [om.group(2)]
                cur_field = cur["options"][letter]
                continue
        if cur is None or complete(cur):
            if CASO_RE.match(ln):
                in_caso = True
                caso.append(ln)
                continue
            if in_caso:
                caso.append(ln)
                continue
            if cur is None:
                errors.append(f"{section}: texto inesperado antes de la primera pregunta: {ln.strip()[:80]!r}")
                continue
            # continuacion de la opcion D tras completar la pregunta
            cur_field.append(ln)
            continue
        cur_field.append(ln)

    if cur is not None:
        if not complete(cur):
            errors.append(f"{section}: pregunta {cur['number']} incompleta ({len(cur['options'])} opciones)")
        flush(cur)
    if idx != len(expected_nums):
        errors.append(
            f"{section}: esperaba {len(expected_nums)} preguntas, encontradas {idx} "
            f"(se detuvo antes de la {expected_nums[idx] if idx < len(expected_nums) else '?'})"
        )
    if in_caso or caso:
        errors.append(f"{section}: bloque CASO colgante al final de la seccion")
    return questions


def parse_answers(text: str, errors: list[str]):
    """Planilla: tabla con pares numero/letra (o ANULADA). Devuelve
    (dict numero->letra|None, 'provisional'|'definitiva'|'desconocido')."""
    lines = text.splitlines()
    start = 0
    for i, ln in enumerate(lines):
        if "Orden" in ln:
            start = i + 1
    answers: dict[int, str | None] = {}
    for ln in lines[start:]:
        for num_s, val in ANSWER_RE.findall(ln):
            num = int(num_s)
            if num in answers:
                errors.append(f"planilla: numero {num} duplicado")
            answers[num] = None if val == "ANULADA" else val
    missing = [n for n in ALL_NUMS if n not in answers]
    extra = sorted(set(answers) - set(ALL_NUMS))
    if missing:
        errors.append(f"planilla: faltan respuestas para {missing}")
    if extra:
        errors.append(f"planilla: numeros fuera de rango {extra}")
    low = text.lower()
    if "provisional" in low:
        kind = "provisional"
    elif "definitiva" in low:
        kind = "definitiva"
    else:
        kind = "desconocido"
        errors.append("planilla: no se pudo determinar si es provisional o definitiva")
    return answers, kind


def build_exam(exam_id: str):
    cfg = CONFIG[exam_id]
    errors: list[str] = []

    exam_pdf = find_pdf(cfg["exam_glob"])
    ans_pdf = find_pdf(cfg["answers_glob"])
    exam_text = pdftotext_layout(exam_pdf)
    ans_text = pdftotext_layout(ans_pdf)

    sections = split_section_pages(exam_text, errors)
    theory = parse_questions(sections["comun"], THEORY_NUMS, "teorico", errors)
    practical = parse_questions(sections["especifica"], PRACTICAL_NUMS, "practico", errors)
    reserve = parse_questions(sections["reserva"], RESERVE_NUMS, "reserva", errors)
    answers, plantilla_kind = parse_answers(ans_text, errors)

    questions = []

    def add(parsed, part, id_prefix, id_start, reserve_flag):
        for k, q in enumerate(parsed):
            num = q["number"]
            ans = answers.get(num, "?")
            if ans == "?":
                errors.append(f"pregunta {num}: sin respuesta en planilla")
                ans = None
            status = "nula" if ans is None else "ok"
            if ans is not None and ans not in "ABCD":
                errors.append(f"pregunta {num}: respuesta invalida {ans!r}")
            if not q["stem"]:
                errors.append(f"pregunta {num}: enunciado vacio")
            for L in "ABCD":
                if not q["options"].get(L):
                    errors.append(f"pregunta {num}: opcion {L} vacia")
            questions.append(
                {
                    "id": f"{id_prefix}{id_start + k}",
                    "part": part,
                    "number": num,
                    "reserve": reserve_flag,
                    "stem": q["stem"],
                    "options": q["options"],
                    "answer": ans,
                    "status": status,
                }
            )

    add(theory, "comun", "C", 1, False)
    add(reserve, "comun", "C", 101, True)
    add(practical, "especifica", "E", 1, False)

    # Invariantes duras finales
    if len(theory) != 100:
        errors.append(f"teorico: {len(theory)} preguntas (esperaba 100)")
    if len(practical) != 50:
        errors.append(f"practico: {len(practical)} preguntas (esperaba 50)")
    if len(reserve) != 3:
        errors.append(f"reserva: {len(reserve)} preguntas (esperaba 3)")
    got_nums = sorted(q["number"] for q in questions)
    if not errors and got_nums != sorted(ALL_NUMS):
        errors.append("numeracion final no coincide con 1-153")

    nulas = sorted(q["number"] for q in questions if q["status"] == "nula")

    if errors:
        FLAG_DIR.mkdir(parents=True, exist_ok=True)
        flag_path = FLAG_DIR / f"{exam_id}.json"
        flag_path.write_text(
            json.dumps([{"reason": e} for e in errors], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return False, {"errors": errors, "flag": str(flag_path), "plantilla": plantilla_kind}

    data = {
        "id": exam_id,
        "title": cfg["title"],
        "language": "es",
        "counts": {"comun": 103, "especifica": 50},
        "partLabels": {"comun": "Teórico", "especifica": "Práctico"},
        "questions": questions,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{exam_id}.json"
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # si habia un flag antiguo de una ejecucion fallida, ya no aplica
    old_flag = FLAG_DIR / f"{exam_id}.json"
    if old_flag.exists():
        old_flag.unlink()
    return True, {
        "out": str(out_path),
        "plantilla": plantilla_kind,
        "nulas": nulas,
        "counts": {"teorico": len(theory), "practico": len(practical), "reservas": len(reserve)},
    }


def main(argv: list[str]) -> int:
    ids = argv or list(CONFIG)
    rc = 0
    for exam_id in ids:
        if exam_id not in CONFIG:
            print(f"[{exam_id}] id desconocido; validos: {', '.join(CONFIG)}")
            rc = 1
            continue
        ok, info = build_exam(exam_id)
        if ok:
            print(
                f"[{exam_id}] OK -> {info['out']} | planilla {info['plantilla']} | "
                f"teorico {info['counts']['teorico']} practico {info['counts']['practico']} "
                f"reservas {info['counts']['reservas']} | anuladas: {info['nulas'] or 'ninguna'}"
            )
        else:
            rc = 1
            print(f"[{exam_id}] BLOQUEADO (planilla {info['plantilla']}) -> {info['flag']}")
            for e in info["errors"]:
                print(f"    - {e}")
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
