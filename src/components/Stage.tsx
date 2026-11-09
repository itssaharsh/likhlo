"use client";

import type { RunState } from "@/lib/run-types";

interface Props {
  image: string;
  size: [number, number];
  run: RunState;
  focusLine: number | null;
  onFocusLine: (n: number | null) => void;
  onOpenLine: (n: number) => void;
  caption: React.ReactNode;
  dragging: boolean;
}

/** The prescription as a lit paper object. The agent's reading is drawn on it:
 *  a highlight per line it read, a pin per line, and arcs joining lines that clash. */
export default function Stage({ image, size, run, focusLine, onFocusLine, onOpenLine, caption, dragging }: Props) {
  const [w, h] = size;
  const dupLines = new Set(run.clashes.filter((c) => c.kind === "duplicate").flatMap((c) => c.lines));
  const intLines = new Set(run.clashes.filter((c) => c.kind === "interaction").flatMap((c) => c.lines));
  const clashCls = (n: number) => (dupLines.has(n) ? "warn" : intLines.has(n) ? "int" : "");
  const reading = run.status === "reading";
  const boxOf = (n: number) => run.lines.find((l) => l.n === n)?.box ?? null;

  return (
    <section className="stage" aria-label="The prescription, marked up by Likhlo">
      <div className={`photo${reading ? " dim" : ""}`} style={{ ["--ar" as string]: `${w} / ${h}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={run.patient ? `Prescription for ${run.patient}` : "The prescription photo"} draggable={false} />
        <div className="overlay">
          {reading && <div className="scan" />}

          {run.lines.map((l, i) => {
            if (!l.box) return null;
            const [y0, x0, y1, x1] = l.box;
            const m = run.matches[l.n];
            const cls = !m ? "pending" : clashCls(l.n);
            return (
              <div
                key={`hl-${l.n}`}
                className={`hl ${cls}${focusLine === l.n ? " focus" : ""}`}
                style={{
                  top: `${y0 / 10}%`,
                  left: `${x0 / 10}%`,
                  width: `${(x1 - x0) / 10}%`,
                  height: `${(y1 - y0) / 10}%`,
                  animationDelay: `${i * 110}ms`,
                }}
                onMouseEnter={() => onFocusLine(l.n)}
                onMouseLeave={() => onFocusLine(null)}
                onClick={() => m?.med && onOpenLine(l.n)}
              />
            );
          })}

          <svg className="arcs" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
            {run.clashes.map((c, i) => {
              const a = boxOf(c.lines[0]);
              const b = boxOf(c.lines[1]);
              if (!a || !b) return null;
              const ya = (a[0] + a[2]) / 2;
              const yb = (b[0] + b[2]) / 2;
              const x = Math.min(a[1], b[1]) - 46 - i * 30;
              const bulge = Math.max(70, Math.abs(yb - ya) * 0.32) + i * 22;
              const d = `M ${x + 30} ${ya} C ${x - bulge} ${ya}, ${x - bulge} ${yb}, ${x + 30} ${yb}`;
              return <path key={i} d={d} className={c.kind === "duplicate" ? "dup" : "int"} style={{ animationDelay: `${i * 250}ms` }} />;
            })}
          </svg>

          {run.clashes.map((c, i) => {
            const a = boxOf(c.lines[0]);
            const b = boxOf(c.lines[1]);
            if (!a || !b) return null;
            const ymid = ((a[0] + a[2]) / 2 + (b[0] + b[2]) / 2) / 2;
            const x = Math.min(a[1], b[1]) - 46 - i * 30;
            const bulge = Math.max(70, Math.abs((b[0] + b[2]) / 2 - (a[0] + a[2]) / 2) * 0.32) + i * 22;
            const label = c.kind === "duplicate" ? `Both ${c.ingredient}` : "Leaflet warning";
            return (
              <div
                key={`tag-${i}`}
                className={`tag ${c.kind === "duplicate" ? "dup" : "int"}`}
                style={{ top: `${ymid / 10}%`, left: `${(x - bulge * 0.72) / 10}%` }}
              >
                {label}
              </div>
            );
          })}

          {run.lines.map((l, i) => {
            if (!l.box) return null;
            const m = run.matches[l.n];
            const cls = !m ? "" : clashCls(l.n) || "done";
            return (
              <button
                key={`pin-${l.n}`}
                type="button"
                className={`pin ${cls}`}
                style={{ top: `${(l.box[0] + l.box[2]) / 20}%`, left: `${l.box[1] / 10 - 2.6}%`, animationDelay: `${i * 110 + 80}ms` }}
                aria-label={m?.med ? `Line ${l.n}: ${m.med.brand}` : `Line ${l.n}`}
                onMouseEnter={() => onFocusLine(l.n)}
                onMouseLeave={() => onFocusLine(null)}
                onFocus={() => onFocusLine(l.n)}
                onBlur={() => onFocusLine(null)}
                onClick={() => m?.med && onOpenLine(l.n)}
              >
                {l.n}
              </button>
            );
          })}
        </div>
      </div>
      {caption && <div className="stage-caption" role="status">{caption}</div>}
      {dragging && <div className="drop">Drop the prescription photo here</div>}
    </section>
  );
}
