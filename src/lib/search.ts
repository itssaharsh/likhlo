// "Search any medicine": brand search with prices, straight from the medicine list. No AI call.
import { findCheaper, findEquivalents, searchBrands, type Medicine } from "./meds";

export interface PricedBrand {
  brand: string;
  company: string;
  unitPrice: number | null;
  unitLabel: string;
}

export interface SearchResult extends PricedBrand {
  id: number;
  form: string;
  strength: string;
  generic: string;
  /** How many brands make this same medicine (same generic, strength and form), itself included. */
  equivalents: number;
  /** Up to three cheaper brands of the same medicine, lowest price first. */
  cheapest: PricedBrand[];
}

const priced = ({ brand, company, unitPrice, unitLabel }: Medicine): PricedBrand => ({ brand, company, unitPrice, unitLabel });

/** Lowest-priced other brands of the same medicine; for a brand with no listed price, the lowest-priced ones of all. */
function cheapestOf(med: Medicine): Medicine[] {
  if (med.unitPrice !== null) return findCheaper(med, 3);
  return findEquivalents(med)
    .filter((m) => m.unitPrice !== null && m.brand !== med.brand)
    .sort((a, b) => (a.unitPrice as number) - (b.unitPrice as number) || a.brand.localeCompare(b.brand))
    .slice(0, 3);
}

/** The medicine list repeats a few entries; one row per brand, form, strength, maker and price. */
const sameEntry = (m: Medicine) => [m.brand, m.form, m.strength, m.generic, m.company, m.unitPrice, m.unitLabel].join("|");

export function searchWithPrices(q: string): SearchResult[] {
  const seen = new Set<string>();
  return searchBrands(q, { limit: 8 })
    .filter(({ med }) => !seen.has(sameEntry(med)) && !!seen.add(sameEntry(med)))
    .map(({ med }) => ({
      id: med.id,
      brand: med.brand,
      form: med.form,
      strength: med.strength,
      generic: med.generic,
      company: med.company,
      unitPrice: med.unitPrice,
      unitLabel: med.unitLabel,
      equivalents: findEquivalents(med).length,
      cheapest: cheapestOf(med).map(priced),
    }));
}
