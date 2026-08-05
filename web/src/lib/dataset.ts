import type { Exam, Manifest } from "../types";

// Carga del dataset estatico servido desde /data. El service worker lo cachea
// para funcionamiento offline.
const BASE = import.meta.env.BASE_URL;

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch(`${BASE}data/manifest.json`);
  if (!res.ok) throw new Error("No se pudo cargar el listado de exámenes.");
  return res.json();
}

export async function loadExam(id: string): Promise<Exam> {
  const res = await fetch(`${BASE}data/exams/${id}.json`);
  if (!res.ok) throw new Error("No se pudo cargar el examen.");
  return res.json();
}

// Todos los examenes a la vez: lo necesitan los modos que mezclan preguntas de
// varios (repaso, aleatorio, rapido). Son pocos MB y el service worker ya los
// tiene precacheados, asi que en la practica es instantaneo y funciona offline.
export async function loadAllExams(): Promise<Exam[]> {
  const manifest = await loadManifest();
  return Promise.all(manifest.exams.map((e) => loadExam(e.id)));
}
