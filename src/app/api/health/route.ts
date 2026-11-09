import { generateText } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { searchBrands } from "@/lib/meds";
import { geminiKeys } from "@/lib/speech";
// the cheapest model in the chain, so the probe never spends the main model's quota
const LIVE_PROBE_MODEL = "gemini-3.5-flash-lite";


let lastLive: { at: number; ok: boolean } | null = null;
const LIVE_CACHE_MS = 10 * 60 * 1000;

/** Probe for the live feature: the medicine data answers, and with ?live=1 the model answers too
 *  (one real model call per 10 minutes at most; the free quota is small). */
export async function GET(req: Request) {
  const hit = searchBrands("Seclo 20", { form: "Cap" })[0]?.med;
  const data = hit?.generic === "Omeprazole";
  let model: boolean | null = null;
  if (new URL(req.url).searchParams.get("live") === "1") {
    if (lastLive && Date.now() - lastLive.at < LIVE_CACHE_MS) model = lastLive.ok;
    else {
      try {
        const r = await generateText({
          model: createGoogle({ apiKey: geminiKeys()[0] })(LIVE_PROBE_MODEL),
          prompt: "Reply with the word ok.",
          maxRetries: 0,
        });
        model = /ok/i.test(r.text);
      } catch {
        model = false;
      }
      lastLive = { at: Date.now(), ok: model };
    }
  }
  const ok = data && model !== false;
  return Response.json({ ok, data, model }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
