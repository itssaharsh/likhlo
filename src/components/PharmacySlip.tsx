"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { createPortal } from "react-dom";
import { toBlob } from "html-to-image";
import type { RunState } from "@/lib/run-types";
import { doseMark, slipDate, slipFileName, slipFromRun, totalText, unitPriceText, whenText, type SlipData } from "@/lib/slip";
import { bnDigits, SLOT_NAMES, type Lang } from "./format";

const STANDARD_BASIS = "for the days written; medicines to continue are counted for 30 days";

const T = {
  en: {
    patient: "Patient",
    doctor: "Doctor",
    read: "Read on",
    medicine: "Medicine as written",
    when: "When to take",
    lowest: "Same medicine, lowest price",
    whenNeeded: "when needed",
    amount: "each time",
    notFound: "not found in the list",
    already: "Already the lowest price",
    total: "Same medicines at the lowest price",
    double: "Possible double dose",
    leaflet: "Leaflet warning",
    lines: "Lines",
    from: (s: string) => `From the ${s}`,
    foot: "Same generic, strength and form. Ask your pharmacist before switching brands. Prices from a public list of Bangladeshi medicines.",
  },
  bn: {
    patient: "রোগী",
    doctor: "ডাক্তার",
    read: "পড়ার তারিখ",
    medicine: "লেখা ওষুধ",
    when: "কখন খাবেন",
    lowest: "একই ওষুধ, সবচেয়ে কম দামে",
    whenNeeded: "দরকার হলে",
    amount: "প্রতিবার",
    notFound: "তালিকায় পাওয়া যায়নি",
    already: "এটিই সবচেয়ে কম দাম",
    total: "একই ওষুধ, সবচেয়ে কম দামে",
    double: "সম্ভাব্য দ্বিগুণ ডোজ",
    leaflet: "লিফলেট সতর্কতা",
    lines: "লাইন",
    from: (s: string) => `সূত্র: ${s}`,
    foot: "একই জেনেরিক, শক্তি ও ধরন। ব্র্যান্ড বদলানোর আগে ফার্মাসিস্টকে জিজ্ঞেস করুন। দাম বাংলাদেশি ওষুধের একটি পাবলিক তালিকা থেকে।",
  },
} as const;

const SLOTS = ["morning", "noon", "night"] as const;
const MAX_TYPE = 23;
const MIN_TYPE = 14;

export const SlipIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </svg>
);

const Logo = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="2" y="2" width="44" height="44" rx="12" fill="oklch(46% 0.1 172)" />
    <path d="M24 12v24M12 24h24" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
    <path d="M31 33l7 7" stroke="oklch(85% 0.12 80)" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

