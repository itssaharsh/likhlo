// "Add reminders to my phone": one daily calendar reminder per medicine and part of the day, as an
// RFC 5545 .ics file. Everything comes from the RunState; nothing is added. No AI call.
import { bnDigits, timingText, type Lang } from "../components/format";
import type { RunState } from "./run-types";
import { slipFromRun, type SlipRow } from "./slip";

type Slot = "morning" | "noon" | "night";

const SLOTS: { slot: Slot; hour: number; en: string; bn: string }[] = [
  { slot: "morning", hour: 8, en: "Morning medicine", bn: "সকালের ওষুধ" },
  { slot: "noon", hour: 14, en: "Noon medicine", bn: "দুপুরের ওষুধ" },
  { slot: "night", hour: 21, en: "Night medicine", bn: "রাতের ওষুধ" },
];

/** A line that says "continue" (or gives no days) repeats for this many days. */
export const CONTINUE_DAYS = 30;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** TEXT value escaping (RFC 5545 3.3.11). */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold content lines longer than 75 octets (RFC 5545 3.1), never splitting a UTF-8 character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const max = out.length ? 74 : 75;
    if (bytes + n > max) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Lines left out of the calendar because the prescription says to take them only when needed. */
export const whenNeededRows = (run: RunState): SlipRow[] => slipFromRun(run).rows.filter((r) => r.asNeeded);

function doseText(r: SlipRow, count: number, lang: Lang): string {
  const n = lang === "bn" ? bnDigits(count) : String(count);
  const each = r.amount ? (count === 1 ? r.amount : `${n} × ${r.amount}`) : n;
  return lang === "bn" ? `ডোজ: ${each}` : `Dose: ${each}`;
}

const FROM = { en: "From Likhlo; follow your doctor's prescription.", bn: "Likhlo থেকে; ডাক্তারের প্রেসক্রিপশন মেনে চলুন।" };

/** Lines that get at least one reminder: a dose in some part of the day, not "when needed". */
export const reminderRows = (run: RunState): SlipRow[] =>
  slipFromRun(run).rows.filter((r) => !r.asNeeded && (r.days ?? CONTINUE_DAYS) >= 1 && SLOTS.some((s) => r.slots[s.slot] > 0));

/** The first day of a slot: today, or tomorrow when today's time for it has already passed. */
function firstDay(start: Date, hour: number): string {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (start.getHours() * 60 + start.getMinutes() > hour * 60) d.setDate(d.getDate() + 1);
  return ymd(d);
}

export function remindersIcs(run: RunState, opts: { start: Date; lang: Lang }): string {
  const { start, lang } = opts;
  const day = ymd(start);
  const stamp = utcStamp(start);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Likhlo//Medicine reminders//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(lang === "bn" ? "Likhlo ওষুধ" : "Likhlo medicines")}`,
  ];
  for (const r of reminderRows(run)) {
    const count = r.days ?? CONTINUE_DAYS;
    for (const s of SLOTS) {
      const dose = r.slots[s.slot];
      if (!(dose > 0)) continue;
      const when = timingText(r.timing, lang);
      const title = `${lang === "bn" ? s.bn : s.en}: ${r.name}${when ? `, ${when}` : ""}`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:likhlo-${day}-${r.n}-${s.slot}-${hash([run.patient, run.doctor, r.name, count, dose, r.timing].join("|"))}@likhlo-bd.vercel.app`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${firstDay(start, s.hour)}T${pad(s.hour)}0000`,
        "DURATION:PT15M",
        `RRULE:FREQ=DAILY;COUNT=${count}`,
        `SUMMARY:${esc(title)}`,
        `DESCRIPTION:${esc(`${doseText(r, dose, lang)}\n${FROM[lang]}`)}`,
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${esc(title)}`,
        "TRIGGER:PT0M",
        "END:VALARM",
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
