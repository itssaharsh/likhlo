import { NextResponse } from "next/server";
import { findEquivalents, medicineById } from "@/lib/meds";

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  const med = Number.isFinite(id) ? medicineById(id) : null;
  if (!med) return NextResponse.json({ brands: [] }, { status: 404 });
  const brands = findEquivalents(med)
    .slice()
    .sort((a, b) => (a.unitPrice ?? 1e9) - (b.unitPrice ?? 1e9) || a.brand.localeCompare(b.brand))
    .map(({ id, brand, form, generic, strength, company, unitPrice, unitLabel }) => ({ id, brand, form, generic, strength, company, unitPrice, unitLabel }));
  return NextResponse.json({ brands }, { headers: { "cache-control": "public, max-age=86400" } });
}
