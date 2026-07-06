import { useEffect, useMemo, useState } from "react";
import type { Exam, Mode, Scope, SessionConfig } from "../types";
import { loadExam } from "../lib/dataset";

interface Props {
  examId: string;
  onBack: () => void;
  onStart: (config: SessionConfig) => void;
}

const TIMER_OPTIONS: (number | null)[] = [null, 15, 30, 60, 90];

export function Setup({ examId, onBack, onStart }: Props) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [scope, setScope] = useState<Scope>("ambas");
  const [mode, setMode] = useState<Mode>("practica");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState<number | null>(null);

  useEffect(() => {
    loadExam(examId).then(setExam);
  }, [examId]);

  // Conteos disponibles: todas las preguntas (anuladas y de reserva incluidas).
  const counts = useMemo(() => {
    const base = { comun: 0, especifica: 0 };
    if (!exam) return base;
    for (const q of exam.questions) {
      base[q.part]++;
    }
    return base;
  }, [exam]);

  const scopeCount =
    scope === "ambas" ? counts.comun + counts.especifica : counts[scope];

  return (
    <div className="app">
      <div className="topbar">
        <button className="back" onClick={onBack} aria-label="Volver">←</button>
        <div>
          <span className="eyebrow">Configurar test</span>
          <h1 className="display" style={{ fontSize: 22, marginTop: 2 }}>
            {exam?.title ?? "…"}
          </h1>
        </div>
      </div>

      <div className="section">
        <span className="label">Ámbito</span>
        <div className="segment">
          {(["comun", "especifica", "ambas"] as Scope[]).map((s) => (
            <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)}>
              {s === "comun" ? "Común" : s === "especifica" ? "Específica" : "Ambas"}
              <span className="count">
                {s === "ambas"
                  ? counts.comun + counts.especifica
                  : counts[s]} preg.
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <span className="label">Modo</span>
        <div className="mode-grid">
          <button className="mode-card" aria-pressed={mode === "practica"} onClick={() => setMode("practica")}>
            <h3>Práctica</h3>
            <p>Corrige al instante y ve la respuesta correcta en cada pregunta.</p>
          </button>
          <button className="mode-card" aria-pressed={mode === "examen"} onClick={() => setMode("examen")}>
            <h3>Examen</h3>
            <p>Simulacro: responde todo y ve la nota y los fallos al final.</p>
          </button>
        </div>
      </div>

      <div className="section">
        <span className="label">Temporizador</span>
        <div className="timer-row">
          {TIMER_OPTIONS.map((t) => (
            <button key={String(t)} aria-pressed={timerMinutes === t} onClick={() => setTimerMinutes(t)}>
              {t === null ? "Sin límite" : `${t} min`}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <span className="label">Opciones</span>
        <div className="options-list">
          <Toggle label="Barajar preguntas" on={shuffleQuestions} set={setShuffleQuestions} />
          <Toggle label="Barajar opciones" hint="Cambia el orden de A, B, C, D" on={shuffleOptions} set={setShuffleOptions} />
        </div>
      </div>

      <button
        className="btn-primary"
        disabled={!exam || scopeCount === 0}
        onClick={() =>
          onStart({
            examId, scope, mode, shuffleQuestions, shuffleOptions,
            timerMinutes,
          })
        }
      >
        Empezar · {scopeCount} preguntas
      </button>
    </div>
  );
}

function Toggle({
  label, hint, on, set,
}: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <button className="switch" aria-pressed={on} aria-label={label} onClick={() => set(!on)} />
    </div>
  );
}
