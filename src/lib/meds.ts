// Deterministic data layer over the MedEx-derived Bangladesh medicine dataset.
// Every fact returned here comes from data/medicines.json or data/generics.json (built by scripts/build-data.mjs).
import medicinesJson from "../../data/medicines.json";
import genericsJson from "../../data/generics.json";
import { normalize, ingredientNames, genericKey } from "./names.mjs";

export { normalize };

export interface Pack {
  label: string;
  price: number;
}
export interface Medicine {
  id: number;
  brand: string;
  form: string;
  generic: string;
  strength: string;
  company: string;
  /** Taka per tablet/capsule/vial/bottle (see unitLabel); null when the dataset has no price. */
  unitPrice: number | null;
  unitLabel: string;
  packs: Pack[];
  herbal: boolean;
}
export interface GenericInfo {
  name: string;
  drugClass: string;
  indication: string;
  uses: string;
  dosage: string;
  /** Full monograph text, one line per list item. */
  interactions: string;
  sideEffects: string;
  contraindications: string;
  pregnancy: string;
  monograph: string;
}

const MEDS = medicinesJson as unknown as Medicine[];
const GENERICS = genericsJson as unknown as Record<string, GenericInfo>;

// ---------------------------------------------------------------- generics

export function genericInfo(genericName: string): GenericInfo | null {
  return GENERICS[genericKey(genericName)] ?? null;
}

/** Salt-free ingredient name -> monograph of the single-ingredient generic. */
const SINGLE_BY_INGREDIENT = new Map<string, GenericInfo>();
for (const g of Object.values(GENERICS)) {
  if (g.name.includes("+")) continue;
  const ing = ingredientNames(g.name)[0];
  if (ing && !SINGLE_BY_INGREDIENT.has(ing)) SINGLE_BY_INGREDIENT.set(ing, g);
}

