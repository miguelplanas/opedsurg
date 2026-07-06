// Persistencia local (sin backend ni login). Guarda el mejor resultado por
// examen/ambito y las preguntas falladas para repaso.
import type { Scope } from "../types";

const KEY = "opo-tests:progress:v1";

export interface ExamProgress {
  bestAccuracy: number; // 0..1
  bestPoints: number;
  attempts: number;
  answeredTotal: number;
  wrongIds: string[]; // ids fallados (para repaso), sin duplicados
  lastPlayed: string; // ISO
}

type Store = Record<string, ExamProgress>; // clave: `${examId}:${scope}`

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function write(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

function keyFor(examId: string, scope: Scope): string {
  return `${examId}:${scope}`;
}

export function getProgress(examId: string, scope: Scope): ExamProgress | null {
  return read()[keyFor(examId, scope)] ?? null;
}

export function getExamProgress(examId: string): ExamProgress | null {
  const store = read();
  const entries = Object.entries(store).filter(([k]) => k.startsWith(`${examId}:`));
  if (!entries.length) return null;
  // Resumen: mejor precision entre ambitos.
  return entries.reduce<ExamProgress | null>((best, [, p]) => {
    if (!best || p.bestAccuracy > best.bestAccuracy) return p;
    return best;
  }, null);
}

export function recordAttempt(
  examId: string,
  scope: Scope,
  accuracy: number,
  points: number,
  answered: number,
  wrongIds: string[],
): void {
  const store = read();
  const key = keyFor(examId, scope);
  const prev = store[key];
  const mergedWrong = Array.from(new Set([...(prev?.wrongIds ?? []), ...wrongIds]));
  store[key] = {
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
    bestPoints: Math.max(prev?.bestPoints ?? -Infinity, points),
    attempts: (prev?.attempts ?? 0) + 1,
    answeredTotal: (prev?.answeredTotal ?? 0) + answered,
    wrongIds: mergedWrong,
    lastPlayed: new Date().toISOString(),
  };
  write(store);
}
