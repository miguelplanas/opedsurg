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
