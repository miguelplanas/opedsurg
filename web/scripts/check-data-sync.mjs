// Comprueba que web/public/data (lo que se despliega) coincide con data/
// (la fuente de verdad que genera el pipeline).
//
// Las ingestas autocontenidas (andalucia.py, clm.py) escriben data/exams pero
// no tocan la carpeta publica; si se olvida `python -m ingest.pipeline sync`,
// la app desplegada serviria examenes viejos sin avisar. Esto lo detecta.
//
// Lo usa test/data.test.js: un dataset desfasado no pasa la CI.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(WEB, "..", "data");
const PUBLIC = join(WEB, "public", "data");

// Si no existe data/ no hay nada que comparar (checkout parcial, o alguien que
// solo clona la web). No es un error.
if (!existsSync(SOURCE)) {
  process.exit(0);
}

const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const listJson = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];

const problems = [];

// manifest
const manifestSrc = join(SOURCE, "manifest.json");
const manifestPub = join(PUBLIC, "manifest.json");
if (!existsSync(manifestPub)) {
  problems.push("falta web/public/data/manifest.json");
} else if (existsSync(manifestSrc) && hash(manifestSrc) !== hash(manifestPub)) {
  problems.push("manifest.json difiere de data/manifest.json");
}

// examenes
const srcExams = listJson(join(SOURCE, "exams"));
const pubExams = listJson(join(PUBLIC, "exams"));

for (const f of srcExams) {
  if (!pubExams.includes(f)) {
    problems.push(`falta en la web: exams/${f}`);
    continue;
  }
  if (hash(join(SOURCE, "exams", f)) !== hash(join(PUBLIC, "exams", f))) {
    problems.push(`contenido distinto: exams/${f}`);
  }
}
for (const f of pubExams) {
  if (!srcExams.includes(f)) {
    problems.push(`sobra en la web (no esta en data/exams): exams/${f}`);
  }
}

if (problems.length === 0) {
  console.log(`[data] en sync (${srcExams.length} examen(es))`);
  process.exit(0);
}

console.error(`\n[data] ERROR: el dataset desplegado no coincide con data/\n`);
for (const p of problems) console.error(`   - ${p}`);
console.error(`\n   Arreglalo con:  ingest/.venv/bin/python -m ingest.pipeline sync\n`);

process.exit(1);
