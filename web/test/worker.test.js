import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { makeToken, validToken } from '../worker/index.js';

const ASSETS = { fetch: async (req) => new Response(`asset ${new URL(req.url).pathname}`) };
const env = { ASSETS, APP_USER: 'hermana', APP_PASSWORD: 'una-clave-larga' };
const req = (path, init = {}) => new Request(`https://opedsurg.miguelplanas.dev${path}`, init);
const login = (user, password) => worker.fetch(req('/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ user, password }),
}), env);

test('sin cookie, una página lleva a entrar y lo demás da 401', async () => {
  const page = await worker.fetch(req('/', { headers: { Accept: 'text/html' } }), env);
  assert.equal(page.status, 302);
  assert.equal(new URL(page.headers.get('Location')).pathname, '/login');
  assert.equal((await worker.fetch(req('/data/manifest.json'), env)).status, 401);
  assert.equal((await worker.fetch(req('/js/app.js'), env)).status, 401);
});

test('la pantalla de entrar y sus estilos se ven sin cookie', async () => {
  const page = await worker.fetch(req('/login'), env);
  assert.equal(page.status, 200);
  const body = await page.text();
  assert.match(body, /autocomplete="current-password"/);
  assert.doesNotMatch(body, /Solo hace falta/, 'sin texto de explicación: solo el formulario');
  assert.equal((await worker.fetch(req('/css/base.css'), env)).status, 200);
  assert.equal(page.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});

test('con la contraseña buena da una cookie que abre todo', async () => {
  const res = await login('hermana', 'una-clave-larga');
  assert.equal(res.status, 303);
  const set = res.headers.get('Set-Cookie');
  assert.match(set, /HttpOnly/);
  assert.match(set, /Secure/);
  assert.match(set, /Max-Age=34560000/);
  const cookie = set.split(';')[0];
  const data = await worker.fetch(req('/data/manifest.json', { headers: { Cookie: cookie } }), env);
  assert.equal(data.status, 200);
  assert.equal(await data.text(), 'asset /data/manifest.json');
});

test('con la contraseña mala no entra', async () => {
  const res = await login('hermana', 'otra');
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('Set-Cookie'), null);
  assert.match(await res.text(), /incorrectos/);
  assert.equal((await login('otro', 'una-clave-larga')).status, 401);
});

test('la cookie caduca, no se falsifica y muere al cambiar la contraseña', async () => {
  const now = Date.now();
  const token = await makeToken(env, now);
  assert.ok(await validToken(env, token, now));
  assert.ok(!(await validToken(env, token, now + 401 * 24 * 3600e3)));
  const [exp] = token.split('.');
  assert.ok(!(await validToken(env, `${Number(exp) + 999999}.${token.split('.')[1]}`, now)));
  assert.ok(!(await validToken({ ...env, APP_PASSWORD: 'nueva' }, token, now)));
});

test('sin secretos configurados no deja entrar a nadie', async () => {
  const bare = { ASSETS };
  assert.equal((await worker.fetch(req('/data/manifest.json'), bare)).status, 401);
  const res = await worker.fetch(req('/login', {
    method: 'POST', body: new URLSearchParams({ user: '', password: '' }),
  }), bare);
  assert.equal(res.status, 503);
  assert.ok(!(await validToken(bare, 'x.y')));
});

test('demasiados intentos de contraseña por IP dan 429', async () => {
  let calls = 0;
  const limited = { ...env, LOGIN_LIMIT: { limit: async () => ({ success: ++calls <= 2 }) } };
  const post = () => worker.fetch(req('/login', {
    method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.9' },
    body: new URLSearchParams({ user: 'hermana', password: 'una-clave-larga' }),
  }), limited);
  assert.equal((await post()).status, 303);
  assert.equal((await post()).status, 303);
  assert.equal((await post()).status, 429);
});
