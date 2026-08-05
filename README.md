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

## Modos de estudio

La pantalla inicial ofrece cuatro formas de entrar:

- **Repaso** — solo lo que vence hoy según las cajas de Leitner, empezando por
  lo más atrasado. Si no hay nada pendiente, el botón se desactiva y lo explica.
- **Rápido** — 10 preguntas: primero lo vencido, luego lo flojo, y se rellena
  con preguntas nunca vistas. Siempre aporta algo.
- **Examen** — simulacro de una convocatoria concreta, con ámbito, modo y
  temporizador (la pantalla de configurar de siempre).
- **Aleatorio** — 30 preguntas mezcladas de todas las convocatorias.

Los tres primeros mezclan preguntas de varios exámenes; por eso el progreso se
guarda con clave `examenId:preguntaId` (los ids `C1`, `E12`… se repiten entre
convocatorias).

### Repetición espaciada (Leitner)

Cinco cajas. Aciertas, sube una caja; fallas, vuelve a la 1.

| Caja | Nombre | Vuelve a salir |
|---|---|---|
| 1 | Reaprender | el mismo día |
| 2 | Frescas | 3 días |
| 3 | Asentadas | 7 días |
| 4 | Sólidas | 16 días |
| 5 | Dominadas | 35 días |

La caja 1 vence el mismo día a propósito: si una pregunta recién fallada
volviese mañana, el repaso saldría vacío justo después de fallarla. Acertar una
pregunta nueva la manda directa a la caja 2, saltándose el reaprendizaje.

Las preguntas dejadas en blanco no mueven de caja: no hay evidencia de si se
sabían. Todo se guarda en `localStorage` (sin backend ni login); el progreso del
modelo anterior se migra solo a la caja 1.

## Correr la app en local

```bash
cd web
npm install
npm run dev        # desarrollo
npm run build      # producción (genera dist/ con service worker PWA)
npm run preview    # sirve el build
npm run check:data # comprueba que web/public/data == data/
```

`npm run build` ejecuta `check:data` antes de compilar: si `web/public/data` no
coincide con `data/` (típico tras `andalucia.py` o `clm.py`, que no sincronizan
solos), el build falla y te recuerda ejecutar `python -m ingest.pipeline sync`.
Así nunca despliegas exámenes viejos sin darte cuenta.

## Desplegar en Vercel

La app es estática y no necesita variables de entorno ni backend. Lo único que
hay que configurar es el **Root Directory**, porque la app no vive en la raíz
del repo:

- **Root Directory: `web`** ← lo único imprescindible
- Framework preset: **Vite** (se detecta solo)
- Build command: `npm run build` (por defecto)
- Output directory: `dist` (por defecto)

Sin el Root Directory, Vercel busca `package.json` en la raíz, no lo encuentra
y falla con "No framework detected".

Cada `git push` a `master` redespliega automáticamente.

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
