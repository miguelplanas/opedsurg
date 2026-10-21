import { h, header, pct, plural } from '../ui.js';
import { overview } from '../progress.js';
import {
  pendingRun, quickConfig, startRun, discardRun, QUICK_LIMIT, RANDOM_LIMIT,
} from '../run.js';
import { go } from '../nav.js';

const SOURCE_NAMES = { examen: 'Simulacro', repaso: 'Repaso', rapido: 'Rápido', aleatorio: 'Aleatorio' };
export const sourceName = (s) => SOURCE_NAMES[s] ?? s;

// Una fila de la lista de modos: toda la fila es el botón.
function mode({ title, text, meta, onclick, disabled, primary }) {
  return h('li', {},
    h('button', { class: `mode${primary ? ' primary' : ''}`, type: 'button', onclick, disabled },
      h('span', { class: 'mode-text' },
        h('span', { class: 'mode-title' }, title),
        h('span', { class: 'small muted' }, text),
      ),
      meta && h('span', { class: 'meta' }, meta),
    ),
  );
}

export function home() {
  const ov = overview();
  const pending = pendingRun();
  const start = (source, limit) => (e) => {
    e.currentTarget.disabled = true;
    startRun(quickConfig(source, limit));
  };

  const lead =
    ov.due > 0 ? `Tienes ${plural(ov.due, 'pregunta', 'preguntas')} para repasar hoy.`
    : ov.tracked ? 'Nada pendiente hoy. Buen día para un simulacro.'
    : 'Empieza por una tanda rápida: lo que falles volverá a salir en el repaso.';

  return [
    header('home'),
    h('section', { class: 'stack' },
      h('h1', {}, 'Cirugía pediátrica'),
      h('p', { class: 'muted' }, lead),
      ov.tracked > 0 && h('p', { class: 'tech muted summary' },
        h('a', { href: '#/progreso' },
          `[${pct(ov.accuracy)} acierto] [${ov.tracked} vistas] [${ov.mastered} dominadas]`,
          ov.streak > 0 ? ` [racha de ${plural(ov.streak, 'día', 'días')}]` : '',
        ),
      ),
    ),

    pending && h('section', { class: 'resume' },
      h('p', {},
        h('span', { class: 'label' }, 'Tanda sin terminar'),
        h('span', { class: 'tech muted' }, ` [${sourceName(pending.source)}, ${pending.answered} de ${pending.total}]`),
      ),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => go('#/test') }, 'Continuar'),
        h('button', {
          class: 'btn quiet', type: 'button',
          onclick: (e) => { discardRun(); e.currentTarget.closest('.resume').remove(); },
        }, 'Descartar'),
      ),
    ),

    h('section', { class: 'stack' },
      h('h2', { class: 'label' }, 'Cómo quieres estudiar'),
      h('ul', { class: 'list modes' },
        mode({
          title: 'Repaso',
          text: ov.due > 0
            ? 'Lo que toca hoy, empezando por lo más atrasado.'
            : 'Sin nada pendiente. Se llena solo con lo que vayas fallando.',
          meta: ov.due > 0 ? `[${ov.due}]` : null,
          onclick: start('repaso', null),
          disabled: ov.due === 0,
          primary: ov.due > 0,
        }),
        mode({
          title: 'Rápido',
          text: 'Lo pendiente, lo flojo y algo que no hayas visto nunca.',
          meta: `[${QUICK_LIMIT}]`,
          onclick: start('rapido', QUICK_LIMIT),
        }),
        mode({
          title: 'Simulacro',
          text: 'Una convocatoria entera, con ámbito, modo y temporizador.',
          onclick: () => go('#/convocatorias'),
        }),
        mode({
          title: 'Aleatorio',
          text: 'Preguntas mezcladas de todas las convocatorias.',
          meta: `[${RANDOM_LIMIT}]`,
          onclick: start('aleatorio', RANDOM_LIMIT),
        }),
      ),
    ),
  ];
}
