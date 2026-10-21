// Ciclo de vida de una tanda: empezarla, retomarla tras cerrar la app y
// corregirla (guardando el progreso).
import { loadAllExams, loadExam } from './dataset.js';
import {
  buildAleatorio, buildExam, buildRapido, buildRepaso, score, answersByExam, LETTERS,
} from './quiz.js';
import {
  allStates, clearRun, loadRun, recordAnswers, recordBest, recordRound, saveRun,
} from './progress.js';
import { state, go } from './nav.js';

export const QUICK_LIMIT = 10;
export const RANDOM_LIMIT = 30;

// Modos directos (sin pantalla de configurar): práctica, sin tiempo.
export function quickConfig(source, limit) {
  return {
    source, examId: null, scope: 'ambas', mode: 'practica',
    shuffleQuestions: true, shuffleOptions: false, timerMinutes: null, limit,
  };
}

async function buildItems(config) {
  if (config.source === 'examen') return buildExam(await loadExam(config.examId), config);
  const all = await loadAllExams();
  if (config.source === 'repaso') return buildRepaso(all, allStates(), config.limit);
  if (config.source === 'rapido') return buildRapido(all, allStates(), config.limit ?? QUICK_LIMIT);
  return buildAleatorio(all, config.limit);
}

export async function startRun(config) {
  const items = await buildItems(config);
  state.run = { config, items, index: 0, responses: {}, elapsed: 0 };
  if (items.length) saveRun(state.run);
  go('#/test');
}

// La tanda en memoria o, si la app se cerró, la guardada en el móvil.
export async function currentRun() {
  if (state.run) return state.run;
  const saved = loadRun();
  if (!saved) return null;
  try {
    const items = [];
    for (const [examId, id, order] of saved.refs) {
      const question = (await loadExam(examId)).questions.find((q) => q.id === id);
      const optionOrder = [...order].filter((l) => LETTERS.includes(l));
      if (question && optionOrder.length === 4) items.push({ examId, question, optionOrder });
    }
    if (!items.length) throw new Error('vacía');
    const { refs, ...rest } = saved;
    state.run = { ...rest, items, index: Math.min(saved.index ?? 0, items.length - 1) };
    return state.run;
  } catch {
    clearRun(); // dataset cambiado o guardado roto: mejor empezar de cero
    return null;
  }
}


// Resumen para "Continuar" en el inicio, sin cargar las preguntas.
export function pendingRun() {
  const run = state.run ?? loadRun();
  if (!run) return null;
  const total = (run.items ?? run.refs).length;
  return { source: run.config.source, answered: Object.keys(run.responses).length, total };
}

export function discardRun() {
  state.run = null;
  clearRun();
}

export function finishRun(run) {
  const s = score(run.items, run.responses);
  for (const [examId, results] of answersByExam(run.items, run.responses)) {
    recordAnswers(examId, results);
  }
  const { config } = run;
  if (config.source === 'examen' && config.examId && s.answered) {
    recordBest(config.examId, config.scope, s.accuracy, s.points);
  }
  if (s.answered) {
    recordRound({
      at: new Date().toISOString(),
      source: config.source,
      examId: config.examId,
      answered: s.answered,
      correct: s.correct,
      points: s.points,
      elapsed: run.elapsed,
    });
  }
  state.result = { ...run, score: s };
  discardRun();
  go('#/resultado');
}
