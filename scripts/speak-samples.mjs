// Pre-renders the Bangla summary of each recorded sample run to public/runs/<id>-bn.<ext>, so "Listen in Bangla"
// works on the samples with no live call. Usage: node scripts/speak-samples.mjs [server=http://localhost:3007]
import { readFile, writeFile } from "node:fs/promises";

const server = process.argv[2] ?? "http://localhost:3007";
for (const id of ["rahima", "karim", "arif"]) {
  const run = JSON.parse(await readFile(`public/runs/${id}.json`, "utf8"));
  const done = run.events.find((e) => e.t === "done");
  const res = await fetch(`${server}/api/speak`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: done.summary.bn }),
  });
  if (!res.ok) {
    console.error(id, "failed", res.status);
    continue;
  }
  const type = res.headers.get("content-type") ?? "audio/wav";
  const ext = type.includes("mpeg") ? "mp3" : "wav";
  await writeFile(`public/runs/${id}-bn.${ext}`, Buffer.from(await res.arrayBuffer()));
  console.log(id, type);
}
