// Progreso por pregunta con cajas de Leitner. Sustituye al modelo v1, que solo
// acumulaba una lista de ids fallados y nunca los sacaba: una pregunta ya
// dominada volvia a salir en el repaso para siempre.
//
// Leitner: aciertas -> sube de caja y tarda mas en volver; fallas -> vuelve a la
// caja 1 y reaparece manana. Sin backend: todo en localStorage.
import type { Scope } from "../types";

const KEY = "opo-tests:progress:v2";
const OLD_KEY = "opo-tests:progress:v1";

// Dias hasta el siguiente repaso segun la caja (indice = caja).
// La caja 1 vence el mismo dia a proposito: es la de reaprendizaje. Si una
// pregunta recien fallada venciese manana, el repaso saldria vacio justo
// despues de fallarla, que es cuando mas falta hace repetirla.
export const BOX_INTERVALS = [0, 0, 3, 7, 16, 35];
export const MAX_BOX = 5;

export interface QuestionState {
  box: number; // 1..5
  due: string; // ISO: cuando toca repasarla
  seen: number;
  correct: number;
  wrong: number;
  lastSeen: string; // ISO
  lastOk: boolean;
}

export interface SessionRecord {
  at: string; // ISO
  source: string; // "examen" | "repaso" | "aleatorio" | "rapido"
  examId: string | null;
  answered: number;
  correct: number;
  points: number;
  elapsed: number; // segundos
}

interface Store {
  questions: Record<string, QuestionState>; // clave: `${examId}:${questionId}`
  sessions: SessionRecord[];
  best: Record<string, { accuracy: number; points: number; attempts: number }>; // `${examId}:${scope}`
}

function blank(): Store {
  return { questions: {}, sessions: [], best: {} };
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      return { questions: s.questions ?? {}, sessions: s.sessions ?? [], best: s.best ?? {} };
    }
    return migrateV1();
  } catch {
    return blank();
  }
}

function write(store: Store): void {
  try {
    // Historial acotado: no crece sin limite en localStorage.
    if (store.sessions.length > 200) store.sessions = store.sessions.slice(-200);
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // cuota llena o modo privado: el progreso no persiste, la app sigue
  }
}

// Los fallos guardados con el modelo viejo entran en la caja 1, vencidos hoy.
function migrateV1(): Store {
  const store = blank();
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return store;
    const old = JSON.parse(raw) as Record<
      string,
      { wrongIds?: string[]; bestAccuracy?: number; bestPoints?: number; attempts?: number }
    >;
    const now = new Date().toISOString();
    for (const [key, prog] of Object.entries(old)) {
      const examId = key.split(":")[0];
      store.best[key] = {
        accuracy: prog.bestAccuracy ?? 0,
        points: prog.bestPoints ?? 0,
        attempts: prog.attempts ?? 0,
      };
      for (const qid of prog.wrongIds ?? []) {
        store.questions[`${examId}:${qid}`] = {
          box: 1, due: now, seen: 1, correct: 0, wrong: 1, lastSeen: now, lastOk: false,
        };
      }
    }
    write(store);
  } catch {
    // migracion imposible: se empieza limpio
  }
  return store;
}

export function qKey(examId: string, questionId: string): string {
  return `${examId}:${questionId}`;
}

export function allStates(): Record<string, QuestionState> {
  return read().questions;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(4, 0, 0, 0); // vence de madrugada: "manana" es el dia siguiente entero
  return d.toISOString();
}

// Aplica el resultado de una pregunta y recoloca su caja.
export function recordAnswers(
  examId: string,
  results: { questionId: string; ok: boolean }[],
): void {
  const store = read();
  const now = new Date().toISOString();
  for (const { questionId, ok } of results) {
    const k = qKey(examId, questionId);
    const prev = store.questions[k];
    // Acertar una pregunta nueva la manda directa a la caja 2: la 1 es la de
    // reaprendizaje (vence hoy) y no tiene sentido para algo que ya sabes.
    const box = ok ? Math.min(MAX_BOX, Math.max(2, (prev?.box ?? 0) + 1)) : 1;
    store.questions[k] = {
      box,
      due: addDays(BOX_INTERVALS[box]),
      seen: (prev?.seen ?? 0) + 1,
      correct: (prev?.correct ?? 0) + (ok ? 1 : 0),
      wrong: (prev?.wrong ?? 0) + (ok ? 0 : 1),
      lastSeen: now,
      lastOk: ok,
    };
  }
  write(store);
}

