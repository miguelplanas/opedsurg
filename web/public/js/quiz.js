// Qué preguntas entran en una tanda y cómo se puntúa. Sin DOM, para poder
// probarlo con node:test.
//
// Una pregunta de tanda es { examId, question, optionOrder }: el examId hace
// falta porque los ids (C1, E12...) se repiten entre convocatorias, y
// optionOrder es el orden en que se enseñan A, B, C y D (puede ir barajado sin
// cambiar cuál es la correcta).

export const LETTERS = ['A', 'B', 'C', 'D'];
export const PARTS = ['comun', 'especifica'];

const DEFAULT_PART_LABELS = { comun: 'Común', especifica: 'Específica' };

export function partLabel(exam, part) {
  return exam?.partLabels?.[part] ?? DEFAULT_PART_LABELS[part];
}

export function shuffled(arr, random = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const qKey = (examId, questionId) => `${examId}:${questionId}`;
export const itemKey = (item) => qKey(item.examId, item.question.id);

// Por defecto entran todas (anuladas y reservas incluidas; las anuladas se
// enseñan pero no se contestan ni puntúan). En "examen-real" se replica el día
// oficial: fuera las anuladas, y de las reservas solo entran, en orden, tantas
// como anuladas hubo en su parte (son las que las sustituyeron).
export function selectQuestions(exam, mode) {
  if (mode !== 'examen-real') return exam.questions;
  const out = [];
  for (const part of PARTS) {
    const qs = exam.questions.filter((q) => q.part === part);
    const base = qs.filter((q) => !q.reserve);
    const reserves = qs.filter((q) => q.reserve && q.status !== 'nula');
    const needed = base.filter((q) => q.status === 'nula').length;
    out.push(...base.filter((q) => q.status !== 'nula'), ...reserves.slice(0, needed));
  }
  return out;
}

// Preguntas por parte que entran con un modo (para la pantalla de configurar).
export function countByPart(exam, mode) {
  const counts = { comun: 0, especifica: 0 };
  for (const q of selectQuestions(exam, mode)) counts[q.part]++;
  return counts;
}

function withOrder(pool, shuffleOptions) {
  return pool.map(({ examId, question }) => ({
    examId,
    question,
    optionOrder: shuffleOptions ? shuffled(LETTERS) : LETTERS,
  }));
}

// Simulacro de una convocatoria según lo elegido en configurar.
export function buildExam(exam, { mode, scope, shuffleQuestions, shuffleOptions }) {
  let qs = selectQuestions(exam, mode);
  if (scope !== 'ambas') qs = qs.filter((q) => q.part === scope);
  if (shuffleQuestions) qs = shuffled(qs);
  return withOrder(qs.map((question) => ({ examId: exam.id, question })), shuffleOptions);
}

// Todas las contestables de todas las convocatorias.
function answerable(exams) {
  const out = [];
  for (const exam of exams) {
    for (const question of exam.questions) {
      if (question.status !== 'nula') out.push({ examId: exam.id, question });
    }
  }
  return out;
}

const isDue = (st, now) => st && Date.parse(st.due) <= now;

// Repaso: solo lo que vence, primero lo más atrasado y, a igualdad, lo de caja
// más baja. Sin nada vencido devuelve vacío: la pantalla lo dice en vez de
// inventarse un repaso que no toca.
export function buildRepaso(exams, states, limit = null, now = Date.now()) {
  const due = answerable(exams)
    .map((e) => ({ ...e, st: states[itemKey(e)] }))
    .filter((e) => isDue(e.st, now))
    .sort((a, b) => Date.parse(a.st.due) - Date.parse(b.st.due) || a.st.box - b.st.box)
    .map(({ examId, question }) => ({ examId, question }));
  return withOrder(limit ? due.slice(0, limit) : due, false);
}

// Mezcla pura de todas las convocatorias.
export function buildAleatorio(exams, limit = null) {
  const all = shuffled(answerable(exams));
  return withOrder(limit ? all.slice(0, limit) : all, false);
}

// Tanda corta con criterio: primero lo vencido, luego lo flojo (cajas 1 y 2) y
// se rellena con preguntas nunca vistas. Así siempre aporta algo.
export function buildRapido(exams, states, limit, now = Date.now()) {
  const pool = answerable(exams).map((e) => ({ ...e, st: states[itemKey(e)] }));
  const due = pool.filter((e) => isDue(e.st, now));
  const weak = pool.filter((e) => e.st && e.st.box <= 2 && !isDue(e.st, now));
  const unseen = pool.filter((e) => !e.st);
  const picked = new Set();
  for (const group of [due, weak, unseen, pool]) {
    for (const e of shuffled(group)) {
      if (picked.size >= limit) break;
      picked.add(e);
    }
  }
  return withOrder([...picked].map(({ examId, question }) => ({ examId, question })), false);
}

// Puntuación de oposición: acierto +0,5, fallo -0,125, en blanco 0. Las
// anuladas no cuentan.
export function score(items, responses) {
  let correct = 0;
  let wrong = 0;
  let total = 0;
  for (const item of items) {
    if (item.question.status === 'nula') continue;
    total++;
    const r = responses[itemKey(item)];
    if (r === undefined) continue;
    if (r === item.question.answer) correct++;
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

// Resultados por convocatoria, listos para recordAnswers. Las de en blanco no
// se mueven de caja: no hay evidencia de si se sabían.
export function answersByExam(items, responses) {
  const byExam = new Map();
  for (const item of items) {
    if (item.question.status === 'nula') continue;
    const r = responses[itemKey(item)];
    if (r === undefined) continue;
    const list = byExam.get(item.examId) ?? [];
    list.push({ questionId: item.question.id, ok: r === item.question.answer });
    byExam.set(item.examId, list);
  }
  return byExam;
}

// Ritmo razonable de un temporizador: entre 15 s y 3 min por pregunta.
export const TIMER_PRESETS = [15, 30, 60, 90];
export function timerPresets(questions) {
  if (!questions) return TIMER_PRESETS;
  return TIMER_PRESETS.filter((t) => {
    const perQ = (t * 60) / questions;
    return perQ >= 15 && perQ <= 180;
  });
}
