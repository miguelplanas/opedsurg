// Tema claro/oscuro. Sigue el sistema salvo que el usuario elija uno
// explícitamente con el botón; la elección se guarda en localStorage.
const KEY = "opo-tests:theme:v1";

export type Theme = "light" | "dark";

const META_COLOR: Record<Theme, string> = {
  light: "#fbf8f1",
  dark: "#10151c",
};

function savedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  const saved = savedTheme();
  if (saved) return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", META_COLOR[theme]);
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // sin persistencia: el cambio dura la sesión
  }
  apply(next);
  return next;
}

// Al arrancar: aplica el tema guardado; sin elección, manda el sistema.
export function initTheme() {
  const saved = savedTheme();
  if (saved) apply(saved);
}
