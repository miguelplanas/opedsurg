// Ayudas mínimas para pintar vistas sin framework.

// h('button', { class: 'btn', onclick }, 'Texto', otroNodo). Los hijos null,
// false o undefined se ignoran, así se puede escribir cond && h(...).
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

export const pct = (x) => `${Math.round(x * 100)} %`;

// 41.375 -> "41,375"; 30 -> "30"
export const points = (x) => x.toLocaleString('es-ES', { maximumFractionDigits: 3 });

export function clock(sec) {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function duration(sec) {
  const m = Math.floor(sec / 60);
  return m ? `${m} min ${sec % 60} s` : `${sec} s`;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Cabecera común: marca (vuelve al inicio), navegación y botón de tema.
export function header(current) {
  const link = (href, text, name) =>
    h('a', { href, 'aria-current': current === name ? 'page' : null }, text);
  return h('header', {},
    h('a', { class: 'brand', href: '#/' }, 'Opo Tests'),
    h('nav', { class: 'nav', 'aria-label': 'Principal' },
      link('#/progreso', 'Progreso', 'stats'),
    ),
    h('button', {
      class: 'btn quiet theme-toggle', type: 'button', 'data-theme-toggle': true,
      'aria-label': 'Cambiar tema claro u oscuro',
    }),
  );
}

// Hoja modal (<dialog class="sheet">): botón de cerrar fijo arriba y la página
// de detrás quieta mientras está abierta (regla de estilo-apps).
export function sheet(title, ...body) {
  const dlg = h('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-title' },
    h('div', { class: 'sheet-head' },
      h('h2', { id: 'sheet-title' }, title),
      h('button', { class: 'btn quiet', type: 'button', onclick: () => dlg.close() }, 'Cerrar'),
    ),
    ...body,
  );
  dlg.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    dlg.remove();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  document.documentElement.style.overflow = 'hidden';
  dlg.showModal();
  return dlg;
}
