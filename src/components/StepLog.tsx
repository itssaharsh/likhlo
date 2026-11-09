"use client";

import type { RunState, Step } from "@/lib/run-types";

type Phase = { key: string; steps: Step[] };

const PHASE_OF: Record<string, string> = {
  record_lines: "read",
  search_medicine: "search",
  choose_medicine: "match",
  find_cheaper: "match",
  check_clashes: "clashes",
  read_leaflet: "leaflet",
  finish: "write",
};

function phases(steps: Step[]): Phase[] {
  const out: Phase[] = [];
  for (const s of steps) {
    const key = PHASE_OF[s.tool] ?? s.tool;
    const last = out.at(-1);
    if (last && last.key === key) last.steps.push(s);
    else out.push({ key, steps: [s] });
  }
  return out;
}

function headline(p: Phase, run: RunState): { title: string; sub: string } {
  const n = p.steps.length;
  switch (p.key) {
    case "read":
      return { title: `Read ${run.lines.length} medicine lines off the photo`, sub: "Gemini vision: names, strengths, 1+0+1 doses, food timing, days" };
    case "search":
      return { title: `Searched ${n} name${n > 1 ? "s" : ""} in 21,714 Bangladeshi brands`, sub: "fuzzy search, so a slip of the pen still matches" };
    case "match": {
      const chosen = p.steps.filter((s) => s.tool === "choose_medicine").length;
      return { title: `Chose the medicine for ${chosen} line${chosen > 1 ? "s" : ""} and compared prices`, sub: "same generic, same strength, same form" };
    }
    case "clashes":
      return { title: p.steps[0].title, sub: "shared ingredients, and warnings in each medicine's leaflet" };
    case "leaflet":
      return { title: `Read ${n} leaflet section${n > 1 ? "s" : ""}`, sub: "because the prescription called for it" };
    case "write":
      return { title: "Wrote the explanations and the family summary", sub: "in English and Bangla, from the leaflet text" };
    default:
      return { title: p.steps[0].title, sub: "" };
  }
}

/** What the agent did, grouped into its phases. Hovering a row lights its line on the photo. */
export default function StepLog({ run, onFocusLine }: { run: RunState; onFocusLine: (n: number | null) => void }) {
  if (!run.steps.length) return <p className="intro">The agent&apos;s steps appear here as it works.</p>;
  return (
    <ol className="phases" role="log" aria-label="The agent's steps">
      {phases(run.steps).map((p, i) => {
        const h = headline(p, run);
        const warn = p.key === "clashes" && !p.steps[0].detail.startsWith("No shared");
        const ms = p.steps.reduce((a, s) => a + s.ms, 0);
        const items = p.key === "match" ? p.steps : p.steps.length > 1 || p.key !== "write" ? p.steps : [];
        return (
          <li key={i} className={`phase${warn ? " warn" : ""}`}>
            <div className="phase-head">
              <span className="k">{i + 1}</span>
              <span>
                <b style={{ display: "block" }}>{h.title}</b>
                <span>{h.sub}</span>
              </span>
              <span className="num" style={{ color: "var(--faint)", fontSize: 13 }}>{ms > 0 ? `${ms} ms` : ""}</span>
            </div>
            {items.length > 0 && (
              <ul className="phase-items">
                {items.map((s) => (
                  <li key={s.id} onMouseEnter={() => onFocusLine(s.lines[0] ?? null)} onMouseLeave={() => onFocusLine(null)}>
                    <span>
                      {p.key === "read" ? s.detail : p.key === "clashes" || p.key === "leaflet" ? s.detail : `${s.title} · ${s.detail}`}
                    </span>
                    <span className="ms num">{s.ms > 0 ? `${s.ms} ms` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
