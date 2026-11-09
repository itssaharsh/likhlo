"use client";

import type { RunState } from "@/lib/run-types";
import { stepIsWarn, TOOL_LABEL } from "./format";

/** What the agent did, one row per tool result, in order. Hovering a row lights its lines on the photo. */
export default function StepLog({ run, onFocusLine }: { run: RunState; onFocusLine: (n: number | null) => void }) {
  if (!run.steps.length) return <p className="intro">The agent&apos;s steps appear here as it works.</p>;
  return (
    <ol className="log" role="log" aria-label="The agent's steps">
      {run.steps.map((s) => (
        <li key={s.id} onMouseEnter={() => onFocusLine(s.lines[0] ?? null)} onMouseLeave={() => onFocusLine(null)}>
          <span className={`chip${stepIsWarn(s) ? " warn" : ""}`}>{TOOL_LABEL[s.tool] ?? s.tool}</span>
          <span>
            <span className="t">{s.title}</span>
            <span className="d" style={{ display: "block" }}>{s.detail}</span>
          </span>
          <span className="ms num">{s.ms > 0 ? `${s.ms} ms` : ""}</span>
        </li>
      ))}
    </ol>
  );
}
