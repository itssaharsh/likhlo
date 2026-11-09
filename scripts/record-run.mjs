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
const form = new FormData();
form.append("image", new Blob([bytes], { type: "image/jpeg" }), `${id}.jpg`);

const res = await fetch(`${server}/api/read`, { method: "POST", body: form });
const text = await res.text();
const events = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
const bad = events.find((e) => e.t === "error");
if (bad || !events.some((e) => e.t === "done")) {
  console.error("run did not finish:", bad?.message ?? "no done event");
  process.exit(1);
}
const model = events.find((e) => e.t === "status" && e.model)?.model ?? "unknown";
const run = { id, title, recordedAt: new Date().toISOString(), model, image, imageSize: [1200, 1600], events };
await writeFile(`public/runs/${id}.json`, JSON.stringify(run, null, 1) + "\n");
const done = events.find((e) => e.t === "done");
console.log(`${id}: ${events.length} events, ${done.at} ms, ৳${done.totals.prescribed} -> ৳${done.totals.cheapest}`);
