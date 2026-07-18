import { useEffect, useState } from "react";
import { partLabel, type Manifest } from "../types";
import { loadManifest } from "../lib/dataset";
import { getExamProgress } from "../lib/storage";
import { currentTheme, toggleTheme, type Theme } from "../lib/theme";

export function Home({ onPick }: { onPick: (examId: string) => void }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  useEffect(() => {
    loadManifest().then(setManifest).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-top">
          <span className="eyebrow">Oposicións · Tests</span>
          <button
            className="theme-btn"
            onClick={() => setTheme(toggleTheme())}
            aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          >
            {theme === "dark" ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20.5 14.1A8.6 8.6 0 0 1 9.9 3.5a8.6 8.6 0 1 0 10.6 10.6Z" />
              </svg>
            )}
          </button>
        </div>
        <h1 className="display">Oposiciones cirugía pediátrica</h1>
        <p>Elige un examen para practicar.</p>
      </header>

      {error && <div className="center-note">{error}</div>}
      {!manifest && !error && (
        <div className="center-note"><div className="spinner" />Cargando exámenes…</div>
      )}

      <div className="exam-list">
        {manifest?.exams.map((exam) => {
          const prog = getExamProgress(exam.id);
          return (
            <button key={exam.id} className="exam-card" onClick={() => onPick(exam.id)}>
              {prog && (
                <span className="card-score">{Math.round(prog.bestAccuracy * 100)}%</span>
              )}
              <h2>{exam.title}</h2>
              <div className="chips">
                {exam.counts.comun > 0 && (
                  <span className="chip">{partLabel(exam, "comun")} <b>{exam.counts.comun}</b></span>
                )}
                {exam.counts.especifica > 0 && (
                  <span className="chip">{partLabel(exam, "especifica")} <b>{exam.counts.especifica}</b></span>
                )}
              </div>
              <div className="grid-texture" aria-hidden>
                {Array.from({ length: 18 }).map((_, i) => <i key={i} />)}
              </div>
            </button>
          );
        })}
        {manifest?.exams.length === 0 && (
          <div className="center-note">Aún no hay exámenes. Procesa uno con el pipeline de ingesta.</div>
        )}
      </div>
    </div>
  );
}
