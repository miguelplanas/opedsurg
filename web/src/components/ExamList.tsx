import { useEffect, useState } from "react";
import { partLabel, type Manifest } from "../types";
import { loadManifest } from "../lib/dataset";
import { bestForExam } from "../lib/progress";

// Antes era la pantalla de inicio; ahora cuelga del modo "Examen" de la landing.
export function ExamList({
  onBack, onPick,
}: { onBack: () => void; onPick: (examId: string) => void }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest().then(setManifest).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <div className="topbar">
        <button className="back" onClick={onBack} aria-label="Volver">←</button>
        <div>
          <span className="eyebrow">Modo examen</span>
          <h1 className="display" style={{ fontSize: 22, marginTop: 2 }}>
            Elige convocatoria
          </h1>
        </div>
      </div>

      {error && <div className="center-note">{error}</div>}
      {!manifest && !error && (
        <div className="center-note"><div className="spinner" />Cargando exámenes…</div>
      )}

      <div className="exam-list">
        {manifest?.exams.map((exam) => {
          const best = bestForExam(exam.id);
          return (
            <button key={exam.id} className="exam-card" onClick={() => onPick(exam.id)}>
              {best !== null && (
                <span className="card-score">{Math.round(best * 100)}%</span>
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
