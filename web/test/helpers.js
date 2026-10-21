// localStorage en memoria para los tests (en Node no existe sin flags).
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

export function q(id, extra = {}) {
  return {
    id, part: id.startsWith('C') ? 'comun' : 'especifica', number: Number(id.slice(1)), reserve: false,
    stem: `Pregunta ${id}`, options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answer: 'A', status: 'ok', ...extra,
  };
}
