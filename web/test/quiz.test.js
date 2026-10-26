import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectQuestions, buildExam, buildRepaso, buildRapido, buildAleatorio, score, answersByExam,
  countByPart, timerPresets, itemKey, keyCommand,
} from '../public/js/quiz.js';
import { q } from './helpers.js';

const exam = {
  id: 'ex1',
  questions: [
    q('C1'), q('C2', { status: 'nula', answer: null }), q('C3'),
    q('C4', { reserve: true }), q('C5', { reserve: true }),
    q('E1'), q('E2', { reserve: true, status: 'nula', answer: null }), q('E3', { reserve: true }),
  ],
};
const ids = (items) => items.map((i) => i.question.id);

test('examen real quita anuladas y mete solo las reservas que las sustituyen', () => {
  assert.deepEqual(selectQuestions(exam, 'examen-real').map((x) => x.id), ['C1', 'C3', 'C4', 'E1']);
  assert.equal(selectQuestions(exam, 'practica').length, 8);
  assert.deepEqual(countByPart(exam, 'examen-real'), { comun: 3, especifica: 1 });
});

test('simulacro por ámbito y sin barajar conserva el orden de la planilla', () => {
  const items = buildExam(exam, { mode: 'practica', scope: 'comun', shuffleQuestions: false, shuffleOptions: false });
  assert.deepEqual(ids(items), ['C1', 'C2', 'C3', 'C4', 'C5']);
  assert.deepEqual(items[0].optionOrder, ['A', 'B', 'C', 'D']);
});

test('barajar respuestas no pierde ninguna letra', () => {
  for (const item of buildExam(exam, { mode: 'examen', scope: 'ambas', shuffleQuestions: true, shuffleOptions: true })) {
    assert.deepEqual([...item.optionOrder].sort(), ['A', 'B', 'C', 'D']);
  }
});

test('repaso: solo lo vencido, lo más atrasado primero, nunca anuladas', () => {
  const now = Date.parse('2026-10-21T10:00:00Z');
  const states = {
    'ex1:C1': { box: 2, due: '2026-10-20T04:00:00Z' },
    'ex1:C3': { box: 1, due: '2026-10-18T04:00:00Z' },
    'ex1:E1': { box: 3, due: '2026-10-25T04:00:00Z' },
    'ex1:C2': { box: 1, due: '2026-10-01T04:00:00Z' }, // anulada
  };
  assert.deepEqual(ids(buildRepaso([exam], states, null, now)), ['C3', 'C1']);
  assert.deepEqual(ids(buildRepaso([exam], {}, null, now)), []);
});

test('rápido: primero lo vencido, sin repetir y con el tope pedido', () => {
  const now = Date.parse('2026-10-21T10:00:00Z');
  const states = { 'ex1:E3': { box: 1, due: '2026-10-20T04:00:00Z' } };
  const items = buildRapido([exam], states, 3, now);
  assert.equal(items.length, 3);
  assert.equal(items[0].question.id, 'E3');
  assert.equal(new Set(items.map(itemKey)).size, 3);
  assert.equal(buildRapido([exam], {}, 50, now).length, 6, 'todas las contestables y ni una más');
});

test('aleatorio no mete anuladas', () => {
  assert.ok(buildAleatorio([exam]).every((i) => i.question.status !== 'nula'));
});

test('puntuación de oposición: +0,5, -0,125 y anuladas fuera', () => {
  const items = buildExam(exam, { mode: 'practica', scope: 'ambas', shuffleQuestions: false, shuffleOptions: false });
  const s = score(items, { 'ex1:C1': 'A', 'ex1:C3': 'B', 'ex1:C2': 'A' });
  assert.equal(s.total, 6);
  assert.equal(s.correct, 1);
  assert.equal(s.wrong, 1);
  assert.equal(s.blank, 4);
  assert.equal(s.points, 0.375);
  assert.equal(s.maxPoints, 3);
  assert.equal(s.accuracy, 0.5);
  assert.deepEqual([...answersByExam(items, { 'ex1:C1': 'A', 'ex1:C3': 'B' })], [
    ['ex1', [{ questionId: 'C1', ok: true }, { questionId: 'C3', ok: false }]],
  ]);
});

test('temporizadores con un ritmo razonable', () => {
  assert.deepEqual(timerPresets(153), [60, 90]);
  assert.deepEqual(timerPresets(10), [15, 30]);
});

test('teclado de la tanda: letras y números contestan, flechas mueven, Enter sigue', () => {
  assert.deepEqual(keyCommand('a'), { type: 'choose', pos: 0 });
  assert.deepEqual(keyCommand('D'), { type: 'choose', pos: 3 });
  assert.deepEqual(keyCommand('2'), { type: 'choose', pos: 1 });
  assert.deepEqual(keyCommand('ArrowLeft'), { type: 'move', delta: -1 });
  assert.deepEqual(keyCommand('ArrowRight'), { type: 'move', delta: 1 });
  assert.deepEqual(keyCommand('Enter'), { type: 'advance' });
  assert.equal(keyCommand('Enter', true), null, 'Enter en un botón lo pulsa, no avanza');
  assert.equal(keyCommand('e'), null);
  assert.equal(keyCommand('5'), null);
  assert.equal(keyCommand(''), null);
});
