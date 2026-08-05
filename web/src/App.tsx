import { useState } from "react";
import type { SessionConfig, SourceKind } from "./types";
import { Home } from "./components/Home";
import { ExamList } from "./components/ExamList";
import { Setup } from "./components/Setup";
import { Runner } from "./components/Runner";
import { Stats } from "./components/Stats";

// Navegacion por estado (sin router: app de pocas pantallas).
type View =
  | { name: "home" }
  | { name: "exams" }
  | { name: "stats" }
  | { name: "setup"; examId: string }
  | { name: "run"; config: SessionConfig };

// Tamaños por defecto de los modos que no pasan por la pantalla de configurar.
const QUICK_LIMIT = 10;
const RANDOM_LIMIT = 30;

/** Sesion de un modo directo: practica (correccion al instante) y sin tiempo. */
function quickConfig(source: SourceKind, limit: number | null): SessionConfig {
  return {
    source,
    examId: null,
    scope: "ambas",
    mode: "practica",
    shuffleQuestions: true,
    shuffleOptions: false,
    timerMinutes: null,
    limit,
  };
}

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const home = () => setView({ name: "home" });
  const start = (cfg: SessionConfig) => setView({ name: "run", config: cfg });

  switch (view.name) {
    case "home":
      return (
        <Home
          onExams={() => setView({ name: "exams" })}
          onStats={() => setView({ name: "stats" })}
          onRepaso={() => start(quickConfig("repaso", null))}
          onRapido={() => start(quickConfig("rapido", QUICK_LIMIT))}
          onAleatorio={() => start(quickConfig("aleatorio", RANDOM_LIMIT))}
        />
      );
    case "exams":
      return <ExamList onBack={home} onPick={(examId) => setView({ name: "setup", examId })} />;
    case "stats":
      return <Stats onBack={home} />;
    case "setup":
      return (
        <Setup
          examId={view.examId}
          onBack={() => setView({ name: "exams" })}
          onStart={start}
        />
      );
    case "run":
      return (
        <Runner
          config={view.config}
          onExit={home}
          onRestart={() =>
            view.config.source === "examen" && view.config.examId
              ? setView({ name: "setup", examId: view.config.examId })
              : start(view.config)
          }
        />
      );
  }
}
