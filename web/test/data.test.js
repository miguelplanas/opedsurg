// El dataset que se publica: coincide con data/ y cada pregunta es contestable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = new URL('../public/data/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir)));

test('public/data coincide con data/ (la fuente que genera ingest)', () => {
  execFileSync(process.execPath, [new URL('../scripts/check-data-sync.mjs', import.meta.url).pathname], { stdio: 'pipe' });
});

test('cada convocatoria del manifest existe y cuadra con sus preguntas', () => {
  const files = readdirSync(new URL('exams/', dir)).filter((f) => f.endsWith('.json'));
  assert.equal(files.length, manifest.exams.length);
  for (const entry of manifest.exams) {
    const exam = JSON.parse(readFileSync(new URL(`exams/${entry.id}.json`, dir)));
    assert.equal(exam.id, entry.id);
    assert.doesNotMatch(exam.title, /·/, 'sin · en los títulos (docs/estilo.md)');
    const ids = new Set();
    for (const q of exam.questions) {
      assert.ok(!ids.has(q.id), `${entry.id}: ${q.id} repetida`);
      ids.add(q.id);
      assert.deepEqual(Object.keys(q.options).sort(), ['A', 'B', 'C', 'D'], `${entry.id}:${q.id}`);
      if (q.status === 'nula') assert.equal(q.answer, null);
      else assert.ok(q.options[q.answer] !== undefined, `${entry.id}:${q.id} sin respuesta válida`);
    }
  }
});

test('el service worker precachea todo lo que carga la app', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const walk = (d) => readdirSync(new URL(d, new URL('../public/', import.meta.url)), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${d}${e.name}/`) : [`/${d}${e.name}`]));
  for (const f of walk('js/')) assert.ok(sw.includes(`'${f}'`), `falta ${f} en SHELL de sw.js`);
});
