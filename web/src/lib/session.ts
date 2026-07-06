import type { Exam, Letter, Mode, Part, Question, SessionConfig } from "../types";

const LETTERS: Letter[] = ["A", "B", "C", "D"];

// Una pregunta preparada para la sesion: la pregunta mas el orden en que se
// muestran sus opciones (puede ir barajado sin cambiar cual es la correcta).
export interface SessionQuestion {
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
    question,
    optionOrder: cfg.shuffleOptions ? shuffled(LETTERS) : LETTERS,
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

export function scoreSession(
  session: SessionQuestion[],
  responses: Record<string, Letter>,
): Score {
  let correct = 0;
  let wrong = 0;
  let total = 0;
  for (const { question } of session) {
    if (question.status === "nula") continue; // no puntuan ni cuentan
    total++;
    const r = responses[question.id];
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
