// Estado que sobrevive entre vistas (la tanda en curso y la última corrección)
// y navegación. Aparte de app.js para que las vistas no lo importen en círculo.
export const state = { run: null, result: null, flash: null };

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
