import { h, header, pct } from '../ui.js';
import { loadManifest } from '../dataset.js';
import { bestForExam } from '../progress.js';
import { partLabel } from '../quiz.js';

const year = (e) => Number(e.title.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0);

export async function exams() {
  const { exams: list } = await loadManifest();
  const sorted = [...list].sort((a, b) => year(b) - year(a) || a.title.localeCompare(b.title, 'es'));

  const row = (exam) => {
    const best = bestForExam(exam.id);
    const parts = ['comun', 'especifica']
      .filter((p) => exam.counts[p] > 0)
      .map((p) => `${partLabel(exam, p)} ${exam.counts[p]}`)
      .join(', ');
    return h('li', {},
      h('a', { class: 'row-link', href: `#/convocatoria/${encodeURIComponent(exam.id)}` },
        h('span', { class: 'mode-text' },
          h('span', { class: 'mode-title' }, exam.title),
          h('span', { class: 'tech muted' }, parts),
        ),
        h('span', { class: 'meta' }, best === null ? '' : `[mejor ${pct(best)}]`),
      ),
    );
  };

  return [
    header('home'),
    h('section', { class: 'stack' },
      h('p', {}, h('a', { class: 'tech', href: '#/' }, 'Volver')),
      h('h1', {}, 'Simulacro'),
      h('p', { class: 'muted' }, 'Elige la convocatoria.'),
    ),
    sorted.length
      ? h('ul', { class: 'list' }, sorted.map(row))
      : h('p', { class: 'empty' }, 'Aún no hay convocatorias. Procesa una con el pipeline de ingest.'),
  ];
}
