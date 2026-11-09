"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PricedBrand, SearchResult } from "@/lib/search";
import { unitPriceText } from "@/lib/slip";
import { bnDigits, type Lang } from "./format";

type Equivalent = PricedBrand & { id: number };
type Found =
  | { status: "idle" }
  | { status: "loading"; q: string }
  | { status: "done"; q: string; results: SearchResult[] }
  | { status: "error"; q: string };

const EXAMPLES = ["Napa Extend", "Seclo 20", "Monas 10"];
const DEBOUNCE_MS = 200;

const price = (b: PricedBrand, lang: Lang) =>
  b.unitPrice === null ? (lang === "bn" ? "দাম নেই" : "no price listed") : unitPriceText({ unitPrice: b.unitPrice, unitLabel: b.unitLabel }, lang);
const count = (n: number, lang: Lang) => (lang === "bn" ? bnDigits(n) : n.toLocaleString("en-US"));

const SEARCH_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

/** "Search any medicine": type a brand, see its price and the same medicine for less. No AI call. */
export default function MedicineSearch({ lang }: { lang: Lang }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found>({ status: "idle" });
  const [open, setOpen] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      latest.current?.abort();
    },
    [],
  );

  const search = (raw: string) => {
    if (timer.current) clearTimeout(timer.current);
    latest.current?.abort();
    const query = raw.trim();
    if (query.length < 2) {
      setFound({ status: "idle" });
      return;
    }
    const ctl = new AbortController();
    latest.current = ctl;
    setFound({ status: "loading", q: query });
    setOpen(null);
    fetch(`/api/search?q=${encodeURIComponent(query.slice(0, 60))}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { results: SearchResult[] }) => setFound({ status: "done", q: query, results: j.results }))
      .catch(() => {
        if (!ctl.signal.aborted) setFound({ status: "error", q: query });
      });
  };

  const type = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      latest.current?.abort();
      setFound({ status: "idle" });
      return;
    }
    timer.current = setTimeout(() => search(v), DEBOUNCE_MS);
  };

  const clear = () => {
    type("");
    setOpen(null);
    input.current?.focus();
  };

  const tryExample = (v: string) => {
    setQ(v);
    search(v);
  };

  return (
    <div className="msearch">
      <form
        className="msearch-field"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
      >
        {SEARCH_ICON}
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => type(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              clear();
            }
          }}
          placeholder="Type a brand, e.g. Napa Extend or Seclo 20"
          aria-label="Medicine brand"
          aria-describedby={hintId}
          maxLength={60}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {q && (
          <button type="button" className="msearch-clear" onClick={clear} aria-label="Clear search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-sm">{lang === "bn" ? "খুঁজুন" : "Search"}</button>
      </form>

      <div id={hintId} className="msearch-status" aria-live="polite">
        {found.status === "idle" && (
          <p className="msearch-hint">
            {lang === "bn"
              ? `${bnDigits("21,714")}টি বাংলাদেশি ব্র্যান্ডে নাম দিয়ে খোঁজে, ছবি ছাড়া, AI ছাড়া। দেখুন `
              : "Searches 21,714 Bangladeshi brands by name, with no photo and no AI. Try "}
            {EXAMPLES.map((x, i) => (
              <span key={x}>
                <button type="button" className="chip msearch-eg" onClick={() => tryExample(x)}>
                  {x}
                </button>
                {i < EXAMPLES.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        )}
        {found.status === "done" && !found.results.length && (
          <p className="msearch-empty">
            {lang === "bn"
              ? `“${found.q}” নামে কোনো ব্র্যান্ড নেই। বানান দেখুন বা জেনেরিক নাম লিখুন।`
              : `No brand called “${found.q}”. Check the spelling or try the generic name.`}
          </p>
        )}
        {found.status === "error" && (
          <p className="msearch-error">
            {lang === "bn" ? "খোঁজা এখন ব্যস্ত। আবার চেষ্টা করুন।" : "Search is busy. Try again."}{" "}
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => search(q)}>
              {lang === "bn" ? "আবার" : "Try again"}
            </button>
          </p>
        )}
        {found.status === "done" && found.results.length > 0 && (
          <span className="sr-only">
            {lang === "bn" ? `“${found.q}”: ${bnDigits(found.results.length)}টি ব্র্যান্ড` : `${found.results.length} brands found for ${found.q}`}
          </span>
        )}
      </div>

      {found.status === "loading" && (
        <ul className="rows card msearch-results" aria-busy="true" aria-label="Searching">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <div className="row msearch-row" aria-hidden="true">
                <div style={{ display: "grid", gap: 8 }}>
                  <i className="skeleton" style={{ width: `${46 - i * 6}%`, height: 14 }} />
                  <i className="skeleton" style={{ width: `${64 - i * 8}%` }} />
                  <i className="skeleton" style={{ width: "38%" }} />
                </div>
                <i className="skeleton" style={{ width: 72 }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {found.status === "done" && found.results.length > 0 && (
        <ul className="rows card msearch-results">
          {found.results.map((r) => (
            <ResultRow key={r.id} r={r} lang={lang} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultRow({ r, lang, open, onToggle }: { r: SearchResult; lang: Lang; open: boolean; onToggle: () => void }) {
  const best = r.cheapest[0];
  const panelId = `msearch-alts-${r.id}`;
  return (
    <li>
      <button type="button" className={`row msearch-row${open ? " focus" : ""}`} aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <div>
          <div className="name">
            {r.brand} {r.strength} <small>· {r.form}</small>
          </div>
          <div className="for">
            {r.generic} · {r.company}
          </div>
          <div className="msearch-chips">
            <span className="chip msearch-count">
              {lang === "bn"
                ? `${count(r.equivalents, lang)}টি ব্র্যান্ড এই একই ওষুধ বানায়`
                : `${count(r.equivalents, lang)} ${r.equivalents === 1 ? "brand makes" : "brands make"} this same medicine`}
            </span>
            {best && (
              <span className="chip msearch-best">
                {best.brand} · {price(best, lang)}
              </span>
            )}
          </div>
        </div>
        <div className="price">
          <div className="now">{price(r, lang)}</div>
          <svg className="msearch-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </div>
      </button>
      {open && <Equivalents id={panelId} r={r} lang={lang} />}
    </li>
  );
}

function Equivalents({ id, r, lang }: { id: string; r: SearchResult; lang: Lang }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "done"; brands: Equivalent[] } | { status: "error" }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/equivalents?id=${r.id}`, { signal: ctl.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((j: { brands: Equivalent[] }) => setState({ status: "done", brands: j.brands }))
      .catch(() => !ctl.signal.aborted && setState({ status: "error" }));
    return () => ctl.abort();
  }, [r.id, attempt]);

  return (
    <div id={id} className="msearch-alts" role="region" aria-label={`Every brand of ${r.generic} ${r.strength}, ${r.form}`}>
      <h4>
        {lang === "bn"
          ? `একই ওষুধের সব ব্র্যান্ড (${r.generic} ${r.strength}, ${r.form.toLowerCase()}), কম দাম আগে`
          : `Every brand of the same medicine (${r.generic} ${r.strength}, ${r.form.toLowerCase()}), lowest price first`}
      </h4>
      {state.status === "loading" && (
        <ul className="alts" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="row" style={{ cursor: "default", animation: "none" }}>
              <i className="skeleton" style={{ width: `${40 + i * 10}%` }} />
              <i className="skeleton" style={{ width: 60 }} />
            </li>
          ))}
        </ul>
      )}
      {state.status === "error" && (
        <p className="msearch-error">
          {lang === "bn" ? "খোঁজা এখন ব্যস্ত। আবার চেষ্টা করুন।" : "Search is busy. Try again."}{" "}
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => {
              setState({ status: "loading" });
              setAttempt((a) => a + 1);
            }}
          >
            {lang === "bn" ? "আবার" : "Try again"}
          </button>
        </p>
      )}
      {state.status === "done" && (
        <ul className="alts">
          {state.brands.map((b) => (
            <li key={b.id} className={b.id === r.id ? "rx" : ""}>
              <span>
                {b.brand} {b.id === r.id && <small>· {lang === "bn" ? "যেটি খুঁজেছেন" : "the one you searched"}</small>}
                <br />
                <small>{b.company}</small>
              </span>
              <span className="p num">{price(b, lang)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="realnote">
        {lang === "bn"
          ? "একই জেনেরিক, শক্তি ও ধরন। ব্র্যান্ড বদলানোর আগে ফার্মাসিস্টকে জিজ্ঞেস করুন।"
          : "Same generic, strength and form. Ask your pharmacist before switching brands."}
      </p>
    </div>
  );
}
