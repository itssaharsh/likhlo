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

export function searchWithPrices(q: string): SearchResult[] {
  return searchBrands(q, { limit: 8 }).map(({ med }) => ({
    id: med.id,
    brand: med.brand,
    form: med.form,
    strength: med.strength,
    generic: med.generic,
    company: med.company,
    unitPrice: med.unitPrice,
    unitLabel: med.unitLabel,
    equivalents: findEquivalents(med).length,
    cheapest: findCheaper(med, 3).map(priced),
  }));
}
