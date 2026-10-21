// El dataset estático de /data. El service worker lo guarda para usarlo sin conexión.

let manifest = null;
const exams = new Map();

export async function loadManifest() {
  if (manifest) return manifest;
  const res = await fetch('/data/manifest.json');
  if (!res.ok) throw new Error('No se pudo cargar la lista de convocatorias.');
  manifest = await res.json();
  return manifest;
}

export async function loadExam(id) {
  if (exams.has(id)) return exams.get(id);
  const res = await fetch(`/data/exams/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error('No se pudo cargar la convocatoria.');
  const exam = await res.json();
  exams.set(id, exam);
  return exam;
}

// Los modos que mezclan convocatorias las necesitan todas. Son unos cientos de KB.
export async function loadAllExams() {
  const m = await loadManifest();
  return Promise.all(m.exams.map((e) => loadExam(e.id)));
}
