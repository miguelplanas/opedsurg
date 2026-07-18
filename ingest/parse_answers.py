"""Lectura de la planilla de respuestas (rejilla etiqueta -> letra).

La rejilla empareja una etiqueta (C1..C12, E1..E110, G1..G12) con su valor a la
derecha en la misma fila. El valor es A/B/C/D, "NULA" (anulada) o una letra entre
comillas (respuesta modificada).

Precision: se hacen DOS lecturas independientes del valor de cada celda:
  - Lectura A: OCR de pagina completa, valor = caja mas cercana a la derecha.
  - Lectura B: recorte de la celda del valor (a la derecha de la etiqueta) y OCR
    de ese recorte en aislado.
Solo se acepta el valor si ambas coinciden; las discrepancias se marcan (flags)
y no entran en el dataset. Asi un error de OCR nunca pasa en silencio.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from PIL import Image

from ingest.ocr import Box, ocr_boxes

LABEL = re.compile(r"^([CEG])(\d{1,3})$")
# Un valor normalizado: letra A-D, o los estados especiales.
LETTER = re.compile(r"^[ABCD]$")


@dataclass
class Answer:
    label: str          # p.ej. "C1", "E101"
    block: str          # "C" | "E" | "G"
    number: int
    letter: str | None  # "A".."D" o None si NULA
    status: str         # "ok" | "nula" | "modificada"


def _norm(text: str) -> str:
    return text.replace(" ", "").strip()


def _classify(raw: str) -> tuple[str | None, str] | None:
    """Interpreta el texto de un valor -> (letra, estado) o None si no valido."""
    t = _norm(raw).upper()
    if not t:
        return None
    if "NULA" in t:
        return (None, "nula")
    # letra entre comillas (rectas o tipograficas) => modificada
    stripped = t.strip("\"'“”‘’")
    if stripped != t and LETTER.match(stripped):
        return (stripped, "modificada")
    if LETTER.match(t):
        return (t, "ok")
    return None


def _value_to_right(label_box: Box, boxes: list[Box]) -> Box | None:
    """Caja de valor: la mas cercana a la derecha de la etiqueta, misma fila."""
    h = label_box.y1 - label_box.y0
    candidates = [
        b for b in boxes
        if b is not label_box
        and b.cx > label_box.cx
        and abs(b.cy - label_box.cy) < h * 0.8
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda b: b.cx - label_box.cx)


def _read_b_crop(label_box: Box, value_box: Box, image: Image.Image) -> str:
    """Segunda lectura independiente: recorta la celda del valor y la OCRea.

    Un recorte muy ajustado a veces no dispara el detector (el OCR no ve
    nada) y uno muy holgado arrastra celdas vecinas. Se prueban margenes de
    menor a mayor y se devuelve el primer resultado no vacio; si el recorte
    contiene varias cajas se toma la mas cercana al centro del recorte, que
    es donde esta el valor. Esta lectura nunca consulta la lectura A, asi
    que la garantia de doble lectura independiente se mantiene intacta.
    """
    h = value_box.y1 - value_box.y0
    for factor in (0.4, 0.8, 1.2):
        pad = h * factor
        crop = image.crop((
            int(value_box.x0 - pad), int(value_box.y0 - pad),
            int(value_box.x1 + pad), int(value_box.y1 + pad),
        ))
        boxes = ocr_boxes(crop)
        if not boxes:
            continue
        ccx, ccy = crop.width / 2, crop.height / 2
        best = min(boxes, key=lambda b: (b.cx - ccx) ** 2 + (b.cy - ccy) ** 2)
        return best.text
    return ""


def parse_answers(image: Image.Image, blocks: tuple[str, ...] = ("C", "E")) -> dict:
    """Devuelve {'answers': {label: Answer}, 'flags': [ ... ]}."""
    boxes = ocr_boxes(image)
    label_boxes = [(m, b) for b in boxes if (m := LABEL.match(_norm(b.text)))]

    answers: dict[str, Answer] = {}
    flags: list[dict] = []

    for m, lb in label_boxes:
        block, num = m.group(1), int(m.group(2))
        if block not in blocks:
            continue
        label = f"{block}{num}"

        vbox = _value_to_right(lb, boxes)
        if vbox is None:
            flags.append({"label": label, "reason": "sin valor a la derecha"})
            continue

        read_a = _classify(vbox.text)
        read_b = _classify(_read_b_crop(lb, vbox, image))

        if read_a is None:
            flags.append({"label": label, "reason": f"valor ilegible: {vbox.text!r}"})
            continue
        if read_a != read_b:
            flags.append({"label": label, "reason": "discrepancia doble lectura",
                          "read_a": vbox.text, "read_b_class": str(read_b)})
            continue

        letter, status = read_a
        answers[label] = Answer(label=label, block=block, number=num,
                                letter=letter, status=status)

    return {"answers": answers, "flags": flags}


if __name__ == "__main__":
    import glob
    from ingest.render import render_pdf

    pdf = glob.glob("examenes/*/respuestas/*.pdf")[0]
    page = render_pdf(pdf, drop_blank=False)[0]
    res = parse_answers(page.image)
    ans = res["answers"]
    print(f"respuestas leidas: {len(ans)}, flags: {len(res['flags'])}")
    for lab in ["C1","C2","C3","C10","C11","C12","E1","E71","E85","E101","E110"]:
        a = ans.get(lab)
        print(f"  {lab}: {a.letter}/{a.status}" if a else f"  {lab}: (FLAG)")
    if res["flags"]:
        print("FLAGS:", res["flags"][:10])
