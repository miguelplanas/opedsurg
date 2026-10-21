"""Ingesta del examen FEA Cirugía Pediátrica SESCAM 2021 (Castilla-La Mancha).

Autocontenido: no toca el resto del pipeline. Uso: `python -m ingest.clm`.

Fuentes (examenes/2021-castilla-la-mancha/):
- "Examen Castilla La Mancha.pdf": 31 páginas escaneadas sin capa de texto.
  Página 0 = portada (ruido de marca de agua "SESCAM" repetido), se salta.
  Desde la primera página con preguntas: numeradas 1..105 (100 + 5 de reserva,
  numeración continua, SIN rótulo de reserva) con opciones en minúscula
  "a) .. d)" que normalizamos a claves A/B/C/D.
- "Respuestas Castilla La Mancha.pdf": PLANTILLA CORRECTORA DEFINITIVA, 1 página.
  Prosa (anula la 14 y la 57, sustituidas por las reservas 101 y 102) + tabla en
  columnas "1- B  16- B ...". La tabla se lee con ocr_boxes agrupando por
  geometría, con DOS lecturas independientes por celda (página completa vs
  recorte); discrepancia => flag y no se emite dataset.

Hallazgo clave: el PDF imprime 105 preguntas, pero la plantilla DEFINITIVA solo
puntúa 1..102 (14 y 57 anuladas, sustituidas por 101 y 102). Las reservas 103,
104 y 105 están impresas pero no tienen respuesta oficial, así que el examen
puntuado (y el dataset) es de 102 preguntas.

Salida: data/exams/2021-castilla-la-mancha.json si TODO valida; si no,
data/flags/2021-castilla-la-mancha.json con los problemas y sin dataset.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image

from ingest.ocr import Box, ocr_boxes
from ingest.render import render_pdf

ROOT = Path(__file__).resolve().parent.parent
EXAM_PDF = ROOT / "examenes/2021-castilla-la-mancha/Examen Castilla La Mancha.pdf"
ANSWERS_PDF = ROOT / "examenes/2021-castilla-la-mancha/Respuestas Castilla La Mancha.pdf"
OUT_JSON = ROOT / "data/exams/2021-castilla-la-mancha.json"
FLAGS_JSON = ROOT / "data/flags/2021-castilla-la-mancha.json"

EXAM_ID = "2021-castilla-la-mancha"
TITLE = "SESCAM Castilla-La Mancha 2021"
N_PRINTED = 105            # preguntas realmente impresas en el cuestionario
N_QUESTIONS = 102          # preguntas puntuadas (100 + 2 reservas usadas)
NULLED = {14, 57}          # anuladas según la plantilla correctora definitiva
RESERVES = {101, 102}      # reservas usadas como sustitutas de 14 y 57
UNUSED_RESERVES = {103, 104, 105}  # impresas pero sin respuesta oficial

# ---------------------------------------------------------------------------
# Preguntas
# ---------------------------------------------------------------------------

# "12. Texto..." al inicio de línea.
Q_START = re.compile(r"^(\d{1,3})\s*[.,]\s*(\S.*)$")
# "a) texto" / "b) ..." (el OCR a veces lee "a}" o "a )").
OPT_START = re.compile(r"^([a-dA-D])\s*[)\}\]]\s*(.*)$")


def is_cover(lines: list[str]) -> bool:
    """La portada es ruido de marca de agua: 'SESCAM' repetido muchas veces."""
    text = " ".join(lines).upper()
    return text.count("SESCAM") >= 5


def clean_line(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def page_lines(boxes: list[Box]) -> list[str]:
    """Reagrupa cajas en líneas por geometría (como ocr_lines pero desde cajas)."""
    if not boxes:
        return []
    heights = [b.y1 - b.y0 for b in boxes]
    row_gap = (sum(heights) / len(heights)) * 0.6
    boxes = sorted(boxes, key=lambda b: b.cy)
    rows: list[list[Box]] = [[boxes[0]]]
    for b in boxes[1:]:
        if b.cy - rows[-1][-1].cy > row_gap:
            rows.append([b])
        else:
            rows[-1].append(b)
    lines = []
    for row in rows:
        row.sort(key=lambda b: b.x0)
        lines.append(clean_line(" ".join(b.text for b in row)))
    return [ln for ln in lines if ln]


def is_noise(line: str) -> bool:
    """Pies de página, códigos de barras y ruido de marca de agua."""
    up = line.upper()
    if up.count("SESCAM") >= 2:
        return True
    if re.fullmatch(r"P[AÁ]GINA?\s*\d+\s*(DE\s*\d+)?", up):
        return True
    if re.fullmatch(r"0{4,}\d*", line):
        return True
    if re.fullmatch(r"\d{5,}", line):
        return True
    return False


def parse_questions(pages) -> tuple[dict[int, dict], list[dict]]:
    """Devuelve ({numero: {stem, options}}, flags) para las 1..N_PRINTED."""
    flags: list[dict] = []
    questions: dict[int, dict] = {}

    cur_num: int | None = None
    cur_stem: list[str] = []
    cur_opts: dict[str, list[str]] = {}
    cur_letter: str | None = None

    def close_current():
        nonlocal cur_num, cur_stem, cur_opts, cur_letter
        if cur_num is None:
            return
        opts = {k.upper(): clean_line(" ".join(v)) for k, v in cur_opts.items()}
        questions[cur_num] = {"stem": clean_line(" ".join(cur_stem)), "options": opts}
        cur_num, cur_stem, cur_opts, cur_letter = None, [], {}, None

    for page in pages:
        lines = page_lines(ocr_boxes(page.image))
        if is_cover(lines):
            continue
        for line in lines:
            if is_noise(line):
                continue
            expected = (cur_num or 0) + 1
            m = Q_START.match(line)
            if m and int(m.group(1)) == expected and expected <= N_PRINTED:
                close_current()
                cur_num = expected
                cur_stem = [m.group(2)]
                cur_opts, cur_letter = {}, None
                continue
            m = OPT_START.match(line)
            if m and cur_num is not None:
                letter = m.group(1).lower()
                order = "abcd"
                nxt = order[len(cur_opts)] if len(cur_opts) < 4 else None
                if letter == nxt:
                    cur_letter = letter
                    cur_opts[letter] = [m.group(2)] if m.group(2) else []
                    continue
            # continuación de opción o de enunciado
            if cur_num is None:
                continue
            if cur_letter is not None:
                cur_opts[cur_letter].append(line)
            else:
                cur_stem.append(line)
    close_current()

    # invariantes sobre las preguntas puntuadas (1..N_QUESTIONS)
    for n in range(1, N_QUESTIONS + 1):
        q = questions.get(n)
        if q is None:
            flags.append({"question": n, "reason": "pregunta no encontrada"})
            continue
        if not q["stem"]:
            flags.append({"question": n, "reason": "enunciado vacío"})
        missing = [L for L in "ABCD" if not q["options"].get(L)]
        if missing:
            flags.append({"question": n, "reason": f"opciones vacías o ausentes: {missing}",
                          "options_found": sorted(q["options"])})
    # comprobación informativa: deben existir también las reservas impresas
    for n in sorted(UNUSED_RESERVES):
        if n not in questions:
            flags.append({"question": n, "reason": "reserva impresa esperada no encontrada"})
    return questions, flags


# ---------------------------------------------------------------------------
# Plantilla de respuestas (tabla "1- B  16- B ..." en columnas)
# ---------------------------------------------------------------------------

def _norm(text: str) -> str:
    return re.sub(r"\s+", "", text).upper()


def _classify_cell(text: str):
    """Interpreta el texto de una celda -> (n, letra|None, estado) o None.

    estado: 'ok' (letra A-D) o 'nula' (Anulada).
    """
    t = _norm(text)
    m = re.fullmatch(r"(\d{1,3})[.,]?[-–]?([ABCD])", t)
    if m:
        return (int(m.group(1)), m.group(2), "ok")
    m = re.fullmatch(r"(\d{1,3})[.,]?[-–]?ANULADA", t)
    if m:
        return (int(m.group(1)), None, "nula")
    return None


def read_answers_full(boxes: list[Box]):
    """Lectura A: sobre las cajas de página completa.

    Cada celda puede venir como caja única ("16- B", "57- Anulada") o como
    número suelto ("16-") + valor suelto ("B"/"Anulada") a la derecha.
    Devuelve {n: (letra|None, estado)} y flags.
    """
    result: dict[int, tuple] = {}
    flags: list[dict] = []
    num_only: list[tuple[int, Box]] = []
    value_only: list[Box] = []

    for b in boxes:
        cell = _classify_cell(b.text)
        if cell:
            n, L, st = cell
            result[n] = (L, st)
            continue
        t = _norm(b.text)
        m = re.fullmatch(r"(\d{1,3})[.,]?[-–]?", t)
        if m and t not in ("-", "–"):
            num_only.append((int(m.group(1)), b))
            continue
        if re.fullmatch(r"[ABCD]", t) or "ANULADA" in t:
            value_only.append(b)

    for n, nb in num_only:
        if n in result:
            continue
        h = nb.y1 - nb.y0
        cands = [b for b in value_only if b.cx > nb.cx and abs(b.cy - nb.cy) < h * 0.8]
        if not cands:
            flags.append({"question": n, "reason": "número sin valor a la derecha (lectura A)"})
            continue
        vb = min(cands, key=lambda b: b.cx - nb.cx)
        v = _norm(vb.text)
        if "ANULADA" in v:
            result[n] = (None, "nula")
        elif re.fullmatch(r"[ABCD]", v):
            result[n] = (v, "ok")
        else:
            flags.append({"question": n, "reason": f"valor ilegible (lectura A): {vb.text!r}"})
    return result, flags


def read_answers_crops(boxes: list[Box], image: Image.Image):
    """Lectura B independiente: recorta cada celda (número + zona del valor) y
    la OCRea en aislado. Devuelve {n: (letra|None, estado)} y flags."""
    result: dict[int, tuple] = {}
    flags: list[dict] = []
    for b in boxes:
        t = _norm(b.text)
        m = re.match(r"^(\d{1,3})[.,]?[-–]", t)
        if not m:
            continue
        n = int(m.group(1))
        if not (1 <= n <= N_QUESTIONS):
            continue
        h = b.y1 - b.y0
        w = b.x1 - b.x0
        crop = image.crop((int(b.x0 - h * 0.3), int(b.y0 - h * 0.5),
                           int(b.x1 + max(w, h * 6)), int(b.y1 + h * 0.5)))
        sub = ocr_boxes(crop)
        text = _norm(" ".join(x.text for x in sorted(sub, key=lambda s: s.x0)))
        # El recorte es ancho (h*6) y a menudo alcanza la celda de la columna
        # siguiente ("1-B16-B"). Basta con la PRIMERA celda del recorte: es la
        # que corresponde a este numero y sigue siendo una lectura OCR
        # independiente de la de pagina completa (distinto recorte/escala).
        # Entre el numero y la letra el recorte a veces mete ruido de OCR
        # ("96-SOD" -> D, "102-NOA" -> A); el valor es la PRIMERA letra
        # valida tras el numero. La lectura A (pagina completa) sigue
        # validando por consenso, asi que un ruido que cambiara la letra se
        # detectaria como discrepancia en vez de emitirse en silencio.
        m = re.match(r"(\d{1,3})[^ABCD]*(ANULADA|[ABCD])", text)
        if m is None or int(m.group(1)) != n:
            flags.append({"question": n, "reason": "celda ilegible en lectura B",
                          "crop_text": text})
            continue
        val = m.group(2)
        result[n] = (None, "nula") if val == "ANULADA" else (val, "ok")
    return result, flags


def parse_answers_page(image: Image.Image):
    """Doble lectura y consenso. Devuelve {n: (letra|None, estado)} validado."""
    boxes = ocr_boxes(image)
    read_a, flags_a = read_answers_full(boxes)
    read_b, flags_b = read_answers_crops(boxes, image)
    flags = flags_a + flags_b
    answers: dict[int, tuple] = {}
    for n in sorted(set(read_a) | set(read_b)):
        a, b = read_a.get(n), read_b.get(n)
        if a is not None and a == b:
            answers[n] = a
        else:
            flags.append({"question": n, "reason": "discrepancia doble lectura",
                          "read_a": a, "read_b": b})
    return answers, flags


def check_prose(image: Image.Image) -> list[dict]:
    """Valida que la prosa confirma anulación de 14 y 57 y sustitución por 101/102."""
    flags: list[dict] = []
    text = " ".join(page_lines(ocr_boxes(image)))
    norm = re.sub(r"\s+", " ", text)
    if not re.search(r"anuladas?\s+las?\s+preguntas?\s+n[ºo°]?\s*14\s+y\s+57", norm, re.I):
        flags.append({"reason": "la prosa no confirma la anulación de 14 y 57", "text": norm[:300]})
    if not re.search(r"reserva\s+n[ºo°]?\s*101\s+y\s+102", norm, re.I):
        flags.append({"reason": "la prosa no confirma sustitución por reservas 101 y 102"})
    if "PLANTILLA CORRECTORA DEFINITIVA" not in norm.upper():
        flags.append({"reason": "no es la plantilla correctora DEFINITIVA"})
    return flags


# ---------------------------------------------------------------------------
# Ensamblado y validación
# ---------------------------------------------------------------------------

def build() -> None:
    flags: list[dict] = []

    exam_pages = render_pdf(EXAM_PDF)
    questions, qflags = parse_questions(exam_pages)
    flags += qflags

    ans_page = render_pdf(ANSWERS_PDF, drop_blank=False)[0]
    flags += check_prose(ans_page.image)
    table, aflags = parse_answers_page(ans_page.image)
    flags += aflags

    # invariantes sobre la tabla de respuestas (debe cubrir 1..102)
    for n in range(1, N_QUESTIONS + 1):
        cell = table.get(n)
        if cell is None:
            flags.append({"question": n, "reason": "sin entrada en la tabla de respuestas"})
            continue
        letter, status = cell
        if n in NULLED:
            if status != "nula":
                flags.append({"question": n, "reason": f"esperada 'Anulada' en tabla, leído {cell}"})
        else:
            if status != "ok" or letter not in ("A", "B", "C", "D"):
                flags.append({"question": n, "reason": f"respuesta inválida en tabla: {cell}"})
    extra = sorted(n for n in table if not (1 <= n <= N_QUESTIONS))
    if extra:
        flags.append({"reason": f"respuestas para números fuera de 1..{N_QUESTIONS}: {extra}"})

    # construir preguntas puntuadas (1..102)
    out_questions = []
    for n in range(1, N_QUESTIONS + 1):
        q = questions.get(n, {"stem": "", "options": {}})
        letter, _tstatus = table.get(n, (None, "ok"))
        status = "nula" if n in NULLED else "ok"
        out_questions.append({
            "id": f"E{n}",
            "part": "especifica",
            "number": n,
            "reserve": n in RESERVES,
            "stem": q["stem"],
            "options": {L: q["options"].get(L, "") for L in "ABCD"},
            "answer": None if n in NULLED else letter,
            "status": status,
        })

    if flags:
        FLAGS_JSON.parent.mkdir(parents=True, exist_ok=True)
        FLAGS_JSON.write_text(json.dumps({
            "id": EXAM_ID,
            "flags": flags,
            "note": "dataset NO emitido: revisar flags",
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[FLAGS] {len(flags)} problemas -> {FLAGS_JSON}")
        for f in flags[:25]:
            print("  ", f)
        return

    dataset = {
        "id": EXAM_ID,
        "title": TITLE,
        "language": "es",
        "counts": {"comun": 0, "especifica": N_QUESTIONS},
        "partLabels": {"especifica": "Cuestionario"},
        "questions": out_questions,
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    if FLAGS_JSON.exists():
        FLAGS_JSON.unlink()
    print(f"[OK] {len(out_questions)} preguntas puntuadas -> {OUT_JSON}")
    print(f"  reservas usadas {sorted(RESERVES)}; anuladas {sorted(NULLED)} (answer=null)")
    print(f"  reservas impresas pero NO puntuadas (excluidas): {sorted(UNUSED_RESERVES)}")


if __name__ == "__main__":
    build()
