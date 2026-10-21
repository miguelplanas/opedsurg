// Arranque y navegación. Rutas por hash, para que el botón atrás de Android y
// del navegador funcionen sin servidor:
//   #/                    inicio: modos de estudio
//   #/convocatorias       lista de convocatorias (modo Examen)
//   #/convocatoria/<id>   configurar el simulacro
//   #/test                la tanda en curso
//   #/resultado           corrección de la última tanda
//   #/progreso            estadísticas
import { home } from './views/home.js';
import { exams } from './views/exams.js';
import { setup } from './views/setup.js';
import { runner } from './views/runner.js';
import { results } from './views/results.js';
import { stats } from './views/stats.js';
import { h } from './ui.js';

const root = document.getElementById('app');

let seq = 0;
async function route() {
  const my = ++seq;
  const path = location.hash.replace(/^#/, '') || '/';
  const [, name, arg] = path.split('/');
  let view;
  try {
    view = await (
      !name ? home()
      : name === 'convocatorias' ? exams()
      : name === 'convocatoria' ? setup(decodeURIComponent(arg ?? ''))
      : name === 'test' ? runner()
      : name === 'resultado' ? results()
      : name === 'progreso' ? stats()
      : home()
    );
  } catch (err) {
    view = [h('p', { class: 'status error', role: 'alert' },
      `${err.message} Comprueba la conexión y vuelve a abrir la app.`)];
  }
  if (my !== seq) return; // otra navegación llegó antes: esta ya no vale
  root.replaceChildren(...view.flat().filter(Boolean));
  window.scrollTo(0, 0);
  // El foco va al título, así un lector de pantalla anuncia la vista nueva.
  const title = root.querySelector('h1');
  if (title) {
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
