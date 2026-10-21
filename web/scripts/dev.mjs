// Servidor local: el mismo Worker de producción (worker/index.js) con los
// ficheros de public/ en lugar de los de Cloudflare. Así se prueba también la
// pantalla de entrar. Usuario y contraseña: APP_USER y APP_PASSWORD, o
// "prueba" y "prueba".
//   PORT=3001 npm run dev
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

const ASSETS = {
  async fetch(request) {
    let path = decodeURIComponent(new URL(request.url).pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(PUBLIC, path));
    if (!file.startsWith(PUBLIC)) return new Response('Not found', { status: 404 });
    try {
      return new Response(await readFile(file), { headers: { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  },
};
const env = { ASSETS, APP_USER: process.env.APP_USER ?? 'prueba', APP_PASSWORD: process.env.APP_PASSWORD ?? 'prueba' };
const port = Number(process.env.PORT ?? 3001);

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`http://localhost:${port} (usuario ${env.APP_USER})`));
