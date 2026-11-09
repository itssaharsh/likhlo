import { runAgent } from "@/lib/agent";
import { allowRun, clientIp, MAX_IMAGE_BYTES } from "@/lib/limits";
import type { RunEvent } from "@/lib/run-types";

export const maxDuration = 300;

const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function POST(req: Request) {
  const apiKeys = (process.env.GEMINI_API_KEYS ?? process.env.GEMINI_API_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const one = (e: RunEvent, status = 200) =>
    new Response(JSON.stringify(e) + "\n", { status, headers: { "content-type": "application/x-ndjson" } });

  if (!apiKeys.length) return one({ t: "error", at: 0, code: "busy", message: "Live reading is paused right now." }, 503);
  if (!allowRun(clientIp(req)))
    return one({ t: "error", at: 0, code: "limit", message: "You've read several prescriptions in a few minutes. Try again in a little while." }, 429);

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("image");
    file = f instanceof File ? f : null;
  } catch {
    file = null;
  }
  if (!file || !OK_TYPES.includes(file.type))
    return one({ t: "error", at: 0, code: "unreadable", message: "Send a photo (JPG, PNG or WebP) of the prescription." }, 400);
  if (file.size > MAX_IMAGE_BYTES)
    return one({ t: "error", at: 0, code: "too_large", message: "That photo is too large. Try one under 4 MB." }, 413);

  const image = new Uint8Array(await file.arrayBuffer());
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: RunEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false; // the visitor left
        }
      };
      try {
        await runAgent({ image, mediaType: file!.type, apiKeys, emit, signal: req.signal });
      } catch (err) {
        const msg = String((err as Error)?.message ?? err);
        const busy = /429|503|overload|quota|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg);
        console.error("read failed:", msg.slice(0, 300));
        emit({
          t: "error",
          at: 0,
          code: busy ? "busy" : "failed",
          message: busy
            ? "Live reading is busy right now. Here is the last reading instead."
            : "Something went wrong while reading. Try again, or try a sample.",
        });
      } finally {
        if (open) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
