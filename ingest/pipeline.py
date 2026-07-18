"""Pipeline de ingesta: PDFs escaneados -> dataset JSON validado.

Uso:
    python -m ingest.pipeline <exam-id>

Espera la estructura:
    examenes/<exam-id>/parte-comun/*.pdf
    examenes/<exam-id>/parte-especifica/*.pdf
    examenes/<exam-id>/respuestas/*.pdf

Produce:
    data/exams/<exam-id>.json        (si valida)
    data/flags/<exam-id>.json        (si hay algo que revisar; bloquea la salida)
    actualiza data/manifest.json

Garantia de precision: la salida solo se escribe si TODAS las invariantes pasan
(conteos cuadrados, opciones completas, respuestas validas) y no hay flags de la
doble lectura de la planilla. Cualquier duda -> flags, nunca dato silencioso.
"""
from __future__ import annotations

import glob
import json
import re
import sys
from pathlib import Path

from ingest.ocr import ocr_lines
from ingest.parse_answers import parse_answers
from ingest.parse_questions import Question, parse_part
from ingest.render import render_pdf

ROOT = Path(__file__).resolve().parent.parent
EXAMENES = ROOT / "examenes"
DATA = ROOT / "data"

INSTRUCTIONS = re.compile(r"INSTRUCI[OÓ]NS", re.IGNORECASE)
# block -> (carpeta, prefijo de etiqueta en la planilla)
PARTS = {"comun": ("parte-comun", "C"), "especifica": ("parte-especifica", "E")}


def _find_pdf(exam_id: str, folder: str) -> str:
    matches = glob.glob(str(EXAMENES / exam_id / folder / "*.pdf"))
    if not matches:
        raise FileNotFoundError(f"no hay PDF en {exam_id}/{folder}")
    return matches[0]


def _load_overrides(exam_id: str) -> dict:
    """Ajustes manuales por examen: examenes/<exam-id>/overrides.json (opcional).

    Campos soportados:
      missing: lista de etiquetas de la planilla (p.ej. ["E109", "E110"])
        cuya pregunta NO existe en el PDF fuente (documentar el motivo en
        "reason"). Esas etiquetas se descartan de la planilla antes de
        emparejar: no cuentan para el invariante de conteo, no generan flags
        y no entran en el dataset. Solo tiene sentido para etiquetas al
        final de un bloque (el emparejamiento es posicional); si una
        etiqueta declarada ausente coincide con una pregunta extraida, se
        bloquea igualmente. Cualquier otra discrepancia sigue bloqueando.
      reason: texto libre que documenta el motivo de las ausencias.
      title: titulo legible del examen (por defecto se deriva del id).
      language: idioma del examen (por defecto "gl").
    """
    path = EXAMENES / exam_id / "overrides.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _part_lines(pdf: str) -> list[str]:
    """OCR de las paginas de preguntas, saltando portada/instrucciones."""
    lines: list[str] = []
    for pg in render_pdf(pdf):
        page_lines = ocr_lines(pg.image)
        if any(INSTRUCTIONS.search(ln) for ln in page_lines):
            continue
        lines.extend(page_lines)
    return lines


def _question_records(exam_id: str) -> tuple[dict, list[str]]:
    """Parsea ambas partes. Devuelve (por_prefijo, errores)."""
    errors: list[str] = []
    by_prefix: dict[str, list[Question]] = {}
    for block, (folder, prefix) in PARTS.items():
        parsed = parse_part(_part_lines(_find_pdf(exam_id, folder)))
        ordered = parsed["main"] + parsed["reserve"]
        for q in ordered:
            if not q.is_complete():
                errors.append(f"{block} pregunta {q.number} incompleta")
        by_prefix[prefix] = ordered
        by_prefix[f"{prefix}_main"] = parsed["main"]
    return by_prefix, errors


