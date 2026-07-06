"""Parser por reglas: lineas OCR -> preguntas estructuradas.

Estructura real de estos examenes (confirmada en la muestra):
  - Cada parte tiene un bloque PRINCIPAL de preguntas numeradas 1..N y un bloque
    de RESERVA que reinicia la numeracion en 1, bajo el titulo "Preguntas de
    reserva".
      * Comun:      10 principales + 2 de reserva   -> C1..C10 y C11..C12
      * Especifica: 100 principales + 10 de reserva -> E1..E100 y E101..E110
  - Preguntas: linea que empieza por "N. " con N secuencial y espacio despues
    del punto. (Las instrucciones tipo "1.- Non abra" se filtran saltando las
    paginas de instrucciones antes de llegar aqui; ver pipeline.)
  - Opciones: "A) ..." "B) ..." "C) ..." "D) ...".
  - Continuaciones: lineas que no encajan se anexan al elemento anterior.
  - Cabecera de pagina y codigo de barras del pie se descartan.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# Exige espacio tras el punto: evita "25.1" y las instrucciones "1.- Non abra".
Q_START = re.compile(r"^\s*(\d{1,3})\.\s+(\S.*)$")
OPT_START = re.compile(r"^\s*([A-D])\s*\)\s*(.*)$", re.IGNORECASE)
FOOTER_CODE = re.compile(r"^\s*\d{12,}\s*$")
HEADER = re.compile(r"ejercicio\s+(com[uú]n|espec[ií]fico)|OPE\s+\d{4}\s+FEA",
                    re.IGNORECASE)
RESERVE_MARK = re.compile(r"preguntas\s+de\s+reserva", re.IGNORECASE)


@dataclass
class Question:
    number: int
    stem: str = ""
    options: dict[str, str] = field(default_factory=dict)

    def is_complete(self) -> bool:
        return set(self.options) == {"A", "B", "C", "D"} and bool(self.stem.strip())


def _clean(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def _parse_sequential(lines: list[str]) -> list[Question]:
    """Parsea un bloque de preguntas con numeracion secuencial desde 1."""
    questions: list[Question] = []
    current: Question | None = None
    current_opt: str | None = None
    expected = 1

    for raw in lines:
        line = _clean(raw)
        if not line or FOOTER_CODE.match(line) or HEADER.search(line):
            continue

        qm = Q_START.match(line)
        if qm and int(qm.group(1)) == expected:
            current = Question(number=expected, stem=qm.group(2).strip())
            current_opt = None
            questions.append(current)
            expected += 1
            continue

        if current is None:
            continue

        om = OPT_START.match(line)
        if om:
            letter = om.group(1).upper()
            current.options[letter] = om.group(2).strip()
            current_opt = letter
            continue

        if current_opt is not None:
            current.options[current_opt] = (
                current.options[current_opt] + " " + line).strip()
        else:
            current.stem = (current.stem + " " + line).strip()

    return questions


def parse_part(lines: list[str]) -> dict[str, list[Question]]:
    """Divide en bloque principal y de reserva, y parsea cada uno desde 1."""
    split = next((i for i, ln in enumerate(lines) if RESERVE_MARK.search(ln)), None)
    if split is None:
        return {"main": _parse_sequential(lines), "reserve": []}
    return {
        "main": _parse_sequential(lines[:split]),
        "reserve": _parse_sequential(lines[split + 1:]),
    }


if __name__ == "__main__":
    import glob
    from ingest.ocr import ocr_lines
    from ingest.render import render_pdf

    INSTRUCTIONS = re.compile(r"INSTRUCI[OÓ]NS", re.IGNORECASE)
    for part in ("parte-comun", "parte-especifica"):
        pdf = glob.glob(f"examenes/*/{part}/*.pdf")[0]
        lines: list[str] = []
        for pg in render_pdf(pdf):
            page_lines = ocr_lines(pg.image)
            if any(INSTRUCTIONS.search(ln) for ln in page_lines):
                continue  # saltar portada/instrucciones
            lines.extend(page_lines)
        parsed = parse_part(lines)
        m, r = parsed["main"], parsed["reserve"]
        bad_m = [q.number for q in m if not q.is_complete()]
        bad_r = [q.number for q in r if not q.is_complete()]
        print(f"\n{part}: principal={len(m)} (ultima={m[-1].number if m else '-'}, "
              f"incompletas={bad_m}) | reserva={len(r)} (incompletas={bad_r})")
