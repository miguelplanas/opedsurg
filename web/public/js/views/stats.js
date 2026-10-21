import { h, header, pct, plural, sheet } from '../ui.js';
import { loadManifest } from '../dataset.js';
import {
  BOX_INTERVALS, BOX_NAMES, byExam, exportProgress, importProgress, overview, resetAll, trend,
} from '../progress.js';
import { discardRun } from '../run.js';
import { sourceName } from './home.js';
import { go, state } from '../nav.js';

const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

// Copiar y pegar el progreso: cada dominio y cada app instalada guarda el suyo.
function transfer(hasData) {
  const status = h('p', { class: `status${state.flash ? ' ok' : ''}`, role: 'status' }, state.flash ?? '');
  state.flash = null;

  async function copy() {
    const text = exportProgress();
    try {
      await navigator.clipboard.writeText(text);
      status.className = 'status ok';
      status.textContent = 'Copiado. Ábrelo donde quieras tenerlo, Progreso, Pegar progreso.';
    } catch {
      // Sin portapapeles: el texto a la vista para copiarlo a mano.
      const area = h('textarea', { class: 'field code', rows: 6, readonly: true, 'aria-label': 'Progreso copiado' });
      area.value = text;
      sheet('Copiar progreso', h('p', { class: 'muted' }, 'Mantén pulsado el texto, Seleccionar todo y Copiar.'), area);
      area.select();
    }
  }

  function paste() {
    const area = h('textarea', { class: 'field code', rows: 6, 'aria-label': 'Progreso copiado' });
    const msg = h('p', { class: 'status error', role: 'status' });
    const dlg = sheet('Pegar progreso',
      h('p', { class: 'muted' }, 'Pega aquí lo que copiaste con Copiar mi progreso. Se suma a lo que ya hay en este móvil.'),
      area,
      msg,
      h('button', {
        class: 'btn primary', type: 'button',
        onclick: () => {
          try {
            const { added } = importProgress(area.value.trim());
            state.flash = `Importado: ${plural(added, 'pregunta nueva', 'preguntas nuevas')}.`;
            dlg.close();
            go('#/progreso');
          } catch (err) {
            msg.textContent = err.message;
          }
        },
      }, 'Importar'),
    );
  }

  return h('section', { class: 'stack transfer' },
    h('h2', { class: 'label' }, 'Pasar el progreso'),
    h('p', { class: 'small muted' }, 'El progreso se guarda en cada móvil (y en cada app instalada) por separado. Para llevarlo a otro, cópialo aquí y pégalo allí.'),
    h('div', { class: 'row' },
      hasData && h('button', { class: 'btn', type: 'button', onclick: copy }, 'Copiar mi progreso'),
      h('button', { class: 'btn', type: 'button', onclick: paste }, 'Pegar progreso'),
    ),
    status,
  );
}

export async function stats() {
  const ov = overview();
  if (!ov.tracked) {
    return [
      header('stats'),
      h('section', { class: 'stack' },
        h('h1', {}, 'Progreso'),
        h('p', { class: 'empty' }, 'Todavía no hay datos. Haz una tanda y vuelve.'),
        h('div', {}, h('a', { class: 'btn primary link-btn', href: '#/' }, 'Ir a estudiar')),
      ),
      transfer(false),
    ];
  }

  const titles = await loadManifest()
    .then((m) => Object.fromEntries(m.exams.map((e) => [e.id, e.title])))
    .catch(() => ({}));
  const exams = byExam();
  const tr = trend();

  // Solo se afirma lo que los datos sostienen.
  const findings = [];
  if (tr && Math.abs(tr.delta) >= 0.03) {
    findings.push(`${tr.delta > 0 ? 'Vas a mejor' : 'Vas a peor'}: ${pct(tr.recent)} en las últimas tandas, ${pct(tr.previous)} en las anteriores.`);
  } else if (tr) {
    findings.push('Rendimiento estable en las últimas tandas.');
  } else {
    findings.push('Con un par de tandas más se verá si vas a mejor.');
  }
  if (ov.due) findings.push(`${plural(ov.due, 'pregunta vence', 'preguntas vencen')} hoy.`);
  if (ov.weak) findings.push(`${plural(ov.weak, 'pregunta está', 'preguntas están')} en reaprender: son las que se te atragantan.`);
  if (ov.mastered) findings.push(`${plural(ov.mastered, 'dominada', 'dominadas')}: vuelven dentro de ${BOX_INTERVALS[5]} días.`);
  if (exams.length > 1 && exams[0].answered >= 10) {
    findings.push(`Donde peor vas: ${titles[exams[0].examId] ?? exams[0].examId} (${pct(exams[0].accuracy)}).`);
  }

  const most = Math.max(...ov.boxes, 1);

  function confirmReset() {
    const dlg = sheet('Borrar el progreso',
      h('p', { class: 'muted' }, 'Se borran las cajas, el historial y la tanda sin terminar de este móvil. No se puede deshacer.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary danger-fill', type: 'button', onclick: () => { resetAll(); discardRun(); dlg.close(); go('#/'); } }, 'Borrar todo'),
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancelar'),
      ),
    );
  }

  return [
    header('stats'),
    h('section', { class: 'stack' },
      h('h1', {}, 'Progreso'),
      h('p', { class: 'lead num' }, `${pct(ov.accuracy)} de acierto`),
      h('p', { class: 'tech muted' },
        `[${plural(ov.answered, 'respuesta', 'respuestas')}] [${plural(ov.tracked, 'pregunta vista', 'preguntas vistas')}] [racha de ${plural(ov.streak, 'día', 'días')}]`),
    ),
    h('section', { class: 'stack' },
      h('h2', { class: 'label' }, 'Qué dicen los datos'),
      h('ul', { class: 'list' }, findings.map((f) => h('li', {}, f))),
    ),
    h('section', { class: 'stack' },
      h('h2', { class: 'label' }, 'Cajas de repaso'),
      h('ul', { class: 'list boxes' }, ov.boxes.map((n, i) =>
        h('li', {},
          h('span', { class: 'box-name' }, BOX_NAMES[i]),
          h('span', { class: 'box-bar', 'aria-hidden': 'true' }, h('i', { style: `width: ${(n / most) * 100}%` })),
          h('span', { class: 'meta' }, n),
        ))),
      h('p', { class: 'small muted' }, 'Si aciertas, la pregunta sube de caja y tarda más en volver. Si fallas, vuelve a la primera.'),
    ),
    exams.length > 0 && h('section', { class: 'stack' },
      h('h2', { class: 'label' }, 'Por convocatoria'),
      h('ul', { class: 'list' }, exams.map((e) =>
        h('li', {}, titles[e.examId] ?? e.examId,
          h('span', { class: 'meta' }, `${pct(e.accuracy)} [${plural(e.tracked, 'vista', 'vistas')}]`)))),
    ),
    ov.recent.length > 0 && h('section', { class: 'stack' },
      h('h2', { class: 'label' }, 'Últimas tandas'),
      h('ul', { class: 'list' }, ov.recent.map((r) =>
        h('li', {},
          h('span', {}, sourceName(r.source), h('span', { class: 'tech muted' }, ` ${day.format(new Date(r.at))}`)),
          h('span', { class: 'meta' }, `${pct(r.answered ? r.correct / r.answered : 0)} [${r.answered}]`)))),
    ),
    transfer(true),
    h('div', {}, h('button', { class: 'btn quiet danger', type: 'button', onclick: confirmReset }, 'Borrar todo el progreso')),
  ];
}