def build_exam(exam_id: str) -> dict:
    """Ejecuta el pipeline y devuelve {'exam': ..., 'flags': [...]}."""
    flags: list[dict] = []
    overrides = _load_overrides(exam_id)
    missing = set(overrides.get("missing", []))

    by_prefix, q_errors = _question_records(exam_id)
    flags += [{"reason": e} for e in q_errors]

    # Planilla de respuestas (pagina 0 = rejilla principal).
    ans_pdf = _find_pdf(exam_id, "respuestas")
    grid = render_pdf(ans_pdf, drop_blank=False)[0]
    ans_res = parse_answers(grid.image, blocks=tuple(p for _, p in PARTS.values()))
    # Etiquetas declaradas ausentes (overrides.json): su pregunta no existe
    # en el PDF fuente, asi que se descartan de la planilla y no generan flags.
    answers = {lab: a for lab, a in ans_res["answers"].items()
               if lab not in missing}
    flags += [f for f in ans_res["flags"] if f.get("label") not in missing]

    # Emparejar preguntas <-> respuestas por etiqueta posicional.
    questions_out: list[dict] = []
    for block, (_, prefix) in PARTS.items():
        ordered = by_prefix[prefix]
        n_main = len(by_prefix[f"{prefix}_main"])
        n_ans = sum(1 for lab in answers if lab.startswith(prefix)
                    and lab[1:].isdigit())
        # Seguridad: una etiqueta declarada ausente no puede corresponder a
        # una pregunta que si se ha extraido (indicaria overrides erroneos).
        for lab in sorted(missing):
            if lab.startswith(prefix) and lab[1:].isdigit() \
                    and int(lab[1:]) <= len(ordered):
                flags.append({"reason": f"{lab}: declarada ausente en "
                                        f"overrides.json pero hay pregunta "
                                        f"extraida"})
        # Invariante de conteo: preguntas extraidas == respuestas de ese bloque.
        if len(ordered) != n_ans:
            flags.append({"reason": f"{block}: {len(ordered)} preguntas pero "
                                    f"{n_ans} respuestas en la planilla"})
        for idx, q in enumerate(ordered):
            label = f"{prefix}{idx + 1}"
            is_reserve = idx >= n_main
            a = answers.get(label)
            if a is None:
                flags.append({"reason": f"{label}: sin respuesta en la planilla"})
                continue
            if a.status in ("ok", "modificada") and a.letter not in q.options:
                flags.append({"reason": f"{label}: respuesta {a.letter} no esta "
                                        f"entre las opciones"})
                continue
            questions_out.append({
                "id": label,
                "part": block,
                "number": q.number,
                "reserve": is_reserve,
                "stem": q.stem,
                "options": q.options,
                "answer": a.letter,
                "status": a.status,
            })

    exam = {
        "id": exam_id,
        "title": overrides.get("title") or exam_id.replace("-", " ").title(),
        "language": overrides.get("language", "gl"),
        "counts": {
            "comun": sum(1 for q in questions_out if q["part"] == "comun"),
            "especifica": sum(1 for q in questions_out if q["part"] == "especifica"),
        },
        "questions": questions_out,
    }
    return {"exam": exam, "flags": flags}


def _update_manifest() -> None:
    exams = []
    for f in sorted((DATA / "exams").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        entry = {"id": d["id"], "title": d["title"],
                 "counts": d["counts"], "language": d["language"]}
        # partLabels es opcional; incluirlo para que la Home muestre las
        # etiquetas correctas (p.ej. Teórico/Práctico) sin cargar el examen.
        if d.get("partLabels"):
            entry["partLabels"] = d["partLabels"]
        exams.append(entry)
    (DATA / "manifest.json").write_text(
        json.dumps({"exams": exams}, ensure_ascii=False, indent=2), encoding="utf-8")


def main(exam_id: str) -> int:
    (DATA / "exams").mkdir(parents=True, exist_ok=True)
    (DATA / "flags").mkdir(parents=True, exist_ok=True)

    result = build_exam(exam_id)
    flags, exam = result["flags"], result["exam"]
    flag_path = DATA / "flags" / f"{exam_id}.json"

    if flags:
        flag_path.write_text(json.dumps(flags, ensure_ascii=False, indent=2),
                             encoding="utf-8")
        print(f"[BLOQUEADO] {exam_id}: {len(flags)} incidencia(s). "
              f"Revisa {flag_path}. No se escribe el dataset.")
        for fl in flags[:10]:
            print("   -", fl.get("reason") or fl)
        return 1

    flag_path.unlink(missing_ok=True)
    out = DATA / "exams" / f"{exam_id}.json"
    out.write_text(json.dumps(exam, ensure_ascii=False, indent=2), encoding="utf-8")
    _update_manifest()
    _sync_web()
    print(f"[OK] {exam_id}: {exam['counts']} -> {out}")
    return 0


def _sync_web() -> None:
    """Copia el dataset a la carpeta publica de la web (si existe)."""
    web_data = ROOT / "web" / "public" / "data"
    if not (ROOT / "web").exists():
        return
    (web_data / "exams").mkdir(parents=True, exist_ok=True)
    import shutil
    for f in (DATA / "exams").glob("*.json"):
        shutil.copy2(f, web_data / "exams" / f.name)
    shutil.copy2(DATA / "manifest.json", web_data / "manifest.json")


def sync() -> int:
    """Regenera el manifest desde data/exams y lo copia (con los datasets) a
    la web. Util tras ejecutar ingestas autocontenidas (andalucia, clm) que
    escriben data/exams pero no tocan el manifest ni la carpeta publica."""
    _update_manifest()
    _sync_web()
    exams = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))["exams"]
    print(f"[SYNC] {len(exams)} examen(es) en el manifest:")
    for e in exams:
        print(f"   - {e['id']}: {e['title']} {e['counts']}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "sync":
        sys.exit(sync())
    if len(sys.argv) != 2:
        print("uso: python -m ingest.pipeline <exam-id> | sync")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
