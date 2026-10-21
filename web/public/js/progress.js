// Progreso por pregunta con cajas de Leitner, todo en localStorage (sin
// backend ni login). Aciertas, sube de caja y tarda más en volver; fallas,
// vuelve a la caja 1.
//
// El formato de KEY es el mismo que guardaba la versión en React: cambiarlo
// borraría el progreso de quien ya la usa. Si hace falta otro, migración.

const KEY = 'opo-tests:progress:v2';
const OLD_KEY = 'opo-tests:progress:v1';
const RUN_KEY = 'opo-tests:run:v1';

// Días hasta el siguiente repaso según la caja (índice = caja). La caja 1 vence
// el mismo día a propósito: si una pregunta recién fallada venciese mañana, el
// repaso saldría vacío justo después de fallarla.
export const BOX_INTERVALS = [0, 0, 3, 7, 16, 35];
export const MAX_BOX = 5;
export const BOX_NAMES = ['Reaprender', 'Frescas', 'Asentadas', 'Sólidas', 'Dominadas'];

const storage = () => globalThis.localStorage;

function blank() {
  return { questions: {}, sessions: [], best: {} };
}

function read() {
  try {
    const raw = storage().getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { questions: s.questions ?? {}, sessions: s.sessions ?? [], best: s.best ?? {} };
    }
    return migrateV1();
  } catch {
    return blank();
  }
}

function write(store) {
  try {
    if (store.sessions.length > 200) store.sessions = store.sessions.slice(-200);
    storage().setItem(KEY, JSON.stringify(store));
  } catch {
    // cuota llena o modo privado: el progreso no persiste, la app sigue
  }
}

// Los fallos del modelo v1 (solo una lista de ids) entran en la caja 1, vencidos hoy.
function migrateV1() {
  const store = blank();
  try {
    const raw = storage().getItem(OLD_KEY);
    if (!raw) return store;
    const now = new Date().toISOString();
    for (const [key, prog] of Object.entries(JSON.parse(raw))) {
      const examId = key.split(':')[0];
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
    // migración imposible: se empieza limpio
  }
  return store;
}

export function allStates() {
  return read().questions;
}

// Vence de madrugada: "dentro de 3 días" es el tercer día entero.
function dueIn(days, now) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(4, 0, 0, 0);
  return d.toISOString();
}

export function recordAnswers(examId, results, now = new Date()) {
  const store = read();
  for (const { questionId, ok } of results) {
    const k = `${examId}:${questionId}`;
    const prev = store.questions[k];
    // Acertar una nueva la manda a la caja 2: la 1 es la de reaprender.
    const box = ok ? Math.min(MAX_BOX, Math.max(2, (prev?.box ?? 0) + 1)) : 1;
    store.questions[k] = {
      box,
      due: dueIn(BOX_INTERVALS[box], now),
      seen: (prev?.seen ?? 0) + 1,
      correct: (prev?.correct ?? 0) + (ok ? 1 : 0),
      wrong: (prev?.wrong ?? 0) + (ok ? 0 : 1),
      lastSeen: now.toISOString(),
      lastOk: ok,
    };
  }
  write(store);
}

// Historial de tandas. En el almacén se llama "sessions" por compatibilidad.
export function recordRound(rec) {
  const store = read();
  store.sessions.push(rec);
  write(store);
}

export function recordBest(examId, scope, accuracy, points) {
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

// Mejor precisión de una convocatoria entre todos sus ámbitos.
export function bestForExam(examId) {
  const vals = Object.entries(read().best)
    .filter(([k]) => k.startsWith(`${examId}:`))
    .map(([, v]) => v.accuracy);
  return vals.length ? Math.max(...vals) : null;
}

export function overview(now = Date.now()) {
  const store = read();
  const states = Object.values(store.questions);
  const boxes = [0, 0, 0, 0, 0];
  let correct = 0;
  let answered = 0;
  let due = 0;
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
    rounds: store.sessions.length,
    streak: streakDays(store.sessions, new Date(now)),
    recent: store.sessions.slice(-10).reverse(),
  };
}

// Desglose por convocatoria, la peor primero.
export function byExam() {
  const acc = new Map();
  for (const [key, s] of Object.entries(read().questions)) {
    const examId = key.slice(0, key.lastIndexOf(':'));
    const e = acc.get(examId) ?? { examId, tracked: 0, answered: 0, correct: 0, weak: 0 };
    e.tracked++;
    e.answered += s.correct + s.wrong;
    e.correct += s.correct;
    if (s.box <= 2) e.weak++;
    acc.set(examId, e);
  }
  return [...acc.values()]
    .map((e) => ({ ...e, accuracy: e.answered ? e.correct / e.answered : 0 }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

// Precisión de las últimas tandas frente a las anteriores (hasta 5 y 5). null
// si no hay historial suficiente para decir nada honesto.
export function trend() {
  const s = read().sessions.filter((x) => x.answered > 0);
  if (s.length < 4) return null;
  const half = Math.min(5, Math.floor(s.length / 2));
  const rate = (xs) => {
    const a = xs.reduce((n, x) => n + x.answered, 0);
    return a ? xs.reduce((n, x) => n + x.correct, 0) / a : 0;
  };
  const recent = rate(s.slice(-half));
  const previous = rate(s.slice(-half * 2, -half));
  return { recent, previous, delta: recent - previous };
}

// Días seguidos (hasta hoy o ayer) con al menos una tanda, en hora local.
function streakDays(rounds, today) {
  if (!rounds.length) return 0;
  const day = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const days = new Set(rounds.map((r) => day(new Date(r.at))));
  const d = new Date(today);
  if (!days.has(day(d))) {
    d.setDate(d.getDate() - 1);
    if (!days.has(day(d))) return 0;
  }
  let n = 0;
  while (days.has(day(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function resetAll() {
  try {
    storage().removeItem(KEY);
    storage().removeItem(OLD_KEY);
    storage().removeItem(RUN_KEY);
  } catch {
    // sin persistencia: nada que borrar
  }
}

// Tanda a medias. iOS cierra la app en segundo plano sin avisar: sin esto, un
// simulacro de 150 preguntas se perdía al contestar un mensaje. Se guardan
// referencias (examId, id de pregunta, orden de opciones), no las preguntas.
export function saveRun(run) {
  try {
    storage().setItem(RUN_KEY, JSON.stringify({
      ...run,
      items: run.items.map((i) => [i.examId, i.question.id, i.optionOrder.join('')]),
    }));
  } catch {
    // sin persistencia: la tanda sigue en memoria
  }
}

// Devuelve la tanda guardada sin resolver: { ...run, refs: [[examId, id, orden]] }.
export function loadRun() {
  try {
    const raw = storage().getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw);
    return Array.isArray(run.items) && run.items.length ? { ...run, refs: run.items, items: undefined } : null;
  } catch {
    return null;
  }
}

export function clearRun() {
  try { storage().removeItem(RUN_KEY); } catch {}
}
