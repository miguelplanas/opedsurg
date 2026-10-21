# Opo Tests

Tests de la oposición de Cirugía Pediátrica a partir de los PDF escaneados de
examen y sus planillas de respuestas. Es una app web instalable en el móvil que
funciona sin conexión, en https://opedsurg.miguelplanas.dev, con usuario y
contraseña.

Dos piezas independientes:

- **`ingest/`**: pipeline en Python que convierte los PDF escaneados en un
  dataset JSON validado. Local, gratis y preciso (doble lectura y validación).
- **`web/`**: la app (HTML, CSS y JS sin build) y el Worker de Cloudflare que la
  sirve y pide la contraseña.

## Añadir un examen nuevo

1. Coloca los 3 PDF en la estructura:

   ```
   examenes/<id-del-examen>/parte-comun/*.pdf
   examenes/<id-del-examen>/parte-especifica/*.pdf
   examenes/<id-del-examen>/respuestas/*.pdf
   ```

   El título que se ve en la app va en `examenes/<id>/overrides.json`
   (`"title": "SERGAS Galicia 2022"`): solo el organismo y el año, sin
   "FEA Cirugía Pediátrica", que ya dice la app.

2. Ejecuta el pipeline (crea el entorno la primera vez):

   ```bash
   uv venv ingest/.venv --python 3.12
   uv pip install --python ingest/.venv/bin/python -r ingest/requirements.txt
   ingest/.venv/bin/python -m ingest.pipeline <id-del-examen>
   ```

   - Si todo valida: escribe `data/exams/<id>.json`, actualiza el manifest y lo
     copia a `web/public/data/`. Salida `[OK]`.
   - Si hay cualquier duda (conteos que no cuadran, doble lectura discrepante,
     opción inexistente...): **no escribe nada**, deja las incidencias en
     `data/flags/<id>.json` y salida `[BLOQUEADO]`. Así un error nunca llega a la
     app en silencio.

   `andalucia.py` y `clm.py` escriben en `data/` pero no copian a la web:
   después, `ingest/.venv/bin/python -m ingest.pipeline sync`. Si se olvida, los
   tests fallan (`web/test/data.test.js`) y no se despliega.

### Cómo funciona la precisión

- El mapeo pregunta a respuesta es posicional y determinista (la pregunta N de
  la común es `C_N`, la N de la específica es `E_N`); no depende del OCR.
- La planilla se lee **dos veces de forma independiente** (OCR de página y OCR
  del recorte de cada celda) y solo se acepta cada respuesta si ambas coinciden.
- Se validan invariantes: conteo de preguntas igual al de respuestas, 4 opciones
  por pregunta, la letra correcta existe entre las opciones. Las anuladas (`NULA`)
  se excluyen; las modificadas usan su letra corregida.

## Modos de estudio

La pantalla inicial ofrece cuatro formas de entrar:

- **Repaso**: solo lo que vence hoy según las cajas de Leitner, empezando por lo
  más atrasado. Si no hay nada pendiente, se desactiva y lo explica.
- **Rápido**: 10 preguntas. Primero lo vencido, luego lo flojo, y se rellena con
  preguntas nunca vistas. Siempre aporta algo.
- **Simulacro**: una convocatoria concreta, con parte, forma de corregir
  (práctica, examen o examen real) y temporizador.
- **Aleatorio**: 30 preguntas mezcladas de todas las convocatorias.

Una tanda a medias se guarda en el móvil a cada respuesta: si iOS cierra la app,
el inicio ofrece continuarla.

Las que mezclan convocatorias guardan el progreso con clave
`examenId:preguntaId`, porque los ids `C1`, `E12`... se repiten entre exámenes.

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
pregunta nueva la manda directa a la caja 2.

Las preguntas en blanco no mueven de caja: no hay evidencia de si se sabían.
Todo se guarda en `localStorage` de cada móvil (sin backend); la clave
`opo-tests:progress:v2` es la misma desde la primera versión, así que cambiar la
app no borra el progreso.

## La app en local

```bash
cd web
npm test           # tests (lógica, progreso, Worker y dataset)
npm run dev        # http://localhost:3001, usuario y contraseña "prueba"
```

No hay dependencias que instalar: Node 24 basta.

## Despliegue

Worker de Cloudflare `opedsurg` (`web/wrangler.jsonc`), con el dominio
`opedsurg.miguelplanas.dev`. Al fusionar en `main`, la CI pasa los tests y
despliega con `wrangler deploy`.

- Secretos de GitHub: `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.
- Secretos del Worker: `APP_USER` y `APP_PASSWORD` (`npx wrangler@4 secret put
  APP_PASSWORD` desde `web/`). Cambiar la contraseña cierra la sesión en todos los
  móviles. Sin ellos no entra nadie.

Mientras dure el traspaso, Vercel (`opedsurg.vercel.app`, `web/vercel.json`)
sirve la misma app sin contraseña, para poder copiar desde allí el progreso
guardado (Progreso, Copiar mi progreso) y pegarlo en la nueva. Después se borra
el proyecto de Vercel y `web/vercel.json`.

Para instalarla en el iPhone: Safari, la dirección, Compartir y "Añadir a
pantalla de inicio". La app instalada no comparte cookies con Safari, así que
pide entrar una vez más dentro de la app; después dura 400 días.

## Estructura

```
examenes/            PDF de entrada (por examen)
ingest/              pipeline Python (render, ocr, parse, validate, pipeline)
data/                dataset generado (fuente de verdad)
web/public/          la app; web/public/data es la copia publicada de data/
web/worker/          Worker: contraseña delante de public/
web/test/            tests con node:test
```

## Pendiente

- Explicaciones con IA por respuesta (pre-generadas en castellano). El esquema de
  datos deja el hueco preparado; ver `ingest/pipeline.py` (`explain.py`).
