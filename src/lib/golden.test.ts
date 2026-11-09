// Golden checks on the recorded sample runs the page opens on: every number, match, warning and quoted
// leaflet sentence shown on screen must match the medicine data, word for word.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { clashSentences, courseFor, doseNotation } from "./agent";
import { findCheaper, genericInfo, isNegatedMention, medicineById, parseDose, type Medicine } from "./meds";
import { replayState, type RecordedRun } from "./run-types";

const load = (id: string) => JSON.parse(readFileSync(`public/runs/${id}.json`, "utf8")) as RecordedRun;

describe.each(["rahima", "karim", "arif"])("recorded run: %s", (id) => {
  const run = load(id);
  const state = replayState(run.events);

  it("finished, with every line matched to a real brand", () => {
    expect(state.status).toBe("done");
    expect(state.lines.length).toBeGreaterThan(2);
    for (const l of state.lines) {
      const m = state.matches[l.n];
      expect(m?.med, `line ${l.n}`).toBeTruthy();
      const med = medicineById(m.med!.id)!;
      expect(med.brand).toBe(m.med!.brand);
      expect(med.unitPrice).toBe(m.med!.unitPrice);
      // the brand matched is the one written on the line
      expect(l.raw.toLowerCase().replace(/\s+/g, "")).toContain(med.brand.toLowerCase().replace(/\s+/g, ""));
    }
  });

  it("doses match the 1+0+1 notation written on each line", () => {
    for (const l of state.lines) {
      const notation = doseNotation(l.raw);
      if (!notation) continue;
      const d = parseDose(notation)!;
      expect(l.perDay, l.raw).toBe(d.perDay);
      expect(l.slots, l.raw).toEqual({ morning: d.morning, noon: d.noon, night: d.night + d.evening });
    }
  });

  it("prices and totals come from the data", () => {
    let prescribed = 0;
    let cheapest = 0;
    for (const l of state.lines) {
      const m = state.matches[l.n];
      const med = medicineById(m.med!.id)!;
      const course = courseFor(l, med, findCheaper(med, 5)[0]);
      expect(m.course).toEqual(course);
      expect(m.cheaper?.map((c) => c.id)).toEqual(findCheaper(med, 5).map((c) => c.id));
      prescribed += course.prescribed ?? 0;
      cheapest += course.cheapest ?? 0;
    }
    expect(state.totals?.prescribed).toBeCloseTo(prescribed, 2);
    expect(state.totals?.cheapest).toBeCloseTo(cheapest, 2);
  });

  it("warnings are regenerated word for word, and every quote is in the leaflet", () => {
    const chosen = new Map<number, Medicine>(state.lines.map((l) => [l.n, medicineById(state.matches[l.n].med!.id)!]));
    expect(state.clashes).toEqual(clashSentences(chosen));
    for (const c of state.clashes) {
      if (!c.quote) continue;
      const generic = c.source!.replace(/ monograph$/, "");
      const text = genericInfo(generic)?.interactions ?? "";
      expect(text.replace(/\s+/g, " ")).toContain(c.quote.replace(/^\.\.\.|\.\.\.$/g, "").replace(/\s+/g, " "));
      expect(isNegatedMention(c.quote)).toBe(false);
    }
  });

  it("summary money comes from the totals, not the model", () => {
    const t = state.totals!;
    const amounts = [...(state.summary?.en ?? "").matchAll(/৳([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
    for (const a of amounts) expect([Math.round(t.prescribed), Math.round(t.cheapest)]).toContain(a);
  });
});

describe("the named example: Rahima Khatun's prescription", () => {
  const state = replayState(load("rahima").events);
  it("finds the paracetamol double dose and the clopidogrel leaflet warning", () => {
    expect(state.clashes.map((c) => c.en)).toEqual([
      "Napa Extend and Ace Plus both contain paracetamol.",
      "Clopid's leaflet (Clopidogrel Bisulphate) has a warning about omeprazole, which is in Seclo.",
    ]);
    expect(state.clashes[1].quote).toBe(
      "CYP2C19 inhibitors (omeprazole or esomeprazole): Avoid concomitant use of omeprazole or esomeprazole",
    );
  });
  it("prices the same medicines at ৳409 instead of ৳612", () => {
    expect(Math.round(state.totals!.cheapest)).toBe(409);
    expect(Math.round(state.totals!.prescribed)).toBe(612);
  });
});
