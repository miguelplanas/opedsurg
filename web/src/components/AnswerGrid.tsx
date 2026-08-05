import type { Letter } from "../types";
import { sqKey, type SessionQuestion } from "../lib/session";

interface Props {
  session: SessionQuestion[];
  responses: Record<string, Letter>;
  current?: number;
  reveal?: boolean; // true en resultados: colorea acierto/fallo
  onJump?: (index: number) => void;
}

// La rejilla replica la planilla oficial (C1, E101…) y sirve de progreso,
// navegación y, al final, de mapa de aciertos/fallos.
export function AnswerGrid({ session, responses, current, reveal, onJump }: Props) {
  return (
    <div className="answer-grid">
      {session.map((sq, i) => {
        const q = sq.question;
        const given = responses[sqKey(sq)];
        let cls = "cell";
        if (q.status === "nula") {
          cls += " nula";
          if (!reveal && i === current) cls += " current";
        } else if (reveal) {
          if (given === undefined) cls += " blank";
          else if (given === q.answer) cls += " correct";
          else cls += " wrong";
        } else {
          if (given !== undefined) cls += " answered";
          if (i === current) cls += " current";
        }
        const Tag = onJump ? "button" : "div";
        return (
          <Tag
            key={sqKey(sq)}
            className={cls}
            {...(onJump ? { onClick: () => onJump(i) } : {})}
          >
            <b>{q.id}</b>
            {reveal && given !== undefined && <span>{given}</span>}
          </Tag>
        );
      })}
    </div>
  );
}
