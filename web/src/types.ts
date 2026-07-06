// Tipos del dataset generado por el pipeline de ingesta.

export type Part = "comun" | "especifica";
export type Letter = "A" | "B" | "C" | "D";
export type QuestionStatus = "ok" | "nula" | "modificada";

export interface Question {
  id: string; // "C1", "E101"
  part: Part;
  number: number;
  reserve: boolean;
  stem: string;
  options: Record<Letter, string>;
  answer: Letter | null; // null si nula
  status: QuestionStatus;
}

export interface Exam {
  id: string;
  title: string;
  language: string;
  counts: Record<Part, number>;
  questions: Question[];
}

export interface ExamSummary {
  id: string;
  title: string;
  language: string;
  counts: Record<Part, number>;
}

export interface Manifest {
  exams: ExamSummary[];
}

// Configuracion de una sesion de test elegida por el usuario.
export type Scope = "comun" | "especifica" | "ambas";
// "examen-real": simulacro fiel al dia oficial, sin anuladas y solo con las
// reservas que entraron a sustituirlas.
export type Mode = "examen" | "practica" | "examen-real";

export interface SessionConfig {
  examId: string;
  scope: Scope;
  mode: Mode;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  timerMinutes: number | null; // null = sin temporizador
}
