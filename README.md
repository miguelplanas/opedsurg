# Opo Tests

Tests de oposición tipo test a partir de los PDF escaneados de examen y sus
planillas de respuestas, con una app PWA instalable en el móvil.

Dos piezas independientes:

- **`ingest/`** — pipeline en Python que convierte los PDF escaneados en un
  dataset JSON validado. Local, gratis y preciso (doble lectura + validación).
- **`web/`** — app PWA (Vite + React) que consume ese dataset. Instalable en
  iPhone/Android, funciona offline. Desplegable en Vercel.

## Añadir un examen nuevo

1. Coloca los 3 PDF en la estructura:

   ```
   examenes/<id-del-examen>/parte-comun/*.pdf
   examenes/<id-del-examen>/parte-especifica/*.pdf
   examenes/<id-del-examen>/respuestas/*.pdf
   ```

2. Ejecuta el pipeline (crea el entorno la primera vez):

   ```bash
   uv venv ingest/.venv --python 3.12
   uv pip install --python ingest/.venv/bin/python -r ingest/requirements.txt
   ingest/.venv/bin/python -m ingest.pipeline <id-del-examen>
   ```

   - Si todo valida: escribe `data/exams/<id>.json`, actualiza el manifest y lo
     copia a `web/public/data/`. Salida `[OK]`.
   - Si hay cualquier duda (conteos que no cuadran, doble lectura discrepante,
     opción inexistente…): **no escribe nada**, deja las incidencias en
     `data/flags/<id>.json` y salida `[BLOQUEADO]`. Así un error nunca llega a la
     app en silencio.

### Cómo funciona la precisión

- El mapeo pregunta→respuesta es posicional y determinista (la pregunta N de la
  común es `C_N`, la N de la específica es `E_N`); no depende del OCR.
- La planilla se lee **dos veces de forma independiente** (OCR de página + OCR
  del recorte de cada celda) y solo se acepta cada respuesta si ambas coinciden.
- Se validan invariantes: conteo de preguntas == conteo de respuestas, 4 opciones
  por pregunta, la letra correcta existe entre las opciones. Las anuladas (`NULA`)
  se excluyen; las modificadas usan su letra corregida.

## Correr la app en local

```bash
cd web
npm install
npm run dev        # desarrollo
npm run build      # producción (genera dist/ con service worker PWA)
npm run preview    # sirve el build
```

## Desplegar en Vercel

La app es estática. En Vercel, con el directorio raíz apuntando a `web/`:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

Una vez desplegada, tu hermana abre el enlace en Safari y elige "Añadir a
pantalla de inicio": queda como una app, a pantalla completa y offline.

## Estructura

```
examenes/            PDFs de entrada (por examen)
ingest/              pipeline Python (render, ocr, parse, validate, pipeline)
data/                dataset generado (fuente de verdad)
web/                 app PWA (Vite + React); consume web/public/data
```

## Pendiente / futuro

- Explicaciones con IA por respuesta (pre-generadas en castellano). El esquema de
  datos deja el hueco preparado; ver `ingest/pipeline.py` (`explain.py`).
