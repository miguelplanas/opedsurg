import { useEffect, useState } from "react";
import type { Manifest } from "../types";
import { loadManifest } from "../lib/dataset";
import {
  BOX_INTERVALS, byExam, overview, resetAll, trend,
  type ExamStat, type Overview,
} from "../lib/progress";

const BOX_NAMES = ["Reaprender", "Frescas", "Asentadas", "Sólidas", "Dominadas"];

export function Stats({ onBack }: { onBack: () => void }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [exams, setExams] = useState<ExamStat[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [tr, setTr] = useState<ReturnType<typeof trend>>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setOv(overview());
    setExams(byExam());
    setTr(trend());
    loadManifest()
      .then((m: Manifest) =>
        setTitles(Object.fromEntries(m.exams.map((e) => [e.id, e.title]))))
      .catch(() => setTitles({}));
  }, []);

  if (!ov) return <div className="app"><div className="center-note"><div className="spinner" /></div></div>;

  if (ov.tracked === 0) {
    return (
      <div className="app">
        <Head onBack={onBack} />
        <div className="center-note">
          Todavía no hay datos. Haz una tanda y vuelve.
        </div>
      </div>
    );
  }

  const maxBox = Math.max(...ov.boxes, 1);

  return (
    <div className="app">
      <Head onBack={onBack} />

      <div className="stat-row">
        <div className="stat"><div className="n">{Math.round(ov.accuracy * 100)}%</div><div className="l">Acierto</div></div>
        <div className="stat"><div className="n">{ov.answered}</div><div className="l">Respuestas</div></div>
        <div className="stat"><div className="n">{ov.streak}</div><div className="l">Racha</div></div>
      </div>

      {/* Conclusiones: solo se afirma lo que los datos sostienen. */}
      <div className="section">
        <span className="label">Conclusiones</span>
        <ul className="findings">
          {tr && Math.abs(tr.delta) >= 0.03 ? (
            <li className={tr.delta > 0 ? "up" : "down"}>
              {tr.delta > 0 ? "Vas a mejor" : "Vas a peor"}: {Math.round(tr.recent * 100)}% en
              las últimas sesiones frente a {Math.round(tr.previous * 100)}% antes.
            </li>
          ) : (
            <li>Rendimiento estable{tr ? "" : " (aún faltan sesiones para ver tendencia)"}.</li>
          )}
          {ov.due > 0 && <li className="down">{ov.due} preguntas vencidas esperando repaso.</li>}
          {ov.weak > 0 && (
            <li>{ov.weak} preguntas en reaprendizaje: son las que se te atragantan.</li>
          )}
          {ov.mastered > 0 && (
            <li className="up">{ov.mastered} dominadas (caja 5): volverán dentro de {BOX_INTERVALS[5]} días.</li>
          )}
          {exams.length > 1 && exams[0].answered >= 10 && (
            <li className="down">
              Donde peor vas: <b>{titles[exams[0].examId] ?? exams[0].examId}</b> ({Math.round(exams[0].accuracy * 100)}%).
            </li>
          )}
        </ul>
      </div>

      <div className="section">
        <span className="label">Cajas de repaso</span>
        <div className="boxes">
          {ov.boxes.map((n, i) => (
            <div className="box-row" key={i}>
              <span className="box-name">{BOX_NAMES[i]}</span>
              <div className="box-bar"><i style={{ width: `${(n / maxBox) * 100}%` }} /></div>
              <span className="box-n mono">{n}</span>
            </div>
          ))}
        </div>
        <p className="hint">
          Aciertas → sube de caja y tarda más en volver. Fallas → vuelve a la primera.
        </p>
      </div>

      {exams.length > 0 && (
        <div className="section">
          <span className="label">Por convocatoria</span>
          <div className="review">
            {exams.map((e) => (
              <div key={e.examId} className="exam-stat">
                <span className="exam-stat-title">{titles[e.examId] ?? e.examId}</span>
                <span className="mono">{Math.round(e.accuracy * 100)}% · {e.tracked} vistas</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ov.recent.length > 0 && (
        <div className="section">
          <span className="label">Últimas sesiones</span>
          <div className="review">
            {ov.recent.map((s, i) => (
              <div key={i} className="exam-stat">
                <span className="exam-stat-title">
                  {new Date(s.at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · {s.source}
                </span>
                <span className="mono">
                  {s.answered ? Math.round((s.correct / s.answered) * 100) : 0}% · {s.answered} preg.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        className="btn-ghost danger"
        onClick={() => {
          if (!confirmReset) return setConfirmReset(true);
          resetAll();
          onBack();
        }}
      >
        {confirmReset ? "Toca otra vez para confirmar el borrado" : "Borrar todo el progreso"}
      </button>
    </div>
  );
}

function Head({ onBack }: { onBack: () => void }) {
  return (
    <div className="topbar">
      <button className="back" onClick={onBack} aria-label="Volver">←</button>
      <div>
        <span className="eyebrow">Progreso</span>
        <h1 className="display" style={{ fontSize: 22, marginTop: 2 }}>Estadísticas</h1>
      </div>
    </div>
  );
}