/** Monographs that describe this medicine: its own generic plus each ingredient's single-ingredient generic. */
function monographsOf(med: Medicine): GenericInfo[] {
  const out = new Map<string, GenericInfo>();
  const own = genericInfo(med.generic);
  if (own) out.set(own.name, own);
  for (const ing of ingredientsOf(med)) {
    const g = SINGLE_BY_INGREDIENT.get(ing);
    if (g) out.set(g.name, g);
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- ingredients

export function ingredientsOf(med: Pick<Medicine, "generic">): string[] {
  return ingredientNames(med.generic);
}

export interface DuplicateGroup {
  ingredient: string;
  meds: Medicine[];
}
export function findDuplicates(meds: Medicine[]): DuplicateGroup[] {
  const byIng = new Map<string, Medicine[]>();
  for (const m of meds) {
    for (const ing of new Set(ingredientsOf(m))) {
      const list = byIng.get(ing) ?? [];
      if (!list.some((x) => x.id === m.id)) list.push(m);
      byIng.set(ing, list);
    }
  }
  return [...byIng].filter(([, l]) => l.length >= 2).map(([ingredient, list]) => ({ ingredient, meds: list }));
}

export interface Interaction {
  a: Medicine;
  b: Medicine;
  /** The ingredient or drug-class name found in the monograph text. */
  matched: string;
  /** Exact text from the monograph (a sentence or list item, <=320 chars). */
  snippet: string;
  source: string;
}

const SNIPPET_MAX = 320;

/** Split monograph text into list items / sentences. */
function sentences(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
    .map((s) => s.trim())
    .filter(Boolean);
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Sentence from `text` containing `term` (whole word, case-insensitive), or null. */
function snippetFor(text: string, term: string): string | null {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}`, "iu");
  for (const s of sentences(text)) {
    const m = re.exec(s);
    if (!m) continue;
    if (s.length <= SNIPPET_MAX) return s;
    // Long sentence: keep a window around the mention (still verbatim text).
    const at = m.index + m[1].length;
    const start = Math.max(0, at - 140);
    const end = Math.min(s.length, start + SNIPPET_MAX);
    return (start > 0 ? "..." : "") + s.slice(start, end) + (end < s.length ? "..." : "");
  }
  return null;
}

/** Terms from `other` to look for in `of`'s monograph: ingredient names and drug-class names. */
function searchTerms(other: Medicine, of: Medicine): string[] {
  const own = new Set(ingredientsOf(of));
  const terms = ingredientsOf(other).filter((i) => !own.has(i) && i.length >= 4);
  for (const g of monographsOf(other)) {
    const cls = g.drugClass.trim();
    if (cls.length >= 6 && !terms.includes(cls.toLowerCase())) terms.push(cls.toLowerCase());
  }
  return terms;
}

function directional(x: Medicine, y: Medicine): Interaction[] {
  const out: Interaction[] = [];
  const seen = new Set<string>();
  for (const g of monographsOf(x)) {
    if (!g.interactions) continue;
    for (const term of searchTerms(y, x)) {
      const snippet = snippetFor(g.interactions, term);
      if (!snippet || seen.has(snippet)) continue;
      seen.add(snippet);
      out.push({ a: x, b: y, matched: term, snippet, source: `${g.name} monograph` });
    }
  }
  return out;
}

export function findInteractions(meds: Medicine[]): Interaction[] {
  const out: Interaction[] = [];
  for (let i = 0; i < meds.length; i++) {
    for (let j = i + 1; j < meds.length; j++) {
      out.push(...directional(meds[i], meds[j]), ...directional(meds[j], meds[i]));
    }
  }
  return out;
}

// ---------------------------------------------------------------- strength / form

/** "500 mg + 65 mg" -> "500mg+65mg" */
function normStrength(s: string): string {
  return normalize(s).replace(/ /g, "");
}
/** All numbers in a strength string: "500 mg+65 mg" -> ["500","65"]. */
const numbers = (s: string): string[] =>
  s
    .replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)))
    .replace(/(\d),(\d)/g, "$1$2")
    .match(/\d+(?:\.\d+)?/g) ?? [];

const FORM_WORDS: Record<string, string> = {
  tab: "tablet", tabs: "tablet", tablet: "tablet", tablets: "tablet", "ট্যাব": "tablet", "ট্যাবলেট": "tablet", "টেবলেট": "tablet",
  cap: "capsule", caps: "capsule", capsule: "capsule", capsules: "capsule", "ক্যাপ": "capsule", "ক্যাপসুল": "capsule",
  syp: "syrup", syr: "syrup", syrup: "syrup", "সিরাপ": "syrup",
  susp: "suspension", suspension: "suspension",
  inj: "injection", injection: "injection", "ইনজেকশন": "injection",
  drop: "drops", drops: "drops", "ড্রপ": "drops",
  cr: "cream", cream: "cream", "ক্রিম": "cream",
  oint: "ointment", ointment: "ointment",
  supp: "suppository", suppository: "suppository",
};

/** Prescription abbreviation -> dataset form family ("Tab." -> "tablet"), or null. */
export function parseForm(text: string): string | null {
  const word = text.trim().toLowerCase().replace(/[.,]+$/g, "");
  return FORM_WORDS[word] ?? null;
}

function formMatches(medForm: string, family: string): boolean {
  const f = medForm.toLowerCase();
  if (family === "cream" || family === "ointment") return f.includes("cream") || f.includes("ointment");
  return f.includes(family);
}

// ---------------------------------------------------------------- brand search

export interface SearchOptions {
  strength?: string;
  form?: string;
  limit?: number;
}
export interface SearchHit {
  med: Medicine;
  score: number;
  reasons: string[];
}

interface BrandEntry {
  compact: string;
  tokens: string[];
  meds: Medicine[];
}
const BRANDS: BrandEntry[] = (() => {
  const map = new Map<string, BrandEntry>();
  for (const m of MEDS) {
    const n = normalize(m.brand);
    let e = map.get(n);
    if (!e) map.set(n, (e = { compact: n.replace(/ /g, ""), tokens: n.split(" "), meds: [] }));
    e.meds.push(m);
  }
  return [...map.values()];
})();

const MEDS_STRENGTH_NUMS = new Map<number, string[]>();
const strengthNums = (m: Medicine) => {
  let n = MEDS_STRENGTH_NUMS.get(m.id);
  if (!n) MEDS_STRENGTH_NUMS.set(m.id, (n = numbers(m.strength)));
  return n;
};

/** Optimal-string-alignment Damerau-Levenshtein distance, bailing out above `max`. */
function dlDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

interface ParsedQuery {
  brand: string;
  nums: string[];
  form: string | null;
}
/** Split "Tab. Seclo 20mg" / "Napa Extnd 665" / "Fexo l20" into brand words, numbers and form family. */
function parseQuery(query: string): ParsedQuery {
  let form: string | null = null;
  const nums: string[] = [];
  const words: string[] = [];
  for (const raw of query.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).split(/[\s,]+/)) {
    if (!raw) continue;
    const f = parseForm(raw);
    if (f) {
      form ??= f;
      continue;
    }
    // OCR confusions inside numbers: "2O" -> 20, "l20" -> 120
    let tok = raw;
    if (/\d/.test(tok) && /^[oOlI\d.+\-]+(mg|ml|mcg|gm|g)?$/i.test(tok)) tok = tok.replace(/[oO]/g, "0").replace(/[lI]/g, "1");
    for (const part of tok.replace(/(\d)([^\d.\s])/g, "$1 $2").replace(/([^\d.\s])(\d)/g, "$1 $2").split(/[\s+\-/]+/)) {
      if (!part) continue;
      if (/^\d+(\.\d+)?$/.test(part)) nums.push(part);
      else if (/^(mg|ml|mcg|gm|g|iu)$/i.test(part)) continue;
      else words.push(part.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
    }
  }
  return { brand: words.filter(Boolean).join(" "), nums, form };
}

function brandScore(q: string, qc: string, qTokens: string[], e: BrandEntry): { score: number; reason: string } | null {
  if (e.compact === qc) return { score: 1, reason: "exact brand" };
  if (qc.length >= 3 && e.compact.startsWith(qc)) return { score: 0.6 + 0.25 * (qc.length / e.compact.length), reason: "brand prefix" };
  const maxDist = qc.length <= 3 ? 0 : qc.length <= 5 ? 1 : 2;
  if (maxDist > 0) {
    const d = dlDistance(qc, e.compact, maxDist);
    if (d <= maxDist) return { score: 0.75 * (1 - d / Math.max(qc.length, e.compact.length)), reason: `fuzzy brand (edit distance ${d})` };
  }
  if (qTokens.length > 1 && e.tokens.every((t) => qTokens.includes(t))) return { score: 0.5, reason: "brand words in query" };
  if (q.length >= 3 && e.tokens.length > 1 && qTokens.every((t) => e.tokens.includes(t))) return { score: 0.5, reason: "query words in brand" };
  return null;
}

export function searchBrands(query: string, opts: SearchOptions = {}): SearchHit[] {
  const p = parseQuery(query);
  const optNums = opts.strength ? numbers(opts.strength) : [];
  const nums = p.nums.length ? p.nums : optNums;
  const family = parseForm(opts.form ?? "") ?? (opts.form ? opts.form.toLowerCase() : null) ?? p.form;
  const form = p.form ?? family;
  const q = p.brand;
  const qc = q.replace(/ /g, "");
  if (!qc) return [];
  const qTokens = q.split(" ");

  const hits: SearchHit[] = [];
  for (const e of BRANDS) {
    const b = brandScore(q, qc, qTokens, e);
    if (!b) continue;
    for (const med of e.meds) {
      let score = b.score * 0.7;
      const reasons = [b.reason];
      if (nums.length) {
        const mn = strengthNums(med);
        if (nums.every((n, i) => Number(mn[i]) === Number(n))) {
          score += nums.length >= mn.length ? 0.2 : 0.15;
          reasons.push("strength matches");
        } else if (nums.every((n) => mn.some((x) => Number(x) === Number(n)))) {
          score += 0.08;
          reasons.push("strength partly matches");
        }
      }
      if (form && formMatches(med.form, form)) {
        score += 0.1;
        reasons.push("form matches");
      }
      hits.push({ med, score: Math.min(1, Math.round(score * 1000) / 1000), reasons });
    }
  }
  hits.sort((x, y) => y.score - x.score || (y.med.unitPrice !== null ? 1 : 0) - (x.med.unitPrice !== null ? 1 : 0) || x.med.id - y.med.id);
  return hits.slice(0, opts.limit ?? 5);
}

// ---------------------------------------------------------------- equivalents / price

const equivKey = (m: Medicine) => `${genericKey(m.generic)}|${normStrength(m.strength)}|${m.form}`;
const EQUIV = new Map<string, Medicine[]>();
for (const m of MEDS) {
  const k = equivKey(m);
  const l = EQUIV.get(k);
  if (l) l.push(m);
  else EQUIV.set(k, [m]);
}

/** Same generic, same strength, exact same dosage form (and same unit, e.g. same bottle size). Includes `med` itself. */
export function findEquivalents(med: Medicine): Medicine[] {
  return (EQUIV.get(equivKey(med)) ?? []).filter((m) => m.unitLabel === med.unitLabel);
}

export function findCheaper(med: Medicine, limit = 5): Medicine[] {
  if (med.unitPrice === null) return [];
  const brand = normalize(med.brand);
  const price = med.unitPrice;
  return findEquivalents(med)
    .filter((m) => m.unitPrice !== null && m.unitPrice < price && m.id !== med.id && normalize(m.brand) !== brand)
    .sort((a, b) => (a.unitPrice as number) - (b.unitPrice as number) || a.brand.localeCompare(b.brand))
    .slice(0, limit);
}

export function courseCost(med: Medicine, perDay: number, days: number): number | null {
  if (med.unitPrice === null) return null;
  return Math.round(med.unitPrice * perDay * days * 100) / 100;
}

// ---------------------------------------------------------------- dose

export interface Dose {
  morning: number;
  noon: number;
  /** Only for 4-slot schedules. */
  evening: number;
  night: number;
  perDay: number;
  slots: number[];
}

function parseAmount(tok: string): number | null {
  const t = tok
    .trim()
    .replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)))
    .replace(/৷|।/g, "");
  if (!t) return null;
  const parts = t.match(/^(\d+)?\s*(½|¼|¾)?$/);
  if (parts && (parts[1] || parts[2])) {
    const frac = parts[2] === "½" ? 0.5 : parts[2] === "¼" ? 0.25 : parts[2] === "¾" ? 0.75 : 0;
    return Number(parts[1] ?? 0) + frac;
  }
  const f = t.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (f && Number(f[3]) > 0) return Number(f[1] ?? 0) + Number(f[2]) / Number(f[3]);
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  return null;
}

/** Bangladeshi dose notation "1+0+1", "১-০-১", "½+0+½", "1+1+1+1" -> per-slot amounts. */
export function parseDose(s: string): Dose | null {
  const toks = s.trim().split(/\s*[+\-–—−]\s*/);
  if (toks.length < 2 || toks.length > 4) return null;
  const slots = toks.map(parseAmount);
  if (slots.some((x) => x === null)) return null;
  const v = slots as number[];
  const perDay = v.reduce((a, b) => a + b, 0);
  if (v.length === 4) return { morning: v[0], noon: v[1], evening: v[2], night: v[3], perDay, slots: v };
  if (v.length === 3) return { morning: v[0], noon: v[1], evening: 0, night: v[2], perDay, slots: v };
  return { morning: v[0], noon: 0, evening: 0, night: v[1], perDay, slots: v };
}
