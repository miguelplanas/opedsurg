"""Render de PDFs escaneados a imagenes, descartando paginas en blanco.

Uso como libreria: render_pdf(path) -> lista de (indice_pagina, PIL.Image) solo
de las paginas con contenido. Las paginas en blanco (versos del escaneo) se
detectan por cobertura de tinta y se descartan.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

DPI = 300
# Fraccion minima de pixeles "oscuros" para considerar que una pagina tiene texto.
# Los versos en blanco del escaneo tienen ruido minimo muy por debajo de esto.
BLANK_INK_THRESHOLD = 0.0025
# Un pixel se considera tinta si su luminosidad esta por debajo de esto (0-255).
INK_LUMA_CUTOFF = 160


@dataclass
class Page:
    index: int  # indice 0-based dentro del PDF original
    image: Image.Image


def _ink_fraction(img: Image.Image) -> float:
    """Fraccion de pixeles oscuros (tinta) sobre el total."""
    gray = np.asarray(img.convert("L"))
    return float((gray < INK_LUMA_CUTOFF).mean())


def render_pdf(path: str | Path, dpi: int = DPI, drop_blank: bool = True) -> list[Page]:
    """Renderiza cada pagina del PDF a imagen. Descarta las paginas en blanco."""
    doc = fitz.open(str(path))
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    pages: list[Page] = []
    for i in range(doc.page_count):
        pix = doc.load_page(i).get_pixmap(matrix=matrix)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        if drop_blank and _ink_fraction(img) < BLANK_INK_THRESHOLD:
            continue
        pages.append(Page(index=i, image=img))
    doc.close()
    return pages


if __name__ == "__main__":
    import sys

    for arg in sys.argv[1:]:
        kept = render_pdf(arg)
        total = fitz.open(arg).page_count
        print(f"{arg}: {len(kept)}/{total} paginas con contenido "
              f"(indices: {[p.index for p in kept]})")
