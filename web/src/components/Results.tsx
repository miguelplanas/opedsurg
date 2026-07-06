import { useEffect, useRef } from "react";
import type { Exam, Letter, SessionConfig } from "../types";
import { scoreSession, type SessionQuestion } from "../lib/session";
import { recordAttempt } from "../lib/storage";
import { AnswerGrid } from "./AnswerGrid";

interface Props {
  exam: Exam;
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

export function Results({ exam, config, session, responses, elapsed, onExit, onRestart }: Props) {
  const score = scoreSession(session, responses);
  const saved = useRef(false);

  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    const wrongIds = session
      .filter((sq) => {
        const r = responses[sq.question.id];
        return r !== undefined && r !== sq.question.answer;
      })
      .map((sq) => sq.question.id);
    recordAttempt(exam.id, config.scope, score.accuracy, score.points, score.answered, wrongIds);
  }, [exam.id, config.scope, session, responses, score]);

  const wrong = session.filter((sq) => {
    const r = responses[sq.question.id];
    return r !== undefined && r !== sq.question.answer;
  });

  return (
    <div className="app">
      <div className="topbar">
        <button className="back" onClick={onExit} aria-label="Volver al inicio">←</button>
        <span className="eyebrow">Resultado</span>
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
              return (
                <div key={q.id} className="review-item">
                  <span className={`q-tag${q.reserve ? " reserve" : ""}`}>{q.id}</span>
                  <p>{q.stem}</p>
                  <div className="review-ans">
                    <div className="r yours"><b>{responses[q.id]}</b><span>{q.options[responses[q.id]!]}</span></div>
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
