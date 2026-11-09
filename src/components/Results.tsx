"use client";

import type { RunState } from "@/lib/run-types";
import { bnDigits, daysText, SLOT_NAMES, taka, timingText, type Lang } from "./format";

interface Props {
  run: RunState;
  lang: Lang;
  setLang: (l: Lang) => void;
  focusLine: number | null;
  onFocusLine: (n: number | null) => void;
  onOpenLine: (n: number) => void;
  onListen?: () => void;
  listening?: boolean;
}

const WarnIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </svg>
);
const LeafletIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3h9l3 3v15H6z" />
    <path d="M9 10h6M9 14h6M9 18h4" />
  </svg>
);

export default function Results({ run, lang, setLang, focusLine, onFocusLine, onOpenLine, onListen, listening }: Props) {
  const working = run.status === "reading" || run.status === "working";
  const dupLines = new Set(run.clashes.filter((c) => c.kind === "duplicate").flatMap((c) => c.lines));
  const intLines = new Set(run.clashes.filter((c) => c.kind === "interaction").flatMap((c) => c.lines));
  const steps = run.steps.length;
  const expected = Math.max(run.lines.length * 3 + 3, 8);

  return (
    <>
      <div className="card">
        <div className="who">
          <div>
            <b>{run.patient || (working ? "Reading…" : "Your prescription")}</b>
            {run.doctor && <span> · {run.doctor}</span>}
          </div>
          <div className="lang" role="group" aria-label="Language">
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
            <button type="button" aria-pressed={lang === "bn"} onClick={() => setLang("bn")} lang="bn">বাংলা</button>
          </div>
        </div>

        {working && (
          <div className="progress" role="status" aria-live="polite">
            <span>{run.steps.at(-1)?.title ?? "Reading the photo…"}</span>
            <span className="bar" aria-hidden="true"><i style={{ width: `${Math.min(96, 8 + (steps / expected) * 88)}%` }} /></span>
          </div>
        )}

        {run.status === "error" && (
          <div className="err" role="alert">
            <b>{run.error?.code === "unreadable" ? "Couldn't read this photo" : "This reading didn't finish"}</b>
            <p>{run.error?.message}</p>
          </div>
        )}

        <ul className="rows">
          {run.lines.map((l, i) => {
            const m = run.matches[l.n];
            const med = m?.med;
            const course = m?.course;
            const best = m?.cheaper?.[0];
            const forText = lang === "bn" ? m?.forBn : m?.forEn;
            const slotsOn = l.slots;
            return (
              <li key={l.n}>
                <button
                  type="button"
                  className={`row${dupLines.has(l.n) ? " warn" : intLines.has(l.n) ? " int" : ""}${focusLine === l.n ? " focus" : ""}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                  onMouseEnter={() => onFocusLine(l.n)}
                  onMouseLeave={() => onFocusLine(null)}
                  onFocus={() => onFocusLine(l.n)}
                  onBlur={() => onFocusLine(null)}
                  onClick={() => med && onOpenLine(l.n)}
                  aria-label={med ? `${med.brand} ${med.strength}: open details` : `Line ${l.n}: ${l.raw}`}
                >
                  <span className="n">{l.n}</span>
                  <span>
                    {med ? (
                      <span className="name">
                        {med.brand} {med.strength.length < 18 ? med.strength : ""}{" "}
                        <small>· {med.generic}</small>
                      </span>
                    ) : m ? (
                      <span className="name">{l.name} <small>· not found in the list</small></span>
                    ) : (
                      <span className="name" style={{ color: "var(--muted)" }}>{l.form} {l.name} {l.strength}</span>
                    )}
                    {forText && <span className="for" style={{ display: "block" }} lang={lang}>{forText}</span>}
                    {!m && <span className="skeleton" style={{ display: "block", width: "60%", marginTop: 8 }} />}
                    <span className="slots" lang={lang}>
                      {l.asNeeded ? (
                        <span className="on">{lang === "bn" ? "দরকার হলে" : "when needed"}</span>
                      ) : (
                        (["morning", "noon", "night"] as const).map((k) => (
                          <span key={k} className={slotsOn[k] > 0 ? "on" : ""} lang="bn">
                            {SLOT_NAMES[k].bn}
                            {slotsOn[k] > 1 ? ` ×${bnDigits(slotsOn[k])}` : ""}
                          </span>
                        ))
                      )}
                      {(timingText(l.timing, lang) || daysText(l, lang)) && (
                        <span className="meta">
                          {[timingText(l.timing, lang), daysText(l, lang)].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="price num">
                    {course?.prescribed != null && course.cheapest != null && best ? (
                      <>
                        <span>
                          <span className="was">{taka(course.prescribed)}</span>
                          <span className="now">{taka(course.cheapest)}</span>
                        </span>
                        <span className="alt" style={{ display: "block" }}>{best.brand}</span>
                      </>
                    ) : course?.prescribed != null ? (
                      <>
                        <span className="now">{taka(course.prescribed)}</span>
                        <span className="same" style={{ display: "block" }}>lowest price already</span>
                      </>
                    ) : med && m?.course ? (
                      <span className="same">{taka(med.unitPrice, true)} each</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {run.clashes.length > 0 && (
          <div className="clashes" aria-live="polite">
            {run.clashes.map((c, i) => (
              <div key={i} className={`clash${c.kind === "interaction" ? " int" : ""}`} style={{ animationDelay: `${i * 120}ms` }}>
                {c.kind === "duplicate" ? <WarnIcon /> : <LeafletIcon />}
                <div>
                  <b lang={lang}>{lang === "bn" ? c.bn : c.en}</b>
                  {c.quote && <q>{c.quote}</q>}
                  <small>
                    {c.kind === "duplicate"
                      ? lang === "bn"
                        ? "দুটো একসাথে খেলে মাত্রা বেশি হতে পারে। ডাক্তারকে দেখান।"
                        : "Taking both can double the dose. Show this to your doctor."
                      : lang === "bn"
                        ? `সূত্র: ${c.source}। ডাক্তার বা ফার্মাসিস্টকে দেখান।`
                        : `From the ${c.source}. Show this to your doctor or pharmacist.`}
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}

        {run.summary && (
          <div className="summary" lang={lang}>
            {lang === "bn" ? run.summary.bn : run.summary.en}
            {onListen && (
              <div className="summary-actions">
                <button type="button" className="btn btn-quiet btn-sm" onClick={onListen} aria-pressed={listening}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    {listening ? <path d="M8 5v14M16 5v14" /> : <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>}
                  </svg>
                  {listening ? "Pause" : "Listen in Bangla"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </>
  );
}

/** The one result: the same medicines at the lowest price, and the clashes found. */
export function Verdict({ run, lang, landed }: { run: RunState; lang: Lang; landed: boolean }) {
  const working = run.status === "reading" || run.status === "working";
  const totals = run.totals;
  const saved = totals ? totals.prescribed - totals.cheapest : 0;
  const pct = totals && totals.prescribed > 0 ? Math.round((saved / totals.prescribed) * 100) : 0;
  const dups = run.clashes.filter((c) => c.kind === "duplicate").length;
  const ints = run.clashes.length - dups;
  return (
    <>
      {totals && totals.priced > 0 ? (
        <div className={`verdict${landed ? " landed" : ""}`} role="status">
          <div>
            <div className="big num">
              {lang === "bn" ? bnDigits(taka(totals.cheapest)) : taka(totals.cheapest)}
              <span className="was">
                {lang === "bn" ? <><s>{bnDigits(taka(totals.prescribed))}</s>-এর বদলে</> : <>instead of <s>{taka(totals.prescribed)}</s></>}
              </span>
            </div>
            <div className="sub">
              {lang === "bn"
                ? "একই ওষুধ, সবচেয়ে কম দামে · লেখা দিনগুলোর হিসাবে, চলমান ওষুধ ৩০ দিন"
                : "Same medicines at the lowest price · for the days written, ongoing ones for 30 days"}
            </div>
          </div>
          <div className="flags">
            {saved > 0 && (
              <span className="save num">
                {lang === "bn" ? `${taka(saved)} কম · ${bnDigits(pct)}%` : `${taka(saved)} less · ${pct}%`}
              </span>
            )}
            {dups > 0 && <span className="flag dup">{lang === "bn" ? `${bnDigits(dups)}টি দ্বিগুণ ডোজ` : `${dups} double dose`}</span>}
            {ints > 0 && <span className="flag int">{lang === "bn" ? `${bnDigits(ints)}টি লিফলেট সতর্কতা` : `${ints} leaflet warning${ints > 1 ? "s" : ""}`}</span>}
          </div>
        </div>
      ) : (
        <div className="verdict empty" aria-hidden={!working}>
          <div>
            <div className="sub" style={{ opacity: 1 }}>
              {working ? "The price check lands here when every line is matched." : "Prices appear after a reading."}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