/** The 1080 x 1350 "For the pharmacy" card. Everything on it comes from the slip (and so from the run). */
export default function PharmacySlip({
  slip,
  lang,
  ref,
  typeSize,
  onFit,
}: {
  slip: SlipData;
  lang: Lang;
  ref?: Ref<HTMLElement>;
  /** Use this type size instead of measuring (for a copy that is not laid out, like the print one). */
  typeSize?: number;
  onFit?: (size: number) => void;
}) {
  const t = T[lang];
  const d = (x: number) => (lang === "bn" ? bnDigits(x) : String(x));
  const own = useRef<HTMLElement>(null);
  const setRefs = (el: HTMLElement | null) => {
    own.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  // Every row and warning has to fit on the one card: shrink the type until it does.
  useLayoutEffect(() => {
    const el = own.current;
    if (!el) return;
    if (typeSize) {
      el.style.fontSize = `${typeSize}px`;
      return;
    }
    const fit = () => {
      let size = MAX_TYPE;
      el.style.fontSize = `${size}px`;
      while (el.scrollHeight > el.clientHeight + 1 && size > MIN_TYPE) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
      onFit?.(size);
    };
    fit();
    let alive = true;
    document.fonts.ready.then(() => alive && fit());
    return () => {
      alive = false;
    };
  }, [slip, lang, typeSize, onFit]);
  const date = slipDate(slip.readAt, lang);
  const basis = slip.totals && (lang === "en" ? slip.totals.basis : slip.totals.basis === STANDARD_BASIS ? "লেখা দিনের হিসাবে; চলমান ওষুধ ৩০ দিনের" : "");

  return (
    <article ref={setRefs} className="slip" lang={lang}>
      <header className="slip-head">
        <div className="slip-brand">
          <Logo />
          <b>Likhlo</b>
          <span lang="bn">লিখলো</span>
        </div>
        <div className="slip-for">
          For the pharmacy · <span lang="bn">ফার্মেসির জন্য</span>
        </div>
      </header>

      {(slip.patient || slip.doctor || date) && (
        <dl className="slip-who">
          {slip.patient && (
            <div>
              <dt>{t.patient}</dt>
              <dd>{slip.patient}</dd>
            </div>
          )}
          {slip.doctor && (
            <div>
              <dt>{t.doctor}</dt>
              <dd>{slip.doctor}</dd>
            </div>
          )}
          {date && (
            <div>
              <dt>{t.read}</dt>
              <dd>{date}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="slip-cols" aria-hidden="true">
        <span />
        <span>{t.medicine}</span>
        <span>{t.when}</span>
        <span>{t.lowest}</span>
      </div>
      <ol className="slip-rows">
        {slip.rows.map((r) => (
          <li key={r.n}>
            <span className="slip-n">{d(r.n)}</span>
            <div className="slip-med">
              <b>{r.name}</b>
              <span>{r.generic ?? t.notFound}</span>
            </div>
            <div className="slip-dose">
              {r.asNeeded ? (
                <span className="slip-prn">{t.whenNeeded}</span>
              ) : (
                <span className="slip-marks">
                  {SLOTS.map((k) => (
                    <span key={k} className={r.slots[k] > 0 ? "on" : ""}>
                      <i>{doseMark(r.slots[k], lang) || "–"}</i>
                      <small lang="bn">{SLOT_NAMES[k].bn}</small>
                    </span>
                  ))}
                </span>
              )}
              {r.amount && (
                <small className="slip-amount">
                  {lang === "bn" ? `${t.amount} ` : ""}
                  <b lang="bn">{r.amount}</b>
                  {lang === "en" ? ` ${t.amount}` : ""}
                </small>
              )}
              {whenText(r, lang) && <small className="slip-when">{whenText(r, lang)}</small>}
            </div>
            <div className="slip-alt">
              {r.cheaper ? (
                <>
                  <b>{r.cheaper.brand}</b>
                  <span>{r.cheaper.company}</span>
                  <em>{unitPriceText(r.cheaper, lang)}</em>
                </>
              ) : r.own ? (
                <>
                  <b>{t.already}</b>
                  <span>{r.own.company}</span>
                  <em>{unitPriceText(r.own, lang)}</em>
                </>
              ) : (
                <span>–</span>
              )}
            </div>
          </li>
        ))}
      </ol>

      {slip.totals && (
        <div className="slip-total">
          <span>{t.total}</span>
          <b>{totalText(slip.totals, lang)}</b>
          {basis && <small>{basis}</small>}
        </div>
      )}

      {slip.warnings.length > 0 && (
        <ul className="slip-warn">
          {slip.warnings.map((w, i) => (
            <li key={i} className={w.kind === "interaction" ? "int" : ""}>
              <span className="slip-warn-k">
                {w.kind === "duplicate" ? t.double : t.leaflet} · {t.lines} {d(w.lines[0])} + {d(w.lines[1])}
              </span>
              <b>{lang === "bn" ? w.bn : w.en}</b>
              {w.quote && <q lang="en">{w.quote}</q>}
              {w.source && <small>{t.from(w.source)}</small>}
            </li>
          ))}
        </ul>
      )}

      <footer className="slip-foot">
        <span>{t.foot}</span>
        <b lang="en">likhlo-bd.vercel.app</b>
      </footer>
    </article>
  );
}

const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const isCoarse = () => window.matchMedia("(pointer: coarse)").matches;

const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

async function renderPng(node: HTMLElement) {
  await document.fonts.ready;
  const opts = { pixelRatio: 1, width: 1080, height: 1350, cacheBust: false };
  // Safari can miss web fonts on the first pass; the second one has them.
  if (isSafari()) await toBlob(node, opts);
  return toBlob(node, opts);
}

interface SheetProps {
  open: boolean;
  run: RunState;
  readAt?: string;
  lang: Lang;
  setLang: (l: Lang) => void;
  onClose: () => void;
}

/** The slip in a dialog: preview, then share (phones) or download the PNG, or print just the slip. */
export function SlipSheet({ open, run, readAt, lang, setLang, onClose }: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(0.4);
  const [png, setPng] = useState<{ slip: SlipData; lang: Lang; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeSize, setTypeSize] = useState<number | undefined>(undefined);
  const slip = useMemo(() => slipFromRun(run, readAt), [run, readAt]);
  const phone = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const ready = png && png.slip === slip && png.lang === lang ? png.blob : null;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const el = frame.current;
    if (!open || !el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1080));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Make the PNG as soon as the slip is shown, so sharing happens straight from the tap.
  useEffect(() => {
    if (!open || !card.current) return;
    let alive = true;
    const node = card.current;
    const t = window.setTimeout(() => {
      renderPng(node)
        .then((blob) => alive && blob && setPng({ slip, lang, blob }))
        .catch(() => {});
    }, 60);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [open, slip, lang]);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const blob = ready ?? (card.current ? await renderPng(card.current) : null);
      if (!blob) throw new Error("no image");
      const name = slipFileName(slip.patient);
      const file = new File([blob], name, { type: "image/png" });
      if (isCoarse() && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Likhlo · For the pharmacy" });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      setError("Couldn't make the image. Try Print instead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <dialog
        ref={dialog}
        className="sheet slip-sheet"
        aria-labelledby="slip-title"
        onClose={onClose}
        onClick={(e) => e.target === dialog.current && onClose()}
      >
        {open && (
          <>
            <div className="sheet-head">
              <h3 id="slip-title">
                For the pharmacy <small lang="bn">ফার্মেসির জন্য</small>
              </h3>
              <p>Show it at the counter, or send it on WhatsApp.</p>
              <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <div className="slip-sheet-body">
              <div className="slip-frame" ref={frame} style={{ height: 1350 * scale }}>
                <div className="slip-scale" style={{ transform: `scale(${scale})` }}>
                  <PharmacySlip ref={card} slip={slip} lang={lang} onFit={setTypeSize} />
                </div>
              </div>
            </div>
            <div className="slip-actions">
              <div className="lang" role="group" aria-label="Language of the slip">
                <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
                <button type="button" aria-pressed={lang === "bn"} onClick={() => setLang("bn")} lang="bn">বাংলা</button>
              </div>
              <span className="slip-actions-go">
                <button type="button" className="btn btn-quiet" onClick={() => window.print()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" /></svg>
                  Print
                </button>
                <button type="button" className="btn btn-primary" onClick={save} disabled={busy} aria-busy={busy}>
                  {phone ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v8h14v-8" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
                  )}
                  {phone ? "Share image" : "Save image"}
                </button>
              </span>
              {error && <p className="slip-error" role="alert">{error}</p>}
            </div>
          </>
        )}
      </dialog>
      {open &&
        createPortal(
          <div className="slip-print" aria-hidden="true">
            <PharmacySlip slip={slip} lang={lang} typeSize={typeSize ?? MIN_TYPE} />
          </div>,
          document.body,
        )}
    </>
  );
}
