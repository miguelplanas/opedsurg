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
  // Etiquetas de las partes para exámenes que no son común/específica
  // (p.ej. {comun: "Teórico", especifica: "Práctico"}). Opcional.
  partLabels?: Partial<Record<Part, string>>;
  questions: Question[];
}

export interface ExamSummary {
  id: string;
  title: string;
  language: string;
  counts: Record<Part, number>;
  partLabels?: Partial<Record<Part, string>>;
}

export const DEFAULT_PART_LABELS: Record<Part, string> = {
  comun: "Común",
  especifica: "Específica",
};

export function partLabel(
  ex: { partLabels?: Partial<Record<Part, string>> } | null,
  part: Part,
): string {
  return ex?.partLabels?.[part] ?? DEFAULT_PART_LABELS[part];
}

export interface Manifest {
  exams: ExamSummary[];
}

// Configuracion de una sesion de test elegida por el usuario.
export type Scope = "comun" | "especifica" | "ambas";
// "examen-real": simulacro fiel al dia oficial, sin anuladas y solo con las
// reservas que entraron a sustituirlas.
export type Mode = "examen" | "practica" | "examen-real";

// De donde salen las preguntas de la sesion. "examen" usa un examen concreto;
// los demas mezclan preguntas de todos los examenes disponibles.
export type SourceKind = "examen" | "repaso" | "aleatorio" | "rapido";

export interface SessionConfig {
  source: SourceKind;
  examId: string | null; // null en los modos que mezclan varios examenes
  scope: Scope;
  mode: Mode;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  timerMinutes: number | null; // null = sin temporizador
  limit: number | null; // tope de preguntas (null = sin tope)
}

export const SOURCE_LABELS: Record<SourceKind, string> = {
  examen: "Examen",
  repaso: "Repaso",
  aleatorio: "Aleatorio",
  rapido: "Rápido",
};
