// Name helpers shared by scripts/build-data.mjs and src/lib/meds.ts (plain JS so both can import it).

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

/** lowercase, Bangla digits -> ASCII, punctuation -> space, collapse spaces. */
export function normalize(s) {
  return String(s ?? "")
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

/** Trailing salt / hydrate words that are not the active moiety ("Clopidogrel Bisulphate" -> clopidogrel). */
export const SALT_WORDS = new Set([
  "hydrochloride", "hcl", "dihydrochloride", "bisulphate", "bisulfate", "sulphate", "sulfate",
  "sodium", "potassium", "calcium", "magnesium", "besilate", "besylate", "medoxomil",
  "dihydrate", "trihydrate", "sesquihydrate", "monohydrate", "hemihydrate", "anhydrous", "hydrate",
  "maleate", "tartrate", "succinate", "fumarate", "mesylate", "mesilate", "phosphate", "citrate",
  "acetate", "hydrobromide", "axetil", "proxetil", "pivoxil", "cilexetil", "dipropionate",
  "valerate", "propionate", "furoate", "lactate", "gluconate", "bromide", "chloride", "oxalate",
]);

/** Active ingredient name without trailing salts, e.g. "Esomeprazole Magnesium Trihydrate" -> "esomeprazole". */
export function stripSalts(name) {
  const words = normalize(String(name).replace(/\([^)]*\)/g, " ")).split(" ").filter(Boolean);
  while (words.length > 1 && SALT_WORDS.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

/** "Paracetamol + Caffeine" -> ["paracetamol", "caffeine"] */
export function ingredientNames(generic) {
  return String(generic ?? "")
    .split(/\s\+\s|\+/)
    .map(stripSalts)
    .filter(Boolean);
}

/** Generic name key used to join medicine.csv and generic.csv (parenthetical notes dropped). */
export function genericKey(name) {
  return normalize(String(name ?? "").replace(/\([^)]*\)/g, " "));
}
