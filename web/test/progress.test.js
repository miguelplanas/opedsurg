process.env.TZ = 'Europe/Madrid';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, q } from './helpers.js';

globalThis.localStorage = memoryStorage();
const p = await import('../public/js/progress.js');

beforeEach(() => localStorage.clear());

test('lee el progreso guardado por la versión anterior sin perder nada', () => {
  // Formato exacto que guardaba la app en React (opo-tests:progress:v2).
  const old = {
    questions: { 'andalucia-2015:C1': { box: 3, due: '2026-10-01T02:00:00.000Z', seen: 4, correct: 3, wrong: 1, lastSeen: '2026-09-24T10:00:00.000Z', lastOk: true } },
    sessions: [{ at: '2026-09-24T10:00:00.000Z', source: 'rapido', examId: null, answered: 10, correct: 7, points: 3.125, elapsed: 300 }],
    best: { 'andalucia-2015:ambas': { accuracy: 0.7, points: 50, attempts: 2 } },
  };
  localStorage.setItem('opo-tests:progress:v2', JSON.stringify(old));
  const ov = p.overview(Date.parse('2026-10-21T10:00:00Z'));
  assert.equal(ov.tracked, 1);
  assert.equal(ov.due, 1);
  assert.equal(ov.accuracy, 0.75);
  assert.equal(ov.rounds, 1);
  assert.equal(p.bestForExam('andalucia-2015'), 0.7);
});

test('migra los fallos del modelo v1 a la caja 1', () => {
  localStorage.setItem('opo-tests:progress:v1', JSON.stringify({ 'ex:ambas': { wrongIds: ['C1', 'E2'], bestAccuracy: 0.5 } }));
  assert.deepEqual(Object.keys(p.allStates()).sort(), ['ex:C1', 'ex:E2']);
  assert.equal(p.allStates()['ex:C1'].box, 1);
});

test('Leitner: acertar sube de caja (una nueva va a la 2), fallar vuelve a la 1', () => {
  const now = new Date('2026-10-21T10:00:00+02:00');
  p.recordAnswers('ex', [{ questionId: 'C1', ok: true }, { questionId: 'C2', ok: false }], now);
  let s = p.allStates();
  assert.equal(s['ex:C1'].box, 2);
  assert.equal(s['ex:C2'].box, 1);
  assert.equal(new Date(s['ex:C2'].due).getDate(), 21, 'la caja 1 vence el mismo día');
  assert.equal(new Date(s['ex:C1'].due).getDate(), 24, 'la caja 2 vuelve a los 3 días');
  for (let i = 0; i < 6; i++) p.recordAnswers('ex', [{ questionId: 'C1', ok: true }], now);
  s = p.allStates();
  assert.equal(s['ex:C1'].box, 5, 'no pasa de la caja 5');
  assert.equal(new Date(s['ex:C1'].due).getDate(), 25, 'la caja 5 vuelve a los 35 días (25 de noviembre)');
  p.recordAnswers('ex', [{ questionId: 'C1', ok: false }], now);
  assert.equal(p.allStates()['ex:C1'].box, 1);
});

test('racha en días locales seguidos hasta hoy o ayer', () => {
  const at = (iso) => ({ at: iso, source: 'rapido', examId: null, answered: 1, correct: 1, points: 0.5, elapsed: 1 });
  // 00:30 en Madrid del día 20 es el 19 en UTC: tiene que contar como día 20.
  for (const iso of ['2026-10-18T09:00:00+02:00', '2026-10-19T09:00:00+02:00', '2026-10-20T00:30:00+02:00']) p.recordRound(at(iso));
  assert.equal(p.overview(Date.parse('2026-10-21T10:00:00+02:00')).streak, 3);
  assert.equal(p.overview(Date.parse('2026-10-23T10:00:00+02:00')).streak, 0);
});

test('tendencia solo con historial suficiente', () => {
  const r = (correct) => ({ at: new Date().toISOString(), source: 'rapido', examId: null, answered: 10, correct, points: 0, elapsed: 1 });
  for (const c of [5, 5, 5]) p.recordRound(r(c));
  assert.equal(p.trend(), null);
  p.recordRound(r(9));
  p.recordRound(r(9));
  const t = p.trend();
  assert.ok(t.delta > 0);
});

test('una tanda a medias se guarda por referencias y se recupera', () => {
  const run = {
    config: { source: 'examen', examId: 'ex', mode: 'examen' },
    items: [{ examId: 'ex', question: q('C1'), optionOrder: ['B', 'A', 'D', 'C'] }],
    index: 0, responses: { 'ex:C1': 'B' }, elapsed: 42,
  };
  p.saveRun(run);
  const back = p.loadRun();
  assert.deepEqual(back.refs, [['ex', 'C1', 'BADC']]);
  assert.equal(back.elapsed, 42);
  assert.deepEqual(back.responses, { 'ex:C1': 'B' });
  p.clearRun();
  assert.equal(p.loadRun(), null);
});

test('borrar todo deja el progreso a cero', () => {
  p.recordAnswers('ex', [{ questionId: 'C1', ok: true }]);
  p.resetAll();
  assert.equal(p.overview().tracked, 0);
});

test('copiar y pegar el progreso fusiona sin duplicar', () => {
  const now = new Date('2026-10-21T10:00:00+02:00');
  p.recordAnswers('ex', [{ questionId: 'C1', ok: true }, { questionId: 'C2', ok: false }], now);
  p.recordRound({ at: now.toISOString(), source: 'rapido', examId: null, answered: 2, correct: 1, points: 0.375, elapsed: 30 });
  p.recordBest('ex', 'ambas', 0.5, 0.375);
  const text = p.exportProgress();

  localStorage.clear();
  p.recordAnswers('ex', [{ questionId: 'C1', ok: false }], new Date('2026-10-22T10:00:00+02:00')); // más reciente
  assert.deepEqual(p.importProgress(text), { questions: 2, added: 1 });
  assert.deepEqual(p.importProgress(text), { questions: 2, added: 0 }, 'pegar dos veces no añade nada');
  const s = p.allStates();
  assert.equal(s['ex:C1'].box, 1, 'gana la respuesta más reciente');
  assert.equal(s['ex:C2'].box, 1);
  assert.equal(p.overview().rounds, 1, 'la tanda no se duplica');
  assert.equal(p.bestForExam('ex'), 0.5);
});

test('pegar algo que no es un progreso avisa y no toca nada', () => {
  p.recordAnswers('ex', [{ questionId: 'C1', ok: true }]);
  assert.throws(() => p.importProgress('hola'), /no es un progreso/);
  assert.throws(() => p.importProgress('{"questions":{}}'), /no es un progreso/);
  assert.equal(p.overview().tracked, 1);
});
