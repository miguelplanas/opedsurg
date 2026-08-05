import { useEffect, useMemo, useState } from "react";
import { partLabel, type Exam, type Mode, type Scope, type SessionConfig } from "../types";
import { loadExam } from "../lib/dataset";
import { selectQuestions } from "../lib/session";

interface Props {
  examId: string;
  onBack: () => void;
  onStart: (config: SessionConfig) => void;
}

const TIMER_PRESETS = [15, 30, 60, 90];
// Un preset solo tiene sentido si da un ritmo razonable: entre 15 s y 3 min
// por pregunta. Fuera de ese rango se oculta.
const MIN_SECS_PER_Q = 15;
const MAX_SECS_PER_Q = 180;

export function Setup({ examId, onBack, onStart }: Props) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [scope, setScope] = useState<Scope>("ambas");
  const [mode, setMode] = useState<Mode>("practica");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState<number | null>(null);
  const [customTimer, setCustomTimer] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(45);

  useEffect(() => {
    loadExam(examId).then(setExam);
  }, [examId]);

  // Conteos disponibles segun el modo (en examen real salen las anuladas y
  // solo entran las reservas que las sustituyen).
  const counts = useMemo(() => {
    const base = { comun: 0, especifica: 0 };
    if (!exam) return base;
    for (const q of selectQuestions(exam, mode)) {
      base[q.part]++;
    }
    return base;
  }, [exam, mode]);

  // Ámbitos con preguntas; "ambas" solo tiene sentido si hay dos partes.
  const scopes = useMemo(() => {
    const s: Scope[] = [];
    if (counts.comun > 0) s.push("comun");
    if (counts.especifica > 0) s.push("especifica");
    return s.length === 2 ? [...s, "ambas" as Scope] : s;
  }, [counts]);

  // Si el ámbito elegido deja de existir (examen de una sola parte), se salta
  // al único disponible.
  useEffect(() => {
    if (exam && scopes.length > 0 && !scopes.includes(scope)) {
      setScope(scopes[scopes.length - 1]);
    }
  }, [exam, scopes, scope]);

  const scopeCount =
    scope === "ambas" ? counts.comun + counts.especifica : counts[scope];

  const timerPresets = useMemo(() => {
    if (!scopeCount) return TIMER_PRESETS;
    return TIMER_PRESETS.filter((t) => {
      const secsPerQ = (t * 60) / scopeCount;
      return secsPerQ >= MIN_SECS_PER_Q && secsPerQ <= MAX_SECS_PER_Q;
    });
  }, [scopeCount]);

  // Si al cambiar la selección el preset elegido deja de ofrecerse, se vuelve
  // a "Sin límite".
  useEffect(() => {
    if (!customTimer && timerMinutes !== null && !timerPresets.includes(timerMinutes)) {
      setTimerMinutes(null);
    }
  }, [timerPresets, customTimer, timerMinutes]);

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
          {scopes.map((s) => (
            <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)}>
              {s === "ambas" ? "Ambas" : partLabel(exam, s)}
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
          <button className="mode-card" aria-pressed={mode === "examen-real"} onClick={() => setMode("examen-real")}>
            <h3>Examen real</h3>
            <p>Como el día oficial: sin anuladas y solo con las reservas que las sustituyeron.</p>
          </button>
        </div>
      </div>

      <div className="section">
        <span className="label">Temporizador</span>
        <div className="timer-row">
          <button
            aria-pressed={!customTimer && timerMinutes === null}
            onClick={() => { setCustomTimer(false); setTimerMinutes(null); }}
          >
            Sin límite
          </button>
          {timerPresets.map((t) => (
            <button
              key={t}
              aria-pressed={!customTimer && timerMinutes === t}
              onClick={() => { setCustomTimer(false); setTimerMinutes(t); }}
            >
              {t} min
            </button>
          ))}
          <button
            aria-pressed={customTimer}
            onClick={() => { setCustomTimer(true); setTimerMinutes(customMinutes); }}
          >
            Personalizado
          </button>
        </div>
        {customTimer && (
          <div className="custom-timer">
            <input
              type="number"
              min={1}
              max={300}
              value={customMinutes}
              onChange={(e) => {
                const v = Math.max(1, Math.min(300, Number(e.target.value) || 1));
                setCustomMinutes(v);
                setTimerMinutes(v);
              }}
            />
            <span>minutos</span>
          </div>
        )}
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
            source: "examen", examId, scope, mode,
            shuffleQuestions, shuffleOptions, timerMinutes, limit: null,
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
