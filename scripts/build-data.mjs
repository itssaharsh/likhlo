// Usage: node scripts/build-data.mjs <dataDir>
// Reads medicine.csv + generic.csv (MedEx-derived Medicine Dataset of Bangladesh) and writes
// data/medicines.json and data/generics.json. The app only reads the JSON.
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { genericKey, ingredientNames } from "../src/lib/names.mjs";

const dataDir = process.argv[2];
if (!dataDir) throw new Error("usage: node scripts/build-data.mjs <dataDir>");
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
mkdirSync(outDir, { recursive: true });

const readCsv = (f) =>
  parse(readFileSync(join(dataDir, f), "utf8"), { columns: true, skip_empty_lines: true, relax_quotes: true, bom: true });

// ---------- text helpers ----------
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', deg: "°", plusmn: "±", micro: "µ", mu: "µ", times: "×", ge: "≥", le: "≤", hellip: "..." };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML -> plain text, one line per list item / paragraph. */
function htmlToLines(html) {
  if (!html) return [];
  let s = html
    .replace(/<div class="min-str[^"]*"[\s\S]*?(?=<div class="full-str")/g, "") // "Read more" duplicate
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<span class="min-str-toggle[\s\S]*?<\/span>/g, "")
    .replace(/<\/?(li|p|div|br|ul|ol|tr|h\d)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decode(s)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
/** Full text keeping one line per list item (used for interactions). */
const linesText = (html) => htmlToLines(html).join("\n");
/** Single-line prose. */
const proseText = (html) =>
  htmlToLines(html)
    .map((l) => (/[.!?:;\-]$/.test(l) ? l : l + "."))
    .join(" ");
/** Trim to ~max chars at a sentence boundary. */
function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  let end = -1;
  for (const m of cut.matchAll(/[.!?](?=\s|$)/g)) end = m.index + 1;
  if (end > max * 0.4) return cut.slice(0, end);
  return cut.slice(0, cut.lastIndexOf(" ")).trimEnd() + "...";
}

// ---------- prices ----------
const num = (s) => Number(s.replace(/,/g, ""));
function formUnit(form) {
  const f = form.toLowerCase();
  for (const w of ["tablet", "capsule", "suppository", "sachet", "lozenge", "pessary", "vial", "ampoule"]) if (f.includes(w)) return w;
  return "unit";
}
/** "Unit Price: ৳ 2.00,(120's pack: ৳ 240.00)," -> {unitPrice, unitLabel, packs} */
function parsePrices(text, form) {
  const prices = [];
  for (const m of (text ?? "").matchAll(/([^:৳]*?):\s*৳\s*([\d,]+(?:\.\d+)?)/g)) {
    const label = m[1].replace(/^[\s,()]+|[\s,()]+$/g, "");
    prices.push({ label, price: num(m[2]) });
  }
  const isPack = (l) => /'s pack/i.test(l);
  const first = prices.find((p) => !isPack(p.label));
  let unitPrice = null;
  let unitLabel = formUnit(form);
  if (first) {
    unitPrice = first.price;
    if (!/^unit price$/i.test(first.label)) unitLabel = first.label;
  }
  const seen = new Set();
  const packs = [];
  for (const p of prices) {
    if (p === first) continue;
    const key = p.label + "|" + p.price;
    if (seen.has(key)) continue;
    seen.add(key);
    packs.push(p);
  }
  return { unitPrice, unitLabel, packs };
}

// ---------- medicines ----------
const medRows = readCsv("medicine.csv");
const medicines = medRows.map((r) => {
  const form = r["dosage form"].trim();
  const { unitPrice, unitLabel, packs } = parsePrices(r["package container"], form);
  const m = {
    id: Number(r["brand id"]),
    brand: r["brand name"].trim(),
    form,
    generic: r["generic"].trim(),
    strength: r["strength"].trim(),
    company: r["manufacturer"].trim(),
    unitPrice,
    unitLabel,
    packs,
    herbal: r["type"].trim().toLowerCase() === "herbal",
  };
  return m;
});

// ---------- generics ----------
const genRows = readCsv("generic.csv");
const byKey = new Map(); // genericKey(full name) -> row
const bySingle = new Map(); // ingredient (salts stripped) -> row, single-ingredient generics only
for (const g of genRows) {
  const name = g["generic name"];
  byKey.set(genericKey(name), g);
  if (!name.includes("+")) {
    const ing = ingredientNames(name)[0];
    if (ing && !bySingle.has(ing)) bySingle.set(ing, g);
  }
}

const needed = new Map(); // key -> row
const distinct = new Set();
let rowHits = 0;
for (const m of medicines) {
  const k = genericKey(m.generic);
  distinct.add(k);
  const row = byKey.get(k);
  if (row) {
    rowHits++;
    needed.set(k, row);
  }
  if (m.generic.includes("+")) {
    for (const ing of ingredientNames(m.generic)) {
      const r = bySingle.get(ing);
      if (r) needed.set(genericKey(r["generic name"]), r);
    }
  }
}
const distinctHits = [...distinct].filter((k) => byKey.has(k)).length;

const generics = {};
for (const [key, g] of needed) {
  generics[key] = {
    name: g["generic name"].trim(),
    drugClass: g["drug class"].trim(),
    indication: g["indication"].trim(),
    uses: truncate(proseText(g["indication description"]), 500),
    dosage: truncate(proseText(g["dosage description"]), 600),
    interactions: linesText(g["interaction description"]),
    sideEffects: truncate(proseText(g["side effects description"]), 500),
    contraindications: truncate(proseText(g["contraindications description"]), 400),
    pregnancy: truncate(proseText(g["pregnancy and lactation description"]), 300),
    monograph: g["monograph link"].trim(),
  };
}

const medPath = join(outDir, "medicines.json");
const genPath = join(outDir, "generics.json");
writeFileSync(medPath, JSON.stringify(medicines));
writeFileSync(genPath, JSON.stringify(generics));

const kb = (p) => (statSync(p).size / 1024).toFixed(0) + " KB";
console.log(`medicines.json: ${medicines.length} rows, ${kb(medPath)}`);
console.log(`generics.json: ${Object.keys(generics).length} generics, ${kb(genPath)}`);
console.log(`generic join: ${distinctHits}/${distinct.size} distinct names (${((100 * distinctHits) / distinct.size).toFixed(1)}%), ${rowHits}/${medicines.length} medicine rows (${((100 * rowHits) / medicines.length).toFixed(1)}%)`);
console.log(`medicines with unitPrice: ${medicines.filter((m) => m.unitPrice !== null).length}`);
