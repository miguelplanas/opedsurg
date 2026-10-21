import { h, header, plural } from '../ui.js';
import { loadExam } from '../dataset.js';
import { countByPart, partLabel, timerPresets, TIMER_PRESETS } from '../quiz.js';
import { startRun } from '../run.js';

const MODES = [
  ['practica', 'Práctica', 'Corrige cada pregunta al momento.'],
  ['examen', 'Examen', 'Contestas todo y ves la nota y los fallos al final.'],
  ['examen-real', 'Examen real', 'Como el día oficial: sin anuladas y solo con las reservas que las sustituyeron.'],
];

// Una opción de radio o casilla con su texto debajo; toda la fila es la etiqueta.
function choice(type, name, value, title, { text, checked, count } = {}) {
  return h('li', {},
    h('label', { class: 'choice' },
      h('input', { type, name, value, checked }),
      h('span', { class: 'mode-text' },
        h('span', {}, title),
        text && h('span', { class: 'small muted' }, text),
      ),
      count !== undefined && h('span', { class: 'meta', dataset: { count: value } }, count),
    ),
  );
}

export async function setup(examId) {
  const exam = await loadExam(examId);
  const base = countByPart(exam, 'practica');
  const scopes = ['comun', 'especifica'].filter((p) => base[p] > 0);
  if (scopes.length === 2) scopes.push('ambas');
  const scopeName = (s) => (s === 'ambas' ? 'Las dos partes' : partLabel(exam, s));

  const start = h('button', { class: 'btn primary', type: 'submit' });
  const status = h('p', { class: 'status error', role: 'status' });
  const custom = h('input', {
    class: 'field minutes', type: 'number', name: 'minutes', min: 1, max: 300, value: 45,
    inputmode: 'numeric', 'aria-label': 'Minutos',
  });

  const form = h('form', { class: 'setup' },
    h('fieldset', {},
      h('legend', { class: 'label' }, 'Qué parte'),
      h('ul', { class: 'list' }, scopes.map((s, i) =>
        choice('radio', 'scope', s, scopeName(s), { checked: i === scopes.length - 1, count: '' }))),
    ),
    h('fieldset', {},
      h('legend', { class: 'label' }, 'Cómo corregir'),
      h('ul', { class: 'list' }, MODES.map(([value, title, text]) =>
        choice('radio', 'mode', value, title, { text, checked: value === 'practica' }))),
    ),
    h('fieldset', {},
      h('legend', { class: 'label' }, 'Tiempo'),
      h('ul', { class: 'list' },
        choice('radio', 'timer', '', 'Sin límite', { checked: true }),
        TIMER_PRESETS.map((t) => choice('radio', 'timer', String(t), `${t} minutos`)),
        h('li', {},
          h('label', { class: 'choice' },
            h('input', { type: 'radio', name: 'timer', value: 'custom' }),
            h('span', { class: 'mode-text' }, h('span', {}, 'Otro')),
          ),
          custom,
          h('span', { class: 'tech muted' }, 'min'),
        ),
      ),
    ),
    h('fieldset', {},
      h('legend', { class: 'label' }, 'Orden'),
      h('ul', { class: 'list' },
        choice('checkbox', 'shuffleQuestions', '1', 'Barajar preguntas', { checked: true }),
        choice('checkbox', 'shuffleOptions', '1', 'Barajar respuestas', { text: 'Cambia el orden de A, B, C y D.' }),
      ),
    ),
    h('div', { class: 'action-bar' }, start),
    status,
  );

  const value = (name) => form.elements[name].value;

  // Conteos, temporizadores con un ritmo razonable y texto del botón.
  function refresh() {
    const counts = countByPart(exam, value('mode'));
    const n = (s) => (s === 'ambas' ? counts.comun + counts.especifica : counts[s]);
    for (const s of scopes) form.querySelector(`[data-count="${s}"]`).textContent = `[${n(s)}]`;
    const total = n(value('scope'));
    const fits = timerPresets(total).map(String);
    for (const input of form.querySelectorAll('input[name="timer"]')) {
      if (!TIMER_PRESETS.map(String).includes(input.value)) continue;
      input.closest('li').hidden = !fits.includes(input.value);
      if (input.checked && !fits.includes(input.value)) form.querySelector('input[name="timer"][value=""]').checked = true;
    }
    start.textContent = `Empezar con ${plural(total, 'pregunta', 'preguntas')}`;
    start.disabled = total === 0;
  }

  form.addEventListener('change', refresh);
  custom.addEventListener('focus', () => { form.querySelector('input[value="custom"]').checked = true; refresh(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = value('timer');
    const minutes = t === 'custom' ? Math.max(1, Math.min(300, Number(custom.value) || 45)) : t ? Number(t) : null;
    start.disabled = true;
    status.textContent = '';
    startRun({
      source: 'examen',
      examId,
      scope: value('scope'),
      mode: value('mode'),
      shuffleQuestions: form.elements.shuffleQuestions.checked,
      shuffleOptions: form.elements.shuffleOptions.checked,
      timerMinutes: minutes,
      limit: null,
    }).catch((err) => {
      start.disabled = false;
      status.textContent = err.message;
    });
  });
  refresh();

  return [
    header('home'),
    h('section', { class: 'stack' },
      h('p', {}, h('a', { class: 'tech', href: '#/convocatorias' }, 'Volver')),
      h('h1', {}, exam.title),
    ),
    form,
  ];
}
