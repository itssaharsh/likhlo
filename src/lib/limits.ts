// Small in-memory guards for the costly routes (per server instance; enough for a public demo).
const hits = new Map<string, number[]>();
let day = "";
let dayCount = 0;

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const PER_IP = 6; // runs
const WINDOW_MS = 10 * 60 * 1000;
const PER_DAY = 400;

export function allowRun(ip: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= PER_DAY) return false;
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= PER_IP) return false;
  list.push(now);
  hits.set(ip, list);
  dayCount++;
  return true;
}

export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
