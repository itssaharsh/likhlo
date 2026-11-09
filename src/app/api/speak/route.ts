import { speakBangla } from "@/lib/speech";
import { allowRun, clientIp } from "@/lib/limits";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!allowRun(`speak:${clientIp(req)}`)) return new Response("busy", { status: 429 });
  let text = "";
  try {
    text = String((await req.json())?.text ?? "").slice(0, 1200);
  } catch {
    /* empty */
  }
  if (!text.trim()) return new Response("nothing to read", { status: 400 });
  try {
    const { audio, mediaType } = await speakBangla(text);
    return new Response(Buffer.from(audio), { headers: { "content-type": mediaType, "cache-control": "no-store" } });
  } catch (err) {
    console.error("speak failed:", String((err as Error)?.message ?? err).slice(0, 200));
    return new Response("busy", { status: 503 });
  }
}