export function recordSession(rec: SessionRecord): void {
  const store = read();
  store.sessions.push(rec);
  write(store);
}

export function recordBest(
  examId: string, scope: Scope, accuracy: number, points: number,
): void {
  const store = read();
  const k = `${examId}:${scope}`;
  const prev = store.best[k];
  store.best[k] = {
    accuracy: Math.max(prev?.accuracy ?? 0, accuracy),
    points: Math.max(prev?.points ?? points, points),
    attempts: (prev?.attempts ?? 0) + 1,
  };
  write(store);
}

// Mejor precision de un examen entre todos sus ambitos (para la tarjeta).
export function bestForExam(examId: string): number | null {
  const best = read().best;
  const vals = Object.entries(best)
    .filter(([k]) => k.startsWith(`${examId}:`))
    .map(([, v]) => v.accuracy);
  return vals.length ? Math.max(...vals) : null;
}

export interface Overview {
  tracked: number; // preguntas vistas alguna vez
  due: number; // pendientes de repaso hoy
  weak: number; // en la caja 1 (reaprendizaje): las que de verdad se atragantan
  mastered: number; // caja 5
  boxes: number[]; // conteo por caja [1..5]
  accuracy: number; // global historica sobre respondidas
  answered: number;
  sessions: number;
  streak: number; // dias consecutivos con actividad
  recent: SessionRecord[];
}

export function overview(): Overview {
  const store = read();
  const states = Object.values(store.questions);
  const now = Date.now();
  const boxes = [0, 0, 0, 0, 0];
  let correct = 0, answered = 0, due = 0;
  for (const s of states) {
    boxes[s.box - 1]++;
    correct += s.correct;
    answered += s.correct + s.wrong;
    if (Date.parse(s.due) <= now) due++;
  }
  return {
    tracked: states.length,
    due,
    weak: boxes[0],
    mastered: boxes[4],
    boxes,
    accuracy: answered ? correct / answered : 0,
    answered,
    sessions: store.sessions.length,
    streak: streakDays(store.sessions),
    recent: store.sessions.slice(-10).reverse(),
  };
}

export interface ExamStat {
  examId: string;
  tracked: number;
  answered: number;
  accuracy: number;
  weak: number;
}

/** Desglose por examen. Sin temas, es el corte mas fino disponible. */
export function byExam(): ExamStat[] {
  const store = read();
  const acc = new Map<string, ExamStat>();
  for (const [key, s] of Object.entries(store.questions)) {
    const examId = key.slice(0, key.lastIndexOf(":"));
    const e = acc.get(examId) ?? { examId, tracked: 0, answered: 0, accuracy: 0, weak: 0 };
    e.tracked++;
    e.answered += s.correct + s.wrong;
    e.accuracy += s.correct; // se normaliza al final
    if (s.box <= 2) e.weak++;
    acc.set(examId, e);
  }
  return [...acc.values()]
    .map((e) => ({ ...e, accuracy: e.answered ? e.accuracy / e.answered : 0 }))
    .sort((a, b) => a.accuracy - b.accuracy); // peor primero
}

/**
 * Tendencia: precision de las ultimas 5 sesiones frente a las 5 anteriores.
 * null si no hay historial suficiente para decir nada honesto.
 */
export function trend(): { recent: number; previous: number; delta: number } | null {
  const s = read().sessions.filter((x) => x.answered > 0);
  if (s.length < 4) return null;
  const half = Math.min(5, Math.floor(s.length / 2));
  const rate = (xs: SessionRecord[]) => {
    const a = xs.reduce((n, x) => n + x.answered, 0);
    return a ? xs.reduce((n, x) => n + x.correct, 0) / a : 0;
  };
  const recent = rate(s.slice(-half));
  const previous = rate(s.slice(-half * 2, -half));
  return { recent, previous, delta: recent - previous };
}

// Dias consecutivos (hasta hoy o ayer) con al menos una sesion.
function streakDays(sessions: SessionRecord[]): number {
  if (!sessions.length) return 0;
  const days = new Set(sessions.map((s) => s.at.slice(0, 10)));
  const d = new Date();
  const iso = () => d.toISOString().slice(0, 10);
  if (!days.has(iso())) {
    d.setDate(d.getDate() - 1);
    if (!days.has(iso())) return 0; // ni hoy ni ayer: racha rota
  }
  let n = 0;
  while (days.has(iso())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function resetAll(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(OLD_KEY);
  } catch {
    // sin persistencia: nada que borrar
  }
}
