import { h, header, pct, points, duration, plural } from '../ui.js';
import { itemKey } from '../quiz.js';
import { loadExam } from '../dataset.js';
import { startRun } from '../run.js';
import { go, state } from '../nav.js';
import { sourceName } from './home.js';

export async function results() {
  const r = state.result;
  if (!r) {
    go('#/');
    return [];
  }
  const { score: s, items, responses, config } = r;
  const mixed = config.source !== 'examen';
  const titles = Object.fromEntries(await Promise.all(
    [...new Set(items.map((i) => i.examId))].map(async (id) => [id, (await loadExam(id)).title]),
  ));

  const wrong = items.filter((i) => {
    const g = responses[itemKey(i)];
    return g !== undefined && g !== i.question.answer;
  });

  const cell = (item) => {
    const given = responses[itemKey(item)];
    const q = item.question;
    const kind = q.status === 'nula' ? 'nula' : given === undefined ? 'blank' : given === q.answer ? 'correct' : 'wrong';
    const say = { nula: 'anulada', blank: 'en blanco', correct: 'acierto', wrong: 'fallo' }[kind];
    return h('span', { class: `cell tech ${kind}`, title: `${q.id}, ${say}`, 'aria-label': `${q.id}, ${say}` },
      q.id);
  };

  const review = (item) => {
    const q = item.question;
    const given = responses[itemKey(item)];
    return h('li', { class: 'review' },
      h('p', { class: 'tech muted' }, `[${q.id}]${mixed ? ` ${titles[item.examId]}` : ''}`),
      h('p', {}, q.stem),
      h('p', { class: 'answer wrong' }, h('span', { class: 'tech' }, `${given} `), q.options[given], h('span', { class: 'tag' }, ' [Tu respuesta]')),
      h('p', { class: 'answer correct' }, h('span', { class: 'tech' }, `${q.answer} `), q.options[q.answer], h('span', { class: 'tag' }, ' [Correcta]')),
    );
  };

  // Repetir: la misma configuración; en simulacro vuelve a configurar.
  const again = () => (config.source === 'examen'
    ? go(`#/convocatoria/${encodeURIComponent(config.examId)}`)
    : startRun(config));

  return [
    header('home'),
    h('section', { class: 'stack' },
      h('p', { class: 'tech muted' }, `[${sourceName(config.source)}]${config.source === 'examen' ? ` ${titles[config.examId]}` : ''}`),
      h('h1', {}, s.answered ? `${pct(s.accuracy)} de acierto` : 'Sin respuestas'),
      h('p', { class: 'tech muted' },
        `${points(s.points)} de ${points(s.maxPoints)} puntos, en ${duration(r.elapsed)}`),
    ),
    h('ul', { class: 'list' },
      h('li', {}, 'Aciertos', h('span', { class: 'meta' }, s.correct)),
      h('li', {}, 'Fallos', h('span', { class: 'meta' }, s.wrong)),
      h('li', {}, 'En blanco', h('span', { class: 'meta' }, s.blank)),
    ),
    h('section', { class: 'stack' },
      h('h2', { class: 'label' }, 'Rejilla'),
      h('p', { class: 'tech muted legend' },
        h('span', { class: 'key correct' }), 'acierto ',
        h('span', { class: 'key wrong' }), 'fallo ',
        h('span', { class: 'key blank' }), 'en blanco',
        items.some((i) => i.question.status === 'nula') && [' ', h('span', { class: 'key nula' }), 'anulada'],
      ),
      h('div', { class: 'grid' }, items.map(cell)),
    ),
    wrong.length > 0 && h('section', { class: 'stack' },
      h('h2', { class: 'label' }, `Fallos [${wrong.length}]`),
      h('p', { class: 'small muted' }, `Volverán a salir en el repaso de hoy.`),
      h('ul', { class: 'list' }, wrong.map(review)),
    ),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => go('#/') }, 'Volver al inicio'),
      h('button', { class: 'btn', type: 'button', onclick: again }, config.source === 'examen' ? 'Otro simulacro' : 'Otra tanda igual'),
    ),
  ];
}
