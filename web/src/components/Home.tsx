import { useEffect, useState } from "react";
import { currentTheme, toggleTheme, type Theme } from "../lib/theme";
import { overview, type Overview } from "../lib/progress";

interface Props {
  onExams: () => void;
  onRepaso: () => void;
  onAleatorio: () => void;
  onRapido: () => void;
  onStats: () => void;
}

const SunIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7" />
  </svg>
);

const MoonIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20.5 14.1A8.6 8.6 0 0 1 9.9 3.5a8.6 8.6 0 1 0 10.6 10.6Z" />
  </svg>
);

export function Home({ onExams, onRepaso, onAleatorio, onRapido, onStats }: Props) {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const [ov, setOv] = useState<Overview | null>(null);

  // Se lee al montar (y al volver de una sesion, porque App remonta la vista).
  useEffect(() => { setOv(overview()); }, []);

  const due = ov?.due ?? 0;

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
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
        <h1 className="display">Cirugía pediátrica</h1>
        <p>
          {due > 0
            ? <>Tienes <span className="hl">{due} preguntas</span> pendientes de repaso.</>
            : ov?.tracked
              ? "Nada pendiente hoy. Buen momento para un simulacro."
              : "Elige cómo quieres empezar."}
        </p>
      </header>

      {ov && ov.tracked > 0 && (
        <button className="streak-strip" onClick={onStats}>
          <span><b>{Math.round(ov.accuracy * 100)}%</b> acierto</span>
          <span><b>{ov.tracked}</b> vistas</span>
          <span><b>{ov.mastered}</b> dominadas</span>
          {ov.streak > 0 && <span><b>{ov.streak}</b> día{ov.streak === 1 ? "" : "s"}</span>}
          <span className="more" aria-hidden>›</span>
        </button>
      )}

      <div className="mode-list">
        <button className="big-mode primary" onClick={onRepaso} disabled={due === 0}>
          <div className="big-mode-top">
            <h2>Repaso</h2>
            {due > 0 && <span className="pill">{due}</span>}
          </div>
          <p>
            {due > 0
              ? "Las preguntas que toca repasar hoy, empezando por las que peor llevas."
              : "Sin repasos pendientes. Se llena solo con lo que vayas fallando."}
          </p>
        </button>

        <button className="big-mode" onClick={onRapido}>
          <div className="big-mode-top"><h2>Rápido</h2><span className="pill ghost">10</span></div>
          <p>Tanda corta: lo pendiente, lo flojo y algo que no hayas visto nunca.</p>
        </button>

        <button className="big-mode" onClick={onExams}>
          <div className="big-mode-top"><h2>Examen</h2></div>
          <p>Simulacro completo de una convocatoria concreta, con temporizador.</p>
        </button>

        <button className="big-mode" onClick={onAleatorio}>
          <div className="big-mode-top"><h2>Aleatorio</h2><span className="pill ghost">30</span></div>
          <p>Mezcla de todas las convocatorias, sin orden ni criterio.</p>
        </button>
      </div>

      {ov && ov.tracked === 0 && (
        <p className="center-note" style={{ paddingTop: 8 }}>
          El repaso se llena solo: las preguntas que falles volverán a aparecer.
        </p>
      )}
    </div>
  );
}
