import { useState } from "react";
import type { SessionConfig } from "./types";
import { Home } from "./components/Home";
import { Setup } from "./components/Setup";
import { Runner } from "./components/Runner";

// Navegacion por estado (sin router: app de pocas pantallas).
type View =
  | { name: "home" }
  | { name: "setup"; examId: string }
  | { name: "run"; config: SessionConfig };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });

  switch (view.name) {
    case "home":
      return <Home onPick={(examId) => setView({ name: "setup", examId })} />;
    case "setup":
      return (
        <Setup
          examId={view.examId}
          onBack={() => setView({ name: "home" })}
          onStart={(config) => setView({ name: "run", config })}
        />
      );
    case "run":
      return (
        <Runner
          config={view.config}
          onExit={() => setView({ name: "home" })}
          onRestart={() => setView({ name: "setup", examId: view.config.examId })}
        />
      );
  }
}
