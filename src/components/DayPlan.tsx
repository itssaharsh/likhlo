"use client";

import type { RunState } from "@/lib/run-types";
import { bnDigits, daysText, PILL, SLOT_NAMES, timingText, type Lang } from "./format";

/** The take-away: each medicine placed in the part of the day it is taken. */
export default function DayPlan({ run, lang }: { run: RunState; lang: Lang }) {
  const slots = ["morning", "noon", "night"] as const;
  const named = (n: number) => {
    const m = run.matches[n];
    const l = run.lines.find((x) => x.n === n)!;
    return m?.med ? `${m.med.brand} ${m.med.strength.length < 18 ? m.med.strength : ""}`.trim() : `${l.name} ${l.strength}`.trim();
  };
  const prn = run.lines.filter((l) => l.asNeeded);
  return (
    <>
      <div className="plan">
        {slots.map((k) => {
          const here = run.lines.filter((l) => !l.asNeeded && l.slots[k] > 0);
          return (
            <div key={k} className={`slot ${k[0] === "m" ? "m" : k === "noon" ? "n" : "r"}`}>
              <h3 lang="bn">
                {SLOT_NAMES[k].bn}
                <small>{SLOT_NAMES[k].en}</small>
              </h3>
              {here.length === 0 && <div className="none">{lang === "bn" ? "এই সময়ে কিছু নেই" : "Nothing at this time"}</div>}
              {here.map((l) => (
                <div className="pill" key={l.n}>
                  <i style={{ background: PILL[(l.n - 1) % PILL.length] }} />
                  <div>
                    <b>
                      {named(l.n)}
                      {l.slots[k] > 1 ? ` ×${l.slots[k]}` : ""}
                    </b>
                    <em lang={lang}>
                      {[timingText(l.timing, lang), daysText(l, lang)].filter(Boolean).join(" · ") ||
                        (lang === "bn" ? `লাইন ${bnDigits(l.n)}` : `line ${l.n}`)}
                    </em>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {prn.length > 0 && (
        <div className="prn">
          <span className="prn-k" lang="bn">দরকার হলে<small>When needed</small></span>
          {prn.map((l) => (
            <span className="pill" key={l.n} style={{ margin: 0 }}>
              <i style={{ background: PILL[(l.n - 1) % PILL.length] }} />
              <span>
                <b>{named(l.n)}</b>
                <em lang="bn">{l.doseText}</em>
              </span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
