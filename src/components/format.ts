import type { RxLine, Step, Timing } from "@/lib/run-types";

export type Lang = "en" | "bn";

const BN = "০১২৩৪৫৬৭৮৯";
export const bnDigits = (s: string | number) => String(s).replace(/\d/g, (d) => BN[Number(d)]);

/** "৳1,675" (rounded to the taka); exact figures keep paisa where it matters. */
export const taka = (x: number | null | undefined, exact = false) => {
  if (x === null || x === undefined) return "–";
  const v = exact ? Math.round(x * 100) / 100 : Math.round(x);
  return "৳" + v.toLocaleString("en-US", { maximumFractionDigits: exact ? 2 : 0 });
};

export const timingText = (t: Timing, lang: Lang) =>
  ({
    before_food: lang === "bn" ? "খাবারের আগে" : "before food",
    after_food: lang === "bn" ? "খাবারের পরে" : "after food",
    with_food: lang === "bn" ? "খাবারের সাথে" : "with food",
    unspecified: "",
  })[t];

export function daysText(l: RxLine, lang: Lang) {
  if (l.continuing && l.days === null) return lang === "bn" ? "চলবে" : "continue";
  if (l.days === null) return "";
  return lang === "bn" ? `${bnDigits(l.days)} দিন` : `${l.days} day${l.days === 1 ? "" : "s"}`;
}

export const SLOT_NAMES = {
  morning: { bn: "সকাল", en: "Morning" },
  noon: { bn: "দুপুর", en: "Noon" },
  night: { bn: "রাত", en: "Night" },
} as const;

/** Short brand name for a strength string: "500 mg+65 mg" stays, "20 mg" -> "20 mg". */
export const strengthShort = (s: string) => s.replace(/\s+/g, " ").trim();

export const TOOL_LABEL: Record<string, string> = {
  record_lines: "Read the photo",
  search_medicine: "Search brands",
  choose_medicine: "Match",
  find_cheaper: "Compare prices",
  check_clashes: "Check clashes",
  read_leaflet: "Read leaflet",
  finish: "Write the plan",
};

export const stepIsWarn = (s: Step) => s.tool === "check_clashes" && !s.detail.startsWith("No shared");

/** Pill colours per line (content colours, not the accent). */
export const PILL = [
  "oklch(96% 0.01 90)",
  "oklch(80% 0.1 60)",
  "oklch(75% 0.12 300)",
  "oklch(84% 0.08 200)",
  "oklch(78% 0.11 20)",
  "oklch(82% 0.1 140)",
  "oklch(86% 0.09 100)",
  "oklch(74% 0.1 250)",
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : word.endsWith("s") ? "" : "s"}`;

/** "2 tablets a day for 5 days", "1 capsule every day (ongoing, priced for 30 days)", "one 60 ml bottle". */
export function courseWords(l: RxLine, unitLabel: string) {
  const unit = /tablet|capsule|sachet|vial|suppositor/i.test(unitLabel) ? unitLabel.toLowerCase() : null;
  if (!unit) return `one ${unitLabel || "pack"}`;
  const per = l.asNeeded ? Math.max(1, l.perDay) : l.perDay;
  const each = l.asNeeded ? `up to ${plural(per, unit)} a day when needed` : `${plural(per, unit)} a day`;
  if (l.days !== null) return `${each} for ${plural(l.days, "day")}`;
  if (l.continuing) return `${each}, ongoing (priced for 30 days)`;
  return each;
}
