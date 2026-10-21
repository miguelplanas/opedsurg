# Opo Tests

Tests de la oposición de Cirugía Pediátrica para la hermana de Miguel, en https://opedsurg.miguelplanas.dev (pública, con usuario y contraseña). Cómo se añade un examen y cómo funciona el repaso: `README.md`.

## Flujo de trabajo (obligatorio)

1. **Nunca commits en `main`.** Rama `feat/*` o `fix/*`. `main` está protegida por un ruleset.
2. Todo cambio de comportamiento lleva su test. **Los tests son la única red**: con merge automático no hay nadie mirando antes de producción.
3. `cd web && npm test` en verde **antes** de hacer commit.
4. `git add <fichero>` explícito, **nunca `git commit -am`**. Encadena comandos con `&&`.
5. `gh pr create --fill` y, si el cambio no es una excepción, `gh pr merge --auto --squash`.

Siguen esperando a Miguel (el check `guard` deja `ok-miguel` pendiente hasta que él pone la etiqueta; **un agente nunca la pone ni la quita**): cambios en los datos de los exámenes (`data/`, `web/public/data/`), en la contraseña (`web/worker/`), en la CI (`.github/`), y borrar funcionalidad.

## Despliegue

`main` → CI (`.github/workflows/ci.yml`) → tests → `wrangler deploy` del Worker `opedsurg` en Cloudflare. Fusionar es desplegar.

- Secretos de GitHub: `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.
- Secretos del Worker: `APP_USER` y `APP_PASSWORD`. Sin ellos no entra nadie. La contraseña está también en `secrets.env` del homelab como `OPEDSURG_PASSWORD` (se usa, no se lee).
- Es pública: `*.miguelplanas.dev` es privado salvo excepción, y este nombre la tiene en AdGuard (`@@||opedsurg.miguelplanas.dev^$dnsrewrite`). La vigila Gatus (endpoint `opedsurg`).

## Arquitectura

Excepción al stack de las apps (Hono y `node:sqlite` en Dokploy): no hay servidor propio porque tiene que verse sin VPN y el progreso vive en cada móvil.

- `web/public/` es la app: HTML, CSS y módulos ES sin build ni framework. Rutas por hash (`js/app.js`).
- `web/public/js/quiz.js` (qué preguntas entran y cómo se puntúa) y `progress.js` (Leitner, `localStorage`) no tocan el DOM: se prueban con `node:test`.
- **La clave `opo-tests:progress:v2` y su formato no se cambian**: es el progreso guardado en el móvil de quien la usa. Si hace falta otro formato, migración con test.
- `web/public/sw.js` guarda la app y todas las convocatorias para usarla sin conexión. Un fichero JS nuevo se añade a su `SHELL` (un test lo comprueba).
- `web/worker/index.js` va delante de todo (`run_worker_first`): pantalla de entrar propia y cookie firmada de 400 días. No uses Basic Auth: el iPhone no lo recuerda en una app añadida a la pantalla de inicio.
- `web/public/data/` es copia de `data/`, que genera `ingest/` (Python, siempre en su entorno `uv`).
- Sin dependencias de npm.

## Interfaz

Mismo estilo que las apps del homelab: lee `web/DESIGN.md` y `web/PRODUCT.md` antes de tocar `web/public/`.

- `web/public/css/base.css`, `web/public/js/theme.js` y `web/public/fonts/` vienen de `miguelplanas/plantilla-app` y **no se editan aquí**. Lo propio va en `web/public/css/app.css`.
- Antes de dar un cambio visual por terminado, míralo: skill `estilo-apps` (`npm run dev`, usuario y contraseña `prueba`; 390 px y escritorio, claro y oscuro, y detector).

## Preferencias de Miguel

- Revisa los PR desde el iPhone: títulos descriptivos, un PR hace una sola cosa, diffs pequeños.
- Explica qué haces y para qué sirve cada pieza.
