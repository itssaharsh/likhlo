import { generateText } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { searchBrands } from "@/lib/meds";
import { geminiKeys } from "@/lib/speech";
import { PRIMARY_MODEL } from "@/lib/agent";


/** Probe for the live feature: the medicine data answers, and with ?live=1 the model answers too. */
export async function GET(req: Request) {
  const hit = searchBrands("Seclo 20", { form: "Cap" })[0]?.med;
  const data = hit?.generic === "Omeprazole";
  let model: boolean | null = null;
  if (new URL(req.url).searchParams.get("live") === "1") {
    const key = geminiKeys()[0];
    try {
      const r = await generateText({ model: createGoogle({ apiKey: key })(PRIMARY_MODEL), prompt: "Reply with the word ok.", maxRetries: 0 });
      model = /ok/i.test(r.text);
    } catch {
      model = false;
    }
  }
  const ok = data && model !== false;
  return Response.json({ ok, data, model }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
