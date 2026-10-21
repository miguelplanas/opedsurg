// El dataset estático de /data. El service worker lo guarda para usarlo sin conexión.

let manifest = null;
const exams = new Map();

// 401: la sesión caducó o cambió la contraseña. A la pantalla de entrar.
async function get(path, message) {
  const res = await fetch(path);
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Hay que volver a entrar.');
  }
  if (!res.ok) throw new Error(message);
  return res.json();
}

export async function loadManifest() {
  if (manifest) return manifest;
  manifest = await get('/data/manifest.json', 'No se pudo cargar la lista de convocatorias.');
  return manifest;
}

export async function loadExam(id) {
  if (exams.has(id)) return exams.get(id);
  const exam = await get(`/data/exams/${encodeURIComponent(id)}.json`, 'No se pudo cargar la convocatoria.');
  exams.set(id, exam);
  return exam;
}

// Las convocatorias de las preguntas de una tanda, por id.
export async function examsFor(items) {
  const ids = [...new Set(items.map((i) => i.examId))];
  return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await loadExam(id)])));
}

// Los modos que mezclan convocatorias las necesitan todas. Son unos cientos de KB.
export async function loadAllExams() {
  const m = await loadManifest();
  return Promise.all(m.exams.map((e) => loadExam(e.id)));
}
