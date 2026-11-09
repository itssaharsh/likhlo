import { NextResponse } from "next/server";
import { searchWithPrices } from "@/lib/search";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 60) return NextResponse.json({ results: [] }, { status: 400 });
  return NextResponse.json({ results: searchWithPrices(q) }, { headers: { "cache-control": "public, max-age=3600" } });
}
