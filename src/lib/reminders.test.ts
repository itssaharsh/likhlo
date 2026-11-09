import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { replayState, type RecordedRun } from "./run-types";
import { fold, remindersIcs, whenNeededRows } from "./reminders";

const load = (id: string) => JSON.parse(readFileSync(`public/runs/${id}.json`, "utf8")) as RecordedRun;
const unfold = (ics: string) => ics.replace(/\r\n /g, "");
const events = (ics: string) =>
  unfold(ics)
    .split("BEGIN:VEVENT\r\n")
    .slice(1)
    .map((e) => e.slice(0, e.indexOf("END:VEVENT")));
const field = (ev: string, name: string) => ev.split("\r\n").find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1);

describe("phone reminders: Rahima's prescription from 10 November 2026", () => {
  const run = replayState(load("rahima").events);
  const start = new Date(2026, 10, 10, 7, 30);
  const ics = remindersIcs(run, { start, lang: "en" });
  const evs = events(ics);
  const find = (title: string) => evs.find((e) => field(e, "SUMMARY")?.startsWith(title));

  it("has 6 reminders: one per medicine and part of the day with a dose", () => {
    expect(evs).toHaveLength(6);
  });

  it.each([
    ["Morning medicine: Napa Extend 665 mg\\, after food", "080000", 5],
    ["Night medicine: Napa Extend 665 mg\\, after food", "210000", 5],
    ["Morning medicine: Seclo 20 mg\\, before food", "080000", 14],
    ["Night medicine: Seclo 20 mg\\, before food", "210000", 14],
    ["Night medicine: Fexo 120 mg", "210000", 7],
    ["Noon medicine: Clopid 75 mg", "140000", 30],
  ])("%s at %s, every day %i times", (title, time, count) => {
    const ev = find(title);
    expect(ev).toBeDefined();
    expect(field(ev!, "DTSTART")).toBe(`20261110T${time}`);
    expect(field(ev!, "RRULE")).toBe(`FREQ=DAILY;COUNT=${count}`);
    expect(field(ev!, "DESCRIPTION")).toBe("Dose: 1\\nFrom Likhlo\\; follow your doctor's prescription.");
  });

  it("leaves out Ace Plus, taken only when needed", () => {
    expect(unfold(ics)).not.toContain("Ace Plus");
    expect(whenNeededRows(run).map((r) => r.name)).toEqual(["Ace Plus 500 mg+65 mg"]);
  });

  it("is a well-formed calendar: CRLF, folded lines, balanced BEGIN/END, floating times", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const lines = ics.split("\r\n").slice(0, -1);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    const stack: string[] = [];
    for (const l of lines) {
      if (l.startsWith("BEGIN:")) stack.push(l.slice(6));
      if (l.startsWith("END:")) expect(stack.pop()).toBe(l.slice(4));
    }
    expect(stack).toEqual([]);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    for (const ev of evs) expect(field(ev, "DTSTART")).not.toMatch(/Z$/);
  });

  it("gives every reminder a unique UID that stays the same on the next download", () => {
    const uids = evs.map((e) => field(e, "UID"));
    expect(new Set(uids).size).toBe(6);
    expect(events(remindersIcs(run, { start, lang: "en" })).map((e) => field(e, "UID"))).toEqual(uids);
  });

  it("starts a part of the day tomorrow when its time has passed, keeping every dose", () => {
    const late = events(remindersIcs(run, { start: new Date(2026, 10, 10, 15, 0), lang: "en" }));
    const at = (title: string) => late.find((e) => field(e, "SUMMARY")?.startsWith(title))!;
    expect(field(at("Morning medicine: Napa"), "DTSTART")).toBe("20261111T080000");
    expect(field(at("Morning medicine: Napa"), "RRULE")).toBe("FREQ=DAILY;COUNT=5");
    expect(field(at("Noon medicine: Clopid"), "DTSTART")).toBe("20261111T140000");
    expect(field(at("Night medicine: Napa"), "DTSTART")).toBe("20261110T210000");
  });

  it("keeps the UIDs when a dose or duration is corrected, so a re-import updates the reminders", () => {
    const uids = evs.map((e) => field(e, "UID"));
    const fixed = { ...run, lines: run.lines.map((l) => (l.n === 3 ? { ...l, days: 10, timing: "after_food" as const } : l)) };
    expect(events(remindersIcs(fixed, { start, lang: "en" })).map((e) => field(e, "UID"))).toEqual(uids);
  });

  it("gives another patient's prescription different UIDs", () => {
    const uids = evs.map((e) => field(e, "UID"));
    const other = events(remindersIcs({ ...run, patient: "Someone else" }, { start, lang: "en" })).map((e) => field(e, "UID"));
    expect(other.some((u) => uids.includes(u))).toBe(false);
  });

  it("writes the reminders in Bangla", () => {
    const bn = events(remindersIcs(run, { start, lang: "bn" }));
    const napa = bn.find((e) => field(e, "SUMMARY")?.startsWith("সকালের ওষুধ"));
    expect(field(napa!, "SUMMARY")).toBe("সকালের ওষুধ: Napa Extend 665 mg\\, খাবারের পরে");
    expect(field(napa!, "DESCRIPTION")).toBe("ডোজ: ১\\nLikhlo থেকে\\; ডাক্তারের প্রেসক্রিপশন মেনে চলুন।");
  });
});

describe("fold", () => {
  it("never splits a Bangla character across lines", () => {
    const folded = fold("SUMMARY:" + "সকালের ওষুধ ".repeat(12));
    for (const l of folded.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "সকালের ওষুধ ".repeat(12));
  });
});
