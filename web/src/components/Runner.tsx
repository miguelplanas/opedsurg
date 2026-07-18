import { useEffect, useMemo, useRef, useState } from "react";
import { partLabel, type Exam, type Letter, type SessionConfig } from "../types";
import { loadExam } from "../lib/dataset";
import { buildSession, type SessionQuestion } from "../lib/session";
import { AnswerGrid } from "./AnswerGrid";
import { Results } from "./Results";

interface Props {
  config: SessionConfig;
  onExit: () => void;
  onRestart: () => void;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Runner({ config, onExit, onRestart }: Props) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [session, setSession] = useState<SessionQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, Letter>>({});
  const [gridOpen, setGridOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0); // segundos
  const startRef = useRef(Date.now());

  useEffect(() => {
    loadExam(config.examId).then((e) => {
      setExam(e);
      setSession(buildSession(e, config));
    });
  }, [config]);

  // Temporizador (cuenta el tiempo; con límite, autofinaliza al agotarse).
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => {
      const secs = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(secs);
      if (config.timerMinutes && secs >= config.timerMinutes * 60) {
        setElapsed(config.timerMinutes * 60);
        setFinished(true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [finished, config.timerMinutes]);

  const remaining = config.timerMinutes
    ? Math.max(0, config.timerMinutes * 60 - elapsed)
    : null;

  const answeredCount = useMemo(() => Object.keys(responses).length, [responses]);

  if (!exam || !session) {
    return <div className="app"><div className="center-note"><div className="spinner" />Preparando test…</div></div>;
  }
  if (session.length === 0) {
    return <div className="app"><div className="center-note">No hay preguntas para esta selección.</div></div>;
  }

  if (finished) {
    return (
      <Results
        exam={exam}
        config={config}
        session={session}
        responses={responses}
        elapsed={elapsed}
        onExit={onExit}
        onRestart={onRestart}
      />
    );
  }

  const sq = session[index];
  const q = sq.question;
  const given = responses[q.id];
  const isPractice = config.mode === "practica";
  const isNula = q.status === "nula";
  const revealed = isPractice && given !== undefined;

  function choose(letter: Letter) {
    if (revealed || isNula) return; // bloqueado tras responder o si está anulada
    setResponses((r) => ({ ...r, [q.id]: letter }));
  }

  function go(delta: number) {
    setIndex((i) => Math.min(session!.length - 1, Math.max(0, i + delta)));
  }

  const isLast = index === session.length - 1;

  return (
    <div className="app runner">
      <div className="run-head">
        <button className="back" onClick={onExit} aria-label="Salir">←</button>
        <div className="run-progress">
          <div className="progress-meta">
            <span>{index + 1} / {session.length}</span>
            <span>{answeredCount} respondidas</span>
          </div>
          <div className="bar"><i style={{ width: `${((index + 1) / session.length) * 100}%` }} /></div>
        </div>
        {remaining !== null && (
          <span className={`timer-pill${remaining <= 60 ? " warn" : ""}`}>{fmt(remaining)}</span>
        )}
        <button className="icon-btn" onClick={() => setGridOpen(true)} aria-label="Ver rejilla">▦</button>
      </div>

      <div className="q-card">
        <div className="q-label">
          <span className={`q-tag${q.reserve ? " reserve" : ""}`}>{q.id}</span>
          {isNula && <span className="q-tag nula">Anulada</span>}
          <span className="q-part">{partLabel(exam, q.part)}{q.reserve ? " · reserva" : ""}</span>
        </div>
        <p className="q-stem">{q.stem}</p>

        <div className={`options${isNula ? " nula" : ""}`}>
          {sq.optionOrder.map((letter) => {
            let cls = "opt";
            if (revealed) {
              if (letter === q.answer) cls += " correct";
              else if (letter === given) cls += " wrong";
            } else if (letter === given) {
              cls += " selected";
            }
            return (
              <button key={letter} className={cls} disabled={revealed || isNula} onClick={() => choose(letter)}>
                <span className="badge">{letter}</span>
                <span>{q.options[letter]}</span>
              </button>
            );
          })}
        </div>

        {isNula && (
          <div className="feedback nula">Pregunta anulada por el tribunal: no se contesta ni puntúa.</div>
        )}
        {revealed && (
          given === q.answer ? (
            <div className="feedback good">✓ Correcto.</div>
          ) : (
            <div className="feedback bad">✗ Fallaste. La correcta es <b>{q.answer}</b>.</div>
          )
        )}
      </div>

      <div className="run-foot">
        <button onClick={() => go(-1)} disabled={index === 0}>Anterior</button>
        {isLast ? (
          <button className="next" onClick={() => setFinished(true)}>Finalizar</button>
        ) : (
          <button className="next" onClick={() => go(1)}>Siguiente</button>
        )}
      </div>

      {gridOpen && (
        <div className="grid-sheet-overlay" onClick={() => setGridOpen(false)}>
          <div className="grid-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Rejilla de respuestas</h3>
            <p className="hint">Toca una celda para ir a esa pregunta.</p>
            <AnswerGrid
              session={session}
              responses={responses}
              current={index}
              onJump={(i) => { setIndex(i); setGridOpen(false); }}
            />
            <button className="btn-ghost" style={{ marginTop: 18 }} onClick={() => setFinished(true)}>
              Finalizar test ({answeredCount}/{session.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
