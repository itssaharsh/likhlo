// Records a real agent run on a sample prescription so the page can replay it with no backend.
// Usage: node scripts/record-run.mjs <id> "<title>" [server=http://localhost:3007]
import { readFile, writeFile } from "node:fs/promises";

const [id, title, server = "http://localhost:3007"] = process.argv.slice(2);
if (!id || !title) {
  console.error('usage: node scripts/record-run.mjs <id> "<title>" [server]');
  process.exit(1);
}
const image = `/samples/${id}.jpg`;
const bytes = await readFile(`public${image}`);
/** Width and height from a JPEG's frame header. */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error("not a JPEG");
}
const form = new FormData();
form.append("image", new Blob([bytes], { type: "image/jpeg" }), `${id}.jpg`);

const res = await fetch(`${server}/api/read`, { method: "POST", body: form });
const text = await res.text();
const all = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
// keep only the attempt that finished (a busy model restarts the reading on another one)
const lastRestart = all.map((e) => e.t).lastIndexOf("restart");
const events = lastRestart >= 0 ? all.slice(lastRestart + 1) : all;
const bad = events.find((e) => e.t === "error");
if (bad || !events.some((e) => e.t === "done")) {
  console.error("run did not finish:", bad?.message ?? "no done event");
  process.exit(1);
}
const model = events.find((e) => e.t === "status" && e.model)?.model ?? all[lastRestart]?.model ?? "unknown";
const run = { id, title, recordedAt: new Date().toISOString(), model, image, imageSize: jpegSize(bytes), events };
await writeFile(`public/runs/${id}.json`, JSON.stringify(run, null, 1) + "\n");
const done = events.find((e) => e.t === "done");
console.log(`${id}: ${events.length} events, ${done.at} ms, ৳${done.totals.prescribed} -> ৳${done.totals.cheapest}`);
