// The "For the pharmacy" slip: everything on it is taken from the RunState, nothing is added.
import { bnDigits, timingText, daysText, type Lang } from "../components/format";
import type { Clash, RunState, Slots, Timing } from "./run-types";

export interface SlipAlt {
  brand: string;
  company: string;
  unitPrice: number;
  unitLabel: string;
}

export interface SlipRow {
  n: number;
  /** Brand and strength of the line, as written (the matched brand when the line was matched). */
  name: string;
  generic: string | null;
  found: boolean;
  slots: Slots;
  asNeeded: boolean;
  timing: Timing;
  days: number | null;
  continuing: boolean;
  /** The lowest-price brand of the same generic, strength and form (match.cheaper[0]). */
  cheaper: SlipAlt | null;
  /** The written brand's own price, when nothing is cheaper. */
  own: SlipAlt | null;
}

export interface SlipData {
  patient?: string;
  doctor?: string;
  readAt?: string;
  rows: SlipRow[];
  /** Rounded to the taka. */
  totals: { prescribed: number; cheapest: number; basis: string } | null;
  warnings: Clash[];
}

export function slipFromRun(run: RunState, readAt?: string): SlipData {
  const rows = run.lines.map((l): SlipRow => {
    const m = run.matches[l.n];
    const med = m?.med ?? null;
    const best = m?.cheaper?.[0];
    const cheaper = best && best.unitPrice != null
      ? { brand: best.brand, company: best.company, unitPrice: best.unitPrice, unitLabel: best.unitLabel }
      : null;
    const own = !cheaper && med && med.unitPrice != null
      ? { brand: med.brand, company: med.company, unitPrice: med.unitPrice, unitLabel: med.unitLabel }
      : null;
    return {
      n: l.n,
      name: med ? `${med.brand} ${med.strength}`.trim() : [l.form, l.name].filter(Boolean).join(" ").trim(),
      generic: med?.generic ?? null,
      found: !!med,
      slots: l.slots,
      asNeeded: l.asNeeded,
      timing: l.timing,
      days: l.days,
      continuing: l.continuing,
      cheaper,
      own,
    };
  });
  const t = run.totals;
  return {
    patient: run.patient || undefined,
    doctor: run.doctor || undefined,
    readAt,
    rows,
    totals: t && t.priced > 0 ? { prescribed: Math.round(t.prescribed), cheapest: Math.round(t.cheapest), basis: t.basis } : null,
    warnings: run.clashes,
  };
}

const digits = (s: string | number, lang: Lang) => (lang === "bn" ? bnDigits(s) : String(s));

/** "৳3", "৳1.50", "৳1,675"; Bangla digits in Bangla. */
export function money(x: number, lang: Lang) {
  const s = Number.isInteger(x)
    ? x.toLocaleString("en-US")
    : x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "৳" + digits(s, lang);
}

const isEach = (unitLabel: string) => /tablet|capsule|sachet|vial|suppositor/i.test(unitLabel);

/** "৳3 each", "৳20.63 per 60 ml bottle". */
export function unitPriceText(a: Pick<SlipAlt, "unitPrice" | "unitLabel">, lang: Lang) {
  const p = money(a.unitPrice, lang);
  if (isEach(a.unitLabel)) return lang === "bn" ? `প্রতিটি ${p}` : `${p} each`;
  const unit = a.unitLabel || "pack";
  return lang === "bn" ? `প্রতি ${unit} ${p}` : `${p} per ${unit}`;
}

/** "৳409 instead of ৳612". */
export function totalText(t: { prescribed: number; cheapest: number }, lang: Lang) {
  return lang === "bn"
    ? `${money(t.prescribed, lang)}-এর বদলে ${money(t.cheapest, lang)}`
    : `${money(t.cheapest, lang)} instead of ${money(t.prescribed, lang)}`;
}

/** Dose mark for one part of the day: "1", "১", or "" when none. */
export const doseMark = (n: number, lang: Lang) => (n > 0 ? digits(n, lang) : "");

export const whenText = (r: SlipRow, lang: Lang) =>
  [timingText(r.timing, lang), daysText(r, lang)].filter(Boolean).join(" · ");

export function slipDate(iso: string | undefined, lang: Lang) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
}

/** likhlo-rahima-khatun.png */
export function slipFileName(patient?: string) {
  const name = (patient ?? "").split(/[,(]/)[0].toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return `likhlo-${name || "prescription"}.png`;
}
