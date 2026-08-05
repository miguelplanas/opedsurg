import type { Exam, Letter, Mode, Part, Question, SessionConfig } from "../types";
import type { QuestionState } from "./progress";

const LETTERS: Letter[] = ["A", "B", "C", "D"];

// Una pregunta preparada para la sesion: la pregunta mas el orden en que se
// muestran sus opciones (puede ir barajado sin cambiar cual es la correcta).
export interface SessionQuestion {
  examId: string; // necesario: los ids de pregunta se repiten entre examenes
  question: Question;
  optionOrder: Letter[];
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Preguntas que entran segun el modo. Por defecto entran todas (anuladas y
// reservas incluidas; las anuladas se muestran pero no se contestan ni
// puntuan). En "examen-real" se replica el examen oficial: fuera las
// anuladas, y de las reservas solo entran, en orden, tantas como anuladas
// hubo en su parte (son las que las sustituyeron).
export function selectQuestions(exam: Exam, mode: Mode): Question[] {
  if (mode !== "examen-real") return exam.questions;

  const out: Question[] = [];
  for (const part of ["comun", "especifica"] as Part[]) {
    const qs = exam.questions.filter((q) => q.part === part);
    const base = qs.filter((q) => !q.reserve);
    const reserves = qs.filter((q) => q.reserve && q.status !== "nula");
    const needed = base.filter((q) => q.status === "nula").length;
    out.push(...base.filter((q) => q.status !== "nula"), ...reserves.slice(0, needed));
  }
  return out;
}

// Construye la lista de preguntas segun la configuracion.
export function buildSession(exam: Exam, cfg: SessionConfig): SessionQuestion[] {
  let qs = selectQuestions(exam, cfg.mode);

  if (cfg.scope !== "ambas") qs = qs.filter((q) => q.part === cfg.scope);

  if (cfg.shuffleQuestions) qs = shuffled(qs);

  return qs.map((question) => ({
    examId: exam.id,
    question,
    optionOrder: cfg.shuffleOptions ? shuffled(LETTERS) : LETTERS,
  }));
}

// ---------- modos que mezclan varios examenes ----------

/** Todas las preguntas contestables (las anuladas no puntuan ni se responden). */
function answerable(exams: Exam[]): { examId: string; question: Question }[] {
  const out: { examId: string; question: Question }[] = [];
  for (const exam of exams) {
    for (const question of exam.questions) {
      if (question.status !== "nula") out.push({ examId: exam.id, question });
    }
  }
  return out;
}

/**
 * Preguntas para repaso: solo las vencidas segun Leitner, primero las mas
 * atrasadas y las de caja baja. Si no hay ninguna vencida, devuelve vacio: la
 * pantalla lo dice en vez de inventarse un repaso que no toca.
 */
export function buildRepaso(
  exams: Exam[],
  states: Record<string, QuestionState>,
  limit: number | null,
): { examId: string; question: Question }[] {
  const now = Date.now();
  const due = answerable(exams)
    .map((e) => ({ ...e, st: states[`${e.examId}:${e.question.id}`] }))
    .filter((e) => e.st && Date.parse(e.st.due) <= now)
    .sort((a, b) => {
      const byDue = Date.parse(a.st!.due) - Date.parse(b.st!.due);
      return byDue !== 0 ? byDue : a.st!.box - b.st!.box;
    })
    .map(({ examId, question }) => ({ examId, question }));
  return limit ? due.slice(0, limit) : due;
}

/** Mezcla aleatoria pura de todos los examenes. */
export function buildAleatorio(
  exams: Exam[],
  limit: number | null,
): { examId: string; question: Question }[] {
  const all = shuffled(answerable(exams));
  return limit ? all.slice(0, limit) : all;
}

/**
 * Sesion corta con criterio: primero lo vencido, luego lo flojo (cajas 1-2),
 * y se rellena con preguntas nunca vistas. Asi una tanda de 10 siempre aporta
 * algo, tenga o no repaso pendiente.
 */
export function buildRapido(
  exams: Exam[],
  states: Record<string, QuestionState>,
  limit: number,
): { examId: string; question: Question }[] {
  const now = Date.now();
  const pool = answerable(exams).map((e) => ({
    ...e, st: states[`${e.examId}:${e.question.id}`],
  }));
  const dueQs = pool.filter((e) => e.st && Date.parse(e.st.due) <= now);
  const weak = pool.filter((e) => e.st && e.st.box <= 2 && !dueQs.includes(e));
  const unseen = pool.filter((e) => !e.st);

  const picked: typeof pool = [];
  for (const group of [dueQs, weak, unseen, pool]) {
    for (const e of shuffled(group)) {
      if (picked.length >= limit) break;
      if (!picked.includes(e)) picked.push(e);
    }
    if (picked.length >= limit) break;
  }
  return picked.map(({ examId, question }) => ({ examId, question }));
}

/** Envuelve un pool ya elegido como sesion jugable. */
export function toSession(
  pool: { examId: string; question: Question }[],
  shuffleOptions: boolean,
): SessionQuestion[] {
  return pool.map(({ examId, question }) => ({
    examId,
    question,
    optionOrder: shuffleOptions ? shuffled(LETTERS) : LETTERS,
  }));
}

// Puntuacion estilo oposicion: acierto +0.5, fallo -0.125, en blanco 0.
export interface Score {
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  blank: number;
  points: number;
  maxPoints: number;
  accuracy: number; // sobre las contestadas
}

/** Clave de respuesta. Compuesta porque los ids se repiten entre examenes. */
export function sqKey(sq: SessionQuestion): string {
  return `${sq.examId}:${sq.question.id}`;
}

export function scoreSession(
  session: SessionQuestion[],
  responses: Record<string, Letter>,
): Score {
  let correct = 0;
  let wrong = 0;
  let total = 0;
  for (const sq of session) {
    const { question } = sq;
    if (question.status === "nula") continue; // no puntuan ni cuentan
    total++;
    const r = responses[sqKey(sq)];
    if (r === undefined) continue;
    if (r === question.answer) correct++;
    else wrong++;
  }
  const answered = correct + wrong;
  return {
    total,
    answered,
    correct,
    wrong,
    blank: total - answered,
    points: correct * 0.5 - wrong * 0.125,
    maxPoints: total * 0.5,
    accuracy: answered ? correct / answered : 0,
  };
}

export function isCorrect(q: Question, letter: Letter | undefined): boolean {
  return letter !== undefined && letter === q.answer;
}
