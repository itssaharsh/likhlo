"use client";

import { useEffect, useRef, useState } from "react";
import type { Match, MedRow, RxLine } from "@/lib/run-types";
import { taka, type Lang } from "./format";

interface Props {
  match: Match | null;
  line: RxLine | null;
  lang: Lang;
  onClose: () => void;
}

/** One medicine in full: what the doctor wrote, what it is, and every brand of the same medicine by price. */
export default function MedSheet({ match, line, lang, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [fetched, setFetched] = useState<{ id: number; brands: MedRow[] } | null>(null);
  const med = match?.med ?? null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (med && !d.open) d.showModal();
    if (!med && d.open) d.close();
  }, [med]);

  useEffect(() => {
    if (!med) return;
    let alive = true;
    fetch(`/api/equivalents?id=${med.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && j && setFetched({ id: med.id, brands: j.brands as MedRow[] }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [med]);
  const all = fetched && med && fetched.id === med.id ? fetched.brands : null;

  const list = all ?? [...(match?.cheaper ?? []), ...(med ? [med] : [])].sort((a, b) => (a.unitPrice ?? 1e9) - (b.unitPrice ?? 1e9));

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="sheet-title" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {med && match && (
        <>
          <div className="sheet-head">
            <h3 id="sheet-title">
              {med.brand} {med.strength}
            </h3>
            <p>
              {med.generic} · {med.form} · {med.company}
            </p>
            <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="sheet-body">
            {line && (
              <>
                <h4>On the prescription</h4>
                <div lang="bn">{line.raw}</div>
              </>
            )}
            {(match.forEn || match.forBn) && (
              <>
                <h4>What it is for</h4>
                <div lang={lang}>{lang === "bn" ? match.forBn : match.forEn}</div>
              </>
            )}
            {match.course?.prescribed != null && (
              <>
                <h4>For this prescription</h4>
                <div className="num">
                  {match.course.basis}: {taka(match.course.prescribed, true)} as written
                  {match.course.cheapest != null && match.course.cheapest < match.course.prescribed
                    ? `, ${taka(match.course.cheapest, true)} at the lowest price`
                    : ""}
                </div>
              </>
            )}
            <h4>
              {match.equivalents ?? list.length} brands make this same medicine ({med.generic} {med.strength}, {med.form.toLowerCase()})
            </h4>
            <ul className="alts">
              {list.slice(0, 40).map((b) => (
                <li key={b.id} className={b.id === med.id ? "rx" : ""}>
                  <span>
                    {b.brand} {b.id === med.id && <small>· on the prescription</small>}
                    <br />
                    <small>{b.company}</small>
                  </span>
                  <span className="p num">
                    {taka(b.unitPrice, true)}
                    <small>per {b.unitLabel}</small>
                  </span>
                </li>
              ))}
            </ul>
            <p className="realnote">
              Prices from the public MedEx-derived list of Bangladeshi medicines. Ask your doctor or pharmacist before switching brands.
            </p>
          </div>
        </>
      )}
    </dialog>
  );
}
