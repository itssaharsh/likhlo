import { describe, expect, it } from "vitest";
import { searchWithPrices } from "./search";
import { GET } from "../app/api/search/route";

describe("searchWithPrices", () => {
  it("Seclo 20: the capsule, its 123 same-medicine brands and G-Omeprazole at ৳3", () => {
    const [first] = searchWithPrices("Seclo 20");
    expect(`${first.brand} ${first.strength} ${first.form}`).toBe("Seclo 20 mg Capsule (Delayed Release)");
    expect(first.generic).toBe("Omeprazole");
    expect(first.equivalents).toBe(123);
    expect(first.cheapest[0]).toMatchObject({ brand: "G-Omeprazole", unitPrice: 3 });
    expect(first.cheapest.length).toBeLessThanOrEqual(3);
  });

  it("napa extnd: a misspelling still finds Napa Extend", () => {
    expect(searchWithPrices("napa extnd")[0].brand).toBe("Napa Extend");
  });

  it("shows a repeated entry in the medicine list once (Motodon)", () => {
    const motodon = searchWithPrices("Motodon").filter((r) => r.brand === "Motodon" && r.strength === "10 mg");
    expect(motodon).toHaveLength(1);
  });

  it("still names the cheapest brands for a brand with no listed price (Paramol 500 mg)", () => {
    const tab = searchWithPrices("Paramol").find((r) => r.brand === "Paramol" && r.unitPrice === null)!;
    expect(tab.cheapest.length).toBeGreaterThan(0);
    expect(tab.cheapest.every((c) => c.unitPrice !== null && c.brand !== "Paramol")).toBe(true);
  });

  it("returns at most 8 results", () => {
    expect(searchWithPrices("napa").length).toBeLessThanOrEqual(8);
  });
});

describe("GET /api/search", () => {
  const get = (q: string) => GET(new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`));

  it.each(["", "x", "  x  ", "a".repeat(61)])("rejects %j with 400 and no results", async (q) => {
    const res = await get(q);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ results: [] });
  });

  it("answers a real query, cacheable for an hour", async () => {
    const res = await get("  Seclo 20 ");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    const { results } = await res.json();
    expect(results[0].brand).toBe("Seclo");
  });
});
