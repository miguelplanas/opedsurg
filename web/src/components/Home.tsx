import { useEffect, useState } from "react";
import type { Manifest } from "../types";
import { loadManifest } from "../lib/dataset";
import { getExamProgress } from "../lib/storage";

export function Home({ onPick }: { onPick: (examId: string) => void }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest().then(setManifest).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <header className="hero">
        <span className="eyebrow">Oposicións · Tests</span>
        <h1 className="display">Prepara o teu exame, pregunta a pregunta.</h1>
        <p>Elixe un exame para practicar en modo test ou repaso.</p>
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
                <span className="chip">Común <b>{exam.counts.comun}</b></span>
                <span className="chip">Específica <b>{exam.counts.especifica}</b></span>
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
