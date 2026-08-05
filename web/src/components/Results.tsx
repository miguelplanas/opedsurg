import { useEffect, useRef } from "react";
import { SOURCE_LABELS, type Exam, type Letter, type SessionConfig } from "../types";
import { scoreSession, sqKey, type SessionQuestion } from "../lib/session";
import { recordAnswers, recordBest, recordSession } from "../lib/progress";
import { AnswerGrid } from "./AnswerGrid";

interface Props {
  examsById: Record<string, Exam>;
  config: SessionConfig;
  session: SessionQuestion[];
  responses: Record<string, Letter>;
  elapsed: number;
  onExit: () => void;
  onRestart: () => void;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function Results({ examsById, config, session, responses, elapsed, onExit, onRestart }: Props) {
  const score = scoreSession(session, responses);
  const saved = useRef(false);

  useEffect(() => {
    if (saved.current) return; // el efecto puede reejecutarse; guardar una sola vez
    saved.current = true;

    // Leitner: cada pregunta contestada sube o baja de caja. Las que se dejan
    // en blanco no se tocan (no hay evidencia de si se sabian o no).
    const byExam = new Map<string, { questionId: string; ok: boolean }[]>();
    for (const sq of session) {
      if (sq.question.status === "nula") continue;
      const r = responses[sqKey(sq)];
      if (r === undefined) continue;
      const list = byExam.get(sq.examId) ?? [];
      list.push({ questionId: sq.question.id, ok: r === sq.question.answer });
      byExam.set(sq.examId, list);
    }
    for (const [examId, results] of byExam) recordAnswers(examId, results);

    if (config.source === "examen" && config.examId) {
      recordBest(config.examId, config.scope, score.accuracy, score.points);
    }
    recordSession({
      at: new Date().toISOString(),
      source: config.source,
      examId: config.examId,
      answered: score.answered,
      correct: score.correct,
      points: score.points,
      elapsed,
    });
  }, [config, session, responses, score, elapsed]);

  const wrong = session.filter((sq) => {
    const r = responses[sqKey(sq)];
    return r !== undefined && r !== sq.question.answer;
  });

  return (
    <div className="app">
      <div className="topbar">
        <button className="back" onClick={onExit} aria-label="Volver al inicio">←</button>
        <span className="eyebrow">Resultado · {SOURCE_LABELS[config.source]}</span>
      </div>

      <div className="result-head">
        <div className="score-big">{Math.round(score.accuracy * 100)}%</div>
        <div className="score-sub">
          {score.points.toFixed(3).replace(/\.?0+$/, "")} / {score.maxPoints.toFixed(1)} puntos · {fmt(elapsed)}
        </div>
      </div>

      <div className="stat-row">
        <div className="stat correct"><div className="n">{score.correct}</div><div className="l">Aciertos</div></div>
        <div className="stat wrong"><div className="n">{score.wrong}</div><div className="l">Fallos</div></div>
        <div className="stat"><div className="n">{score.blank}</div><div className="l">En blanco</div></div>
      </div>

      <div className="section">
        <span className="label">Rejilla</span>
        <div className="grid-legend">
          <span><i className="dot correct" /> Acierto</span>
          <span><i className="dot wrong" /> Fallo</span>
          <span><i className="dot" /> En blanco</span>
          {session.some((sq) => sq.question.status === "nula") && (
            <span><i className="dot nula" /> Anulada</span>
          )}
        </div>
        <AnswerGrid session={session} responses={responses} reveal />
      </div>

      {wrong.length > 0 && (
        <div className="section">
          <span className="label">Repaso de fallos ({wrong.length})</span>
          <div className="review">
            {wrong.map((sq) => {
              const q = sq.question;
              const given = responses[sqKey(sq)]!;
              return (
                <div key={sqKey(sq)} className="review-item">
                  <span className={`q-tag${q.reserve ? " reserve" : ""}`}>{q.id}</span>
                  {config.source !== "examen" && (
                    <span className="q-part"> {examsById[sq.examId]?.title}</span>
                  )}
                  <p>{q.stem}</p>
                  <div className="review-ans">
                    <div className="r yours"><b>{given}</b><span>{q.options[given]}</span></div>
                    <div className="r right"><b>{q.answer}</b><span>{q.answer ? q.options[q.answer] : ""}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button className="btn-primary" onClick={onRestart}>Repetir test</button>
      <button className="btn-ghost" onClick={onExit}>Volver al inicio</button>
    </div>
  );
}
