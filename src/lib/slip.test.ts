import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { replayState, type RecordedRun } from "./run-types";
import { doseMark, slipDate, slipFileName, slipFromRun, totalText, unitPriceText, whenText } from "./slip";

const load = (id: string) => JSON.parse(readFileSync(`public/runs/${id}.json`, "utf8")) as RecordedRun;

describe("pharmacy slip: Rahima's prescription", () => {
  const rec = load("rahima");
  const slip = slipFromRun(replayState(rec.events), rec.recordedAt);

  it("has one row per prescription line", () => {
    expect(slip.rows).toHaveLength(5);
    expect(slip.rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5]);
    expect(slip.patient).toBe("Rahima Khatun, 58 y");
    expect(slip.doctor).toBe("Dr. Farhana Islam");
  });

  it("line 3: Seclo 20 mg -> G-Omeprazole at ৳3 each", () => {
    const r = slip.rows[2];
    expect(r.name).toBe("Seclo 20 mg");
    expect(r.generic).toBe("Omeprazole");
    expect(r.cheaper).toEqual({ brand: "G-Omeprazole", company: "Gonoshasthaya Pharma Ltd.", unitPrice: 3, unitLabel: "capsule" });
    expect(unitPriceText(r.cheaper!, "en")).toBe("৳3 each");
    expect(unitPriceText(r.cheaper!, "bn")).toBe("প্রতিটি ৳৩");
    expect([doseMark(r.slots.morning, "en"), doseMark(r.slots.noon, "en"), doseMark(r.slots.night, "en")]).toEqual(["1", "", "1"]);
    expect(whenText(r, "en")).toBe("before food · 14 days");
    expect(whenText(r, "bn")).toBe("খাবারের আগে · ১৪ দিন");
  });

  it("keeps 'when needed' and 'continue' lines as written", () => {
    expect(slip.rows[1].asNeeded).toBe(true);
    expect(whenText(slip.rows[4], "en")).toBe("continue");
    expect(unitPriceText(slip.rows[0].cheaper!, "en")).toBe("৳1.50 each");
  });

  it("totals are rounded to the taka: ৳409 instead of ৳612", () => {
    expect(slip.totals).toMatchObject({ prescribed: 612, cheapest: 409 });
    expect(totalText(slip.totals!, "en")).toBe("৳409 instead of ৳612");
    expect(totalText(slip.totals!, "bn")).toBe("৳৬১২-এর বদলে ৳৪০৯");
  });

  it("carries both warnings, with the leaflet quote", () => {
    expect(slip.warnings).toHaveLength(2);
    expect(slip.warnings.map((w) => w.kind)).toEqual(["duplicate", "interaction"]);
    expect(slip.warnings.some((w) => w.quote?.includes("Avoid concomitant use of omeprazole or esomeprazole"))).toBe(true);
  });

  it("dates the reading and names the file after the patient", () => {
    expect(slipDate(slip.readAt, "en")).toBe("9 November 2026");
    expect(slipFileName(slip.patient)).toBe("likhlo-rahima-khatun.png");
    expect(slipFileName(undefined)).toBe("likhlo-prescription.png");
  });
});

describe("pharmacy slip: syrups are priced per bottle", () => {
  it("arif: per-bottle prices and no totals invented beyond the run", () => {
    const rec = load("arif");
    const slip = slipFromRun(replayState(rec.events));
    expect(slip.rows).toHaveLength(4);
    expect(unitPriceText(slip.rows[0].cheaper!, "en")).toBe("৳20.63 per 60 ml bottle");
    expect(slip.rows.map((r) => r.amount)).toEqual(["২ চামচ", "১ চামচ", "১ চামচ", "১ চামচ"]);
    expect(slip.warnings).toHaveLength(0);
    expect(slip.readAt).toBeUndefined();
  });
});

describe("pharmacy slip: lines without a match", () => {
  it("keep the strength as written", () => {
    const run = replayState(load("rahima").events);
    const n = run.lines[2].n;
    const unmatched = { ...run, matches: { ...run.matches, [n]: { line: n, med: null } } };
    const r = slipFromRun(unmatched).rows[2];
    expect(r.found).toBe(false);
    expect(r.name).toContain("20mg");
    expect(r.cheaper).toBeNull();
    expect(r.amount).toBeNull();
  });
});
