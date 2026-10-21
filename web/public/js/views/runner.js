import { h, clock, plural, sheet } from '../ui.js';
import { itemKey, partLabel, LETTERS } from '../quiz.js';
import { examsFor } from '../dataset.js';
import { saveRun } from '../progress.js';
import { currentRun, discardRun, finishRun, quickConfig, startRun, QUICK_LIMIT } from '../run.js';
import { go, state } from '../nav.js';

// Lo que vive mientras la vista está en pantalla; se limpia al salir.
let ticker = null;
let onKey = null;
function teardown() {
  clearInterval(ticker);
  ticker = null;
  if (onKey) document.removeEventListener('keydown', onKey);
  onKey = null;
}
window.addEventListener('hashchange', () => { if (location.hash !== '#/test') teardown(); });

export async function runner() {
  teardown();
  const run = await currentRun();
  if (!run) {
    go('#/');
    return [];
  }
  if (!run.items.length) {
    discardRun();
    const repaso = run.config.source === 'repaso';
    return [
      h('section', { class: 'stack' },
        h('p', {}, h('a', { class: 'tech', href: '#/' }, 'Volver')),
        h('h1', {}, repaso ? 'Nada que repasar' : 'Sin preguntas'),
        h('p', { class: 'muted' }, repaso
          ? 'Hoy no vence ninguna pregunta. Vuelve mañana o haz una tanda rápida.'
          : 'No hay preguntas con esta selección.'),
        repaso && h('div', {}, h('button', {
          class: 'btn primary', type: 'button', onclick: () => startRun(quickConfig('rapido', QUICK_LIMIT)),
        }, 'Tanda rápida')),
      ),
    ];
  }

  const { config, items } = run;
  const titles = await examsFor(items);
  const practice = config.mode === 'practica';
  const mixed = config.source !== 'examen';
  const limit = config.timerMinutes ? config.timerMinutes * 60 : null;

  const answered = () => Object.keys(run.responses).length;
  const counter = h('span', { class: 'tech' });
  const timer = h('span', { class: 'tech timer' });
  const bar = h('span', { class: 'bar' }, h('i'));
  const body = h('div', { class: 'question' });
  const prev = h('button', { class: 'btn', type: 'button', onclick: () => move(-1) }, 'Anterior');
  const next = h('button', { class: 'btn primary', type: 'button', onclick: () => advance() });

  function current() {
    return items[run.index];
  }

  function paint(focus = false) {
    const item = current();
    const q = item.question;
    const given = run.responses[itemKey(item)];
    const nula = q.status === 'nula';
    const revealed = practice && given !== undefined;
    const exam = titles[item.examId];

    counter.textContent = `${run.index + 1} de ${items.length}`;
    bar.firstChild.style.width = `${((run.index + 1) / items.length) * 100}%`;
    prev.disabled = run.index === 0;
    next.textContent = run.index === items.length - 1 ? 'Corregir' : 'Siguiente';

    const where = [mixed && exam.title, partLabel(exam, q.part), q.reserve && 'reserva'].filter(Boolean).join(', ');
    const option = (letter) => {
      const cls = ['option'];
      let note = null;
      if (revealed && letter === q.answer) { cls.push('correct'); note = '[Correcta]'; }
      else if (revealed && letter === given) { cls.push('wrong'); note = '[Tu respuesta]'; }
      else if (!revealed && letter === given) cls.push('selected');
      return h('li', {},
        h('button', {
          class: cls.join(' '), type: 'button', disabled: revealed || nula,
          'aria-pressed': !revealed ? String(letter === given) : null,
          onclick: () => choose(letter),
        },
          h('span', { class: 'letter tech' }, letter),
          h('span', { class: 'option-text' }, q.options[letter], note && h('span', { class: 'tag' }, ` ${note}`)),
        ),
      );
    };

    body.replaceChildren(
      h('h1', { class: 'visually-hidden', tabindex: '-1' }, `Pregunta ${run.index + 1} de ${items.length}`),
      h('p', { class: 'tech muted' }, `[${q.id}] ${where}`),
      h('p', { class: 'stem' }, q.stem),
      h('ul', { class: 'options' }, item.optionOrder.map(option)),
      h('p', { class: `status${revealed ? (given === q.answer ? ' ok' : ' error') : ''}`, role: 'status' },
        nula ? '[Anulada] El tribunal la anuló: no se contesta ni puntúa.'
        : revealed ? (given === q.answer ? 'Correcto.' : `Fallo. La correcta es la ${q.answer}.`)
        : ''),
    );
    if (focus) body.querySelector('h1').focus({ preventScroll: true });
  }

  function choose(letter) {
    const item = current();
    if (item.question.status === 'nula') return;
    if (practice && run.responses[itemKey(item)] !== undefined) return; // ya corregida
    run.responses[itemKey(item)] = letter;
    saveRun(run);
    paint();
  }

  function move(delta) {
    const to = Math.min(items.length - 1, Math.max(0, run.index + delta));
    if (to === run.index) return;
    run.index = to;
    saveRun(run);
    paint(true);
    window.scrollTo(0, 0);
  }

  function advance() {
    if (run.index < items.length - 1) return move(1);
    askFinish();
  }

  function askFinish() {
    const blank = items.filter((i) => i.question.status !== 'nula' && run.responses[itemKey(i)] === undefined).length;
    if (!blank) return finish();
    const dlg = sheet('¿Corregir ya?',
      h('p', { class: 'muted' }, `Te ${blank === 1 ? 'queda' : 'quedan'} ${plural(blank, 'pregunta', 'preguntas')} sin contestar. Cuentan como en blanco.`),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => { dlg.close(); finish(); } }, 'Corregir'),
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Seguir'),
      ),
    );
  }

  // Una sola vez: el tiempo puede acabarse con una hoja abierta (Corregir,
  // Salir, Rejilla) y su botón volvería a guardar todas las respuestas.
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    teardown();
    for (const dlg of document.querySelectorAll('dialog[open]')) dlg.close();
    finishRun(run);
  }

  function exit() {
    if (!answered()) {
      discardRun();
      return go('#/');
    }
    const dlg = sheet('Salir de la tanda',
      h('p', { class: 'muted' }, 'Se queda guardada en este móvil y puedes seguirla desde el inicio.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => { dlg.close(); go('#/'); } }, 'Salir y seguir luego'),
        h('button', { class: 'btn', type: 'button', onclick: () => { dlg.close(); finish(); } }, 'Corregir ahora'),
      ),
      h('button', {
        class: 'btn quiet danger', type: 'button',
        onclick: () => { dlg.close(); state.run = null; discardRun(); go('#/'); },
      }, 'Descartar sin guardar'),
    );
  }

  function openGrid() {
    const cells = items.map((item, i) => {
      const given = run.responses[itemKey(item)];
      const cls = ['cell', 'tech'];
      if (item.question.status === 'nula') cls.push('nula');
      else if (given !== undefined) cls.push('answered');
      return h('button', {
        class: cls.join(' '), type: 'button', 'aria-current': i === run.index ? 'step' : null,
        'aria-label': `${item.question.id}${given ? `, contestada ${given}` : ''}`,
        onclick: () => { dlg.close(); run.index = i; saveRun(run); paint(true); },
      }, item.question.id);
    });
    const dlg = sheet('Rejilla',
      h('p', { class: 'tech muted' }, `[${answered()} de ${items.length} contestadas] Toca una para ir a ella.`),
      h('div', { class: 'grid' }, cells),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { dlg.close(); askFinish(); } }, 'Corregir ahora'),
    );
  }

  // Con límite, cuenta atrás; sin límite, el tiempo que llevas.
  function showClock() {
    const left = limit ? Math.max(0, limit - run.elapsed) : null;
    timer.textContent = clock(limit ? left : run.elapsed);
    timer.classList.toggle('low', limit !== null && left <= 60);
    return left;
  }

  function tick() {
    run.elapsed++;
    if (showClock() === 0) return finish();
    if (run.elapsed % 10 === 0) saveRun(run);
  }

  onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    const k = e.key.toUpperCase();
    const n = LETTERS.indexOf(k) >= 0 ? LETTERS.indexOf(k) : '1234'.indexOf(e.key);
    if (n >= 0) choose(current().optionOrder[n]);
    else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft') move(-1);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  // El tiempo solo corre con la app delante: en segundo plano no se estudia.
  ticker = setInterval(() => { if (document.visibilityState === 'visible') tick(); }, 1000);
  showClock();
  paint();

  return [
    h('header', { class: 'run-head' },
      h('button', { class: 'btn quiet', type: 'button', onclick: exit }, 'Salir'),
      counter,
      timer,
      h('button', { class: 'btn quiet', type: 'button', onclick: openGrid }, 'Rejilla'),
      bar,
    ),
    body,
    h('div', { class: 'action-bar run-foot' }, prev, next),
  ];
}
