"""Envoltura de OCR sobre RapidOCR (modelos PP-OCRv5 via ONNXRuntime).

Motivos de la eleccion:
- PaddlePaddle 3.x tiene un bug de oneDNN/PIR que obliga a desactivar mkldnn, y
  sin mkldnn la inferencia es lentisima (~50 s/pagina).
- RapidOCR ejecuta los mismos modelos PP-OCR via ONNXRuntime: rapido en CPU
  (~3 s/pagina) y sin ese bug.
- El modelo de reconocimiento **latino** de PP-OCRv5 conserva espacios y acentos
  (gallego/castellano), a diferencia del modelo por defecto (chino/ingles).

Expone `ocr_lines(image)` -> lineas en orden de lectura, y `ocr_boxes(image)`
con la geometria para la planilla de respuestas.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image

_OCR = None


def _engine():
    global _OCR
    if _OCR is None:
        from rapidocr import LangRec, ModelType, OCRVersion, RapidOCR

        _OCR = RapidOCR(params={
            "Rec.lang_type": LangRec.LATIN,        # espacios + acentos
            "Rec.ocr_version": OCRVersion.PPOCRV5,
            "Rec.model_type": ModelType.MOBILE,
            "Global.use_cls": False,               # escaneos ya rectos
        })
    return _OCR


@dataclass
class Box:
    text: str
    cx: float
    cy: float
    x0: float
    y0: float
    x1: float
    y1: float


def _to_box(text: str, poly) -> Box:
    xs = [float(p[0]) for p in poly]
    ys = [float(p[1]) for p in poly]
    return Box(text=text, cx=sum(xs) / len(xs), cy=sum(ys) / len(ys),
               x0=min(xs), y0=min(ys), x1=max(xs), y1=max(ys))


def ocr_boxes(image: Image.Image) -> list[Box]:
    """Cajas de texto detectadas, con geometria (px)."""
    res = _engine()(np.asarray(image.convert("RGB")))
    if not res or not res.txts:
        return []
    return [_to_box(t, poly) for t, poly in zip(res.txts, res.boxes)]


def ocr_lines(image: Image.Image) -> list[str]:
    """Lineas de texto en orden de lectura (arriba->abajo, izq->der).

    RapidOCR ya devuelve las cajas en orden de lectura para texto en columna
    unica; reordenamos por seguridad agrupando en filas por su coordenada y.
    """
    boxes = ocr_boxes(image)
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
        lines.append(" ".join(b.text for b in row))
    return lines
