// Worker de Cloudflare delante de la app estática (public/). La app es pública
// en opedsurg.miguelplanas.dev, así que todo pide usuario y contraseña salvo
// lo que necesita la propia pantalla de entrar.
//
// Por qué una pantalla propia y no la ventana de usuario y contraseña del
// navegador (Basic Auth): en el iPhone, una web añadida a la pantalla de
// inicio no la recuerda y a menudo ni la enseña. Aquí se entra una vez y una
// cookie firmada dura 400 días (el máximo que aceptan los navegadores).
//
// Secretos del Worker (wrangler secret put): APP_USER y APP_PASSWORD. Sin
// ellos no deja entrar a nadie. La cookie se firma con la contraseña: cambiarla
// cierra la sesión en todos los móviles.

const COOKIE = 'opo_auth';
const MAX_AGE = 400 * 24 * 3600;
const PUBLIC = [
  /^\/css\//, /^\/fonts\//, /^\/js\/theme\.js$/,
  /^\/favicon\.svg$/, /^\/apple-touch-icon\.png$/, /^\/pwa-\d+\.png$/, /^\/manifest\.webmanifest$/,
];

const enc = new TextEncoder();

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const secret = (env) => `${env.APP_USER}\n${env.APP_PASSWORD}`;
const configured = (env) => Boolean(env.APP_USER && env.APP_PASSWORD);

// Comparación en tiempo constante: se comparan los HMAC, no los textos.
async function same(env, a, b) {
  const [x, y] = await Promise.all([hmac(secret(env), `cmp:${a}`), hmac(secret(env), `cmp:${b}`)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export async function makeToken(env, now = Date.now()) {
  const exp = Math.floor(now / 1000) + MAX_AGE;
  return `${exp}.${await hmac(secret(env), `auth:${exp}`)}`;
}

export async function validToken(env, token, now = Date.now()) {
  if (!configured(env) || !token) return false;
  const [exp, sig] = token.split('.');
  if (!/^\d+$/.test(exp) || !sig || Number(exp) * 1000 < now) return false;
  return same(env, sig, await hmac(secret(env), `auth:${exp}`));
}

function cookie(request, name) {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function loginPage({ error = '', user = '' } = {}) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#f7f7f5" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#10100f" media="(prefers-color-scheme: dark)">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Opo Tests">
  <title>Entrar en Opo Tests</title>
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/app.css">
  <script src="/js/theme.js"></script>
</head>
<body>
  <main class="page login">
    <header>
      <span class="brand">Opo Tests</span>
      <button class="btn quiet theme-toggle" type="button" data-theme-toggle aria-label="Cambiar tema claro u oscuro"></button>
    </header>
    <h1 class="visually-hidden">Entrar</h1>
    <form method="post" action="/login">
      <label for="user">Usuario</label>
      <input class="field" id="user" name="user" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="${escape(user)}">
      <label for="password">Contraseña</label>
      <input class="field" id="password" name="password" type="password" autocomplete="current-password" required>
      <p class="status${error ? ' error' : ''}" role="status">${escape(error)}</p>
      <button class="btn primary">Entrar</button>
    </form>
  </main>
</body>
</html>`;
}

function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

// Cabeceras para todo: que no la indexen ni la metan en un iframe.
function harden(res) {
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'same-origin');
  return out;
}

async function handle(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/login') {
    if (request.method === 'POST') {
      if (!configured(env)) return html(loginPage({ error: 'La app aún no tiene contraseña configurada.' }), 503);
      // 10 intentos por minuto y por IP (wrangler.jsonc, LOGIN_LIMIT): la
      // espera de abajo no frena a quien pruebe contraseñas en paralelo.
      const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
      if (env.LOGIN_LIMIT && !(await env.LOGIN_LIMIT.limit({ key: ip })).success) {
        return html(loginPage({ error: 'Demasiados intentos. Espera un minuto.' }), 429);
      }
      const form = await request.formData().catch(() => null);
      const user = String(form?.get('user') ?? '').trim();
      const password = String(form?.get('password') ?? '');
      const ok = (await same(env, user, env.APP_USER)) & (await same(env, password, env.APP_PASSWORD));
      if (!ok) {
        await new Promise((r) => setTimeout(r, 800)); // frena a quien pruebe contraseñas a ciegas
        return html(loginPage({ error: 'Usuario o contraseña incorrectos.', user }), 401);
      }
      return new Response(null, {
        status: 303,
        headers: {
          Location: '/',
          // Secure solo en https: Safari no guarda cookies Secure en http://localhost.
          'Set-Cookie': `${COOKIE}=${await makeToken(env)}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`,
        },
      });
    }
    if (await validToken(env, cookie(request, COOKIE))) return Response.redirect(new URL('/', url), 303);
    return html(loginPage());
  }

  if (PUBLIC.some((re) => re.test(url.pathname))) return env.ASSETS.fetch(request);

  if (await validToken(env, cookie(request, COOKIE))) return env.ASSETS.fetch(request);

  const wantsPage = request.method === 'GET' && (request.headers.get('Accept') ?? '').includes('text/html');
  if (wantsPage) return Response.redirect(new URL('/login', url), 302);
  return new Response('Hay que entrar con usuario y contraseña.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    return harden(await handle(request, env));
  },
};
