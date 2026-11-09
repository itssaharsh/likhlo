import { describe, expect, it } from "vitest";
import {
  courseCost, findCheaper, findDuplicates, findEquivalents, findInteractions, genericInfo,
  ingredientsOf, isNegatedMention, normalize, parseDose, parseForm, searchBrands, type Medicine,
} from "./meds";

const top = (q: string): Medicine => searchBrands(q)[0].med;

describe("normalize / parseForm", () => {
  it("normalizes", () => {
    expect(normalize("Tab. Seclo-20 mg!")).toBe("tab seclo 20 mg");
    expect(normalize("১২০ mg")).toBe("120 mg");
  });
  it("maps form abbreviations", () => {
    expect(parseForm("Tab.")).toBe("tablet");
    expect(parseForm("Cap")).toBe("capsule");
    expect(parseForm("Syp")).toBe("syrup");
    expect(parseForm("Inj")).toBe("injection");
    expect(parseForm("ট্যাব")).toBe("tablet");
    expect(parseForm("xyz")).toBeNull();
  });
});

describe("searchBrands golden cases", () => {
  it("Napa Extend 665", () => {
    const m = top("Napa Extend 665");
    expect([m.brand, m.form, m.generic, m.strength, m.unitPrice]).toEqual(["Napa Extend", "Tablet (Extended Release)", "Paracetamol", "665 mg", 2]);
  });
  it("Cap. Seclo 20", () => {
    const m = top("Cap. Seclo 20");
    expect([m.brand, m.form, m.generic, m.strength, m.unitPrice]).toEqual(["Seclo", "Capsule (Delayed Release)", "Omeprazole", "20 mg", 6]);
  });
  it("Ace Plus", () => {
    const m = top("Ace Plus");
    expect([m.generic, m.strength]).toEqual(["Paracetamol + Caffeine", "500 mg+65 mg"]);
  });
  it("Fexo 120", () => {
    const m = top("Fexo 120");
    expect([m.brand, m.generic, m.strength, m.unitPrice]).toEqual(["Fexo", "Fexofenadine Hydrochloride", "120 mg", 8]);
  });
  it("Clopid 75", () => {
    const m = top("Clopid 75");
    expect([m.brand, m.generic, m.strength, m.company, m.unitPrice]).toEqual(["Clopid", "Clopidogrel Bisulphate", "75 mg", "Drug International Ltd.", 12]);
  });
  it("fuzzy / OCR-ish queries", () => {
    expect(top("Seclo 2O").id).toBe(top("Seclo 20").id);
    expect(top("Seclo 2O").strength).toBe("20 mg");
    expect(top("Napa Extnd").brand).toBe("Napa Extend");
    expect(top("Fexo l20").id).toBe(top("Fexo 120").id);
    expect(top("Clopid75").id).toBe(top("Clopid 75").id);
  });
  it("is fast", () => {
    searchBrands("warmup");
    const t = performance.now();
    for (let i = 0; i < 10; i++) searchBrands("Napa Extnd 665");
    expect((performance.now() - t) / 10).toBeLessThan(60);
  });
});

describe("ingredients, duplicates, interactions", () => {
  it("strips salts", () => {
    expect(ingredientsOf(top("Clopid 75"))).toEqual(["clopidogrel"]);
    expect(ingredientsOf(top("Ace Plus"))).toEqual(["paracetamol", "caffeine"]);
  });
  it("finds the paracetamol duplicate", () => {
    const d = findDuplicates([top("Napa Extend 665"), top("Ace Plus")]);
    expect(d).toHaveLength(1);
    expect(d[0].ingredient).toBe("paracetamol");
    expect(d[0].meds).toHaveLength(2);
  });
  it("finds clopidogrel + omeprazole interaction from the monograph", () => {
    const hits = findInteractions([top("Clopid 75"), top("Seclo 20")]);
    const h = hits.find((x) => x.matched === "omeprazole");
    expect(h).toBeDefined();
    expect(h!.source).toBe("Clopidogrel Bisulphate monograph");
    expect(genericInfo("Clopidogrel Bisulphate")!.interactions).toContain(h!.snippet);
  });
  it("does not flag unrelated drugs", () => {
    expect(findInteractions([top("Fexo 120"), top("Napa Extend 665")])).toEqual([]);
  });
});

