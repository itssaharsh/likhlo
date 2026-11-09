import { generateSpeech } from "ai";
import { createGoogle } from "@ai-sdk/google";

const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"];

export const geminiKeys = () =>
  (process.env.GEMINI_API_KEYS ?? process.env.GEMINI_API_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

/** Bangla speech for a summary, trying each model and key until one answers. */
export async function speakBangla(text: string, keys = geminiKeys()): Promise<{ audio: Uint8Array; mediaType: string }> {
  let last: unknown = new Error("no Gemini key");
  for (const model of TTS_MODELS) {
    for (const apiKey of keys) {
      try {
        const google = createGoogle({ apiKey });
        const res = await generateSpeech({
          model: google.speech(model),
          text,
          voice: "Kore",
          language: "bn-BD",
          instructions: "Warm, calm and clear, like a kind pharmacist explaining to an older relative. Speak at an easy pace.",
          maxRetries: 0,
        });
        return { audio: res.audio.uint8Array, mediaType: res.audio.mediaType };
      } catch (err) {
        last = err;
      }
    }
  }
  throw last;
}