describe("findCheaper", () => {
  it("Seclo 20 alternatives are same generic/strength/form and cheaper", () => {
    const seclo = top("Cap. Seclo 20");
    const alts = findCheaper(seclo, 10);
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) {
      expect(a.generic).toBe("Omeprazole");
      expect(a.strength).toBe("20 mg");
      expect(a.form).toBe("Capsule (Delayed Release)");
      expect(a.unitPrice!).toBeLessThan(6);
    }
    const prices = alts.map((a) => a.unitPrice!);
    expect(prices).toEqual([...prices].sort((x, y) => x - y));
    expect(findEquivalents(seclo).length).toBeGreaterThan(alts.length);
  });
});

describe("parseDose / courseCost", () => {
  it("parses BD notation", () => {
    expect(parseDose("1+0+1")).toMatchObject({ morning: 1, noon: 0, night: 1, perDay: 2 });
    expect(parseDose("১+০+১")).toMatchObject({ morning: 1, noon: 0, night: 1, perDay: 2 });
    expect(parseDose("1-0-1")!.perDay).toBe(2);
    expect(parseDose("0+0+1")).toMatchObject({ morning: 0, noon: 0, night: 1, perDay: 1 });
    expect(parseDose("1+1+1")!.perDay).toBe(3);
    expect(parseDose("½+0+½")).toMatchObject({ morning: 0.5, night: 0.5, perDay: 1 });
    expect(parseDose("1+1+1+1")).toMatchObject({ perDay: 4, slots: [1, 1, 1, 1] });
    expect(parseDose("hello")).toBeNull();
  });
  it("computes course cost", () => {
    expect(courseCost(top("Napa Extend 665"), 2, 5)).toBe(20);
  });
});

describe("interaction sentences that say there is no interaction", () => {
  const top = (q: string) => searchBrands(q)[0].med;
  it("does not warn for cetirizine with azithromycin or pseudoephedrine (leaflet says none found)", () => {
    const hits = findInteractions([top("Alatrol 5mg/5ml syrup"), top("Zimax 200mg/5ml suspension"), top("Tusca")]);
    expect(hits).toEqual([]);
  });
  it("still warns for clopidogrel with omeprazole, quoting the leaflet word for word", () => {
    const hits = findInteractions([top("Clopid 75"), top("Cap. Seclo 20")]);
    expect(hits.map((h) => h.snippet)).toContain(
      "CYP2C19 inhibitors (omeprazole or esomeprazole): Avoid concomitant use of omeprazole or esomeprazole",
    );
  });
  it("recognises negated mentions", () => {
    expect(isNegatedMention("No clinically significant drug interactions have been found with Theophylline, Azithromycin.")).toBe(true);
    expect(isNegatedMention("Avoid concomitant use of omeprazole or esomeprazole")).toBe(false);
  });
});

describe("dose notation inside a written line", () => {
  it("takes only the a+b+c part", async () => {
    const { doseNotation } = await import("./agent");
    expect(doseNotation("1+0+1 (খাবার পর) - ৫ দিন")).toBe("1+0+1");
    expect(doseNotation("১+০+১ — ১৪ দিন")).toBe("১+০+১");
    expect(doseNotation("0+0+1 - ৭ দিন")).toBe("0+0+1");
    expect(doseNotation("1-0-1 x 7 days")).toBe("1-0-1");
    expect(doseNotation("½ + 0 + ½")).toBe("½ + 0 + ½");
    expect(doseNotation("ব্যথা হলে ১টা - ৩ দিন")).toBeNull();
  });
});
