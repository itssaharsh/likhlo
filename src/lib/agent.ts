// The Likhlo agent: one tool-calling loop over the prescription photo and the medicine data.
// The model reads the photo and decides what to look up; every fact it shows (brand, generic,
// price, clash, leaflet sentence) comes back from a tool over data/*.json.
import { streamText, tool, isStepCount, hasToolCall, type ModelMessage } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { z } from "zod";
import {
  searchBrands,
  findCheaper,
  findEquivalents,
  findDuplicates,
  findInteractions,
  genericInfo,
  parseDose,
  type Medicine,
} from "./meds";
import type { Clash, Course, Match, MedRow, RunEvent, RxLine, Step, Timing, Totals } from "./run-types";

export const PRIMARY_MODEL = "gemini-3.5-flash";
export const FALLBACK_MODEL = "gemini-2.5-flash";
const MAX_STEPS = 14;
const RUN_TIMEOUT_MS = 150_000;
const CONTINUING_DAYS = 30;

const SYSTEM = `You are Likhlo, a careful pharmacist's assistant for families in Bangladesh.
You get one photo of a doctor's prescription (often handwritten, English brand names with Bangla instructions).
Bangladeshi dose notation: "1+0+1" means morning+noon+night; "০+০+১" is the same in Bangla digits.
"খাবার পরে/পর" = after food, "খাবার আগে" = before food, "চলবে" = continue, "ব্যথা হলে" = when in pain, "দিন" = days, "মাস" = month.

Work in as few steps as possible (each step is one model call):
Step 1: call record_lines with every medicine line of the Rx section (not tests, not advice), in order, with its box,
        AND in the same step call search_medicine once for every line.
Step 2: call choose_medicine for every line, all in this step. Handwriting is often misspelled ("Seclo 2O" is Seclo 20):
        pick the candidate whose brand, strength and form fit the line. Choosing a line also returns the same-medicine
        brands and prices; once every line is chosen, the clash check (shared ingredients, leaflet interactions) comes back too.
        If nothing fits a line, search again with a corrected spelling or the likely generic name, then choose; or choose id null.
Step 3 (only if needed): if the prescription shows a child, pregnancy, kidney or liver disease, call read_leaflet for what matters.
Last step: call finish. For each line write what the medicine is for, in plain words (max 12 words) in English and in Bangla,
   using only the leaflet text the tools returned. Then a short summary for the family (2-3 sentences) in English and in Bangla:
   what the medicines are for and any clash found. Do not write any money amounts: the screen shows the totals.
Rules: never invent a medicine, price, dose, clash or leaflet sentence. Never tell anyone to stop or change a medicine;
for any switch or clash say to ask their doctor or pharmacist. Keep Bangla simple and natural.`;

const toRow = (m: Medicine): MedRow => ({
  id: m.id,
  brand: m.brand,
  form: m.form,
  generic: m.generic,
  strength: m.strength,
  company: m.company,
  unitPrice: m.unitPrice,
  unitLabel: m.unitLabel,
});

const UNIT_DOSED = /^(tablet|capsule|sachet|vial|ampoule|suppository|unit|piece|strip|tab|cap)/i;

/** Course cost from the line as written: numbers come from the data and the dose, never from the model. */
export function courseFor(line: RxLine, med: Medicine, cheapest: Medicine | undefined): Course {
  const price = med.unitPrice;
  const cheap = cheapest?.unitPrice ?? price;
  const days = line.days ?? (line.continuing ? CONTINUING_DAYS : null);
  if (!UNIT_DOSED.test(med.unitLabel)) {
    // syrups, creams, drops: one pack as prescribed
    return {
      units: 1,
      days,
      prescribed: price,
      cheapest: cheap,
      basis: `one ${med.unitLabel || "pack"}`,
    };
  }
  const perDay = line.perDay || (line.asNeeded ? 1 : 0);
  if (!perDay || days === null) {
    return { units: 0, days, prescribed: null, cheapest: null, basis: "dose or days not written" };
  }
  const units = perDay * days;
  const round = (x: number | null) => (x === null ? null : Math.round(x * units * 100) / 100);
  const each = line.asNeeded ? `up to ${perDay} a day` : `${perDay} a day`;
  const span = line.days === null && line.continuing ? `${CONTINUING_DAYS} days (continuing)` : `${days} days`;
  return { units, days, prescribed: round(price), cheapest: round(cheap), basis: `${each} for ${span}` };
}

export function clashSentences(meds: Map<number, Medicine>): Clash[] {
  const lineOf = new Map<number, number>();
  for (const [line, m] of meds) lineOf.set(m.id, line);
  const list = [...meds.values()];
  const out: Clash[] = [];
  for (const d of findDuplicates(list)) {
    const [a, b] = d.meds;
    out.push({
      kind: "duplicate",
      lines: [lineOf.get(a.id)!, lineOf.get(b.id)!],
      ingredient: d.ingredient,
      en: `${a.brand} and ${b.brand} both contain ${d.ingredient}.`,
      bn: `${a.brand} আর ${b.brand}, দুটোতেই ${d.ingredient} আছে।`,
    });
  }
  const seen = new Set<string>();
  for (const x of findInteractions(list)) {
    const key = [x.a.id, x.b.id].sort().join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: "interaction",
      lines: [lineOf.get(x.a.id)!, lineOf.get(x.b.id)!],
      ingredient: x.matched,
      en: `The ${x.a.generic} leaflet warns about ${x.matched}, which is in ${x.b.brand}.`,
      bn: `${x.a.brand}-এর লিফলেটে ${x.matched} নিয়ে সতর্কতা আছে, যা ${x.b.brand}-এ আছে।`,
      quote: x.snippet,
      source: x.source,
    });
  }
  return out;
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toBnDigits = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
const taka = (x: number) => Math.round(x).toLocaleString("en-US");

/** Drops any sentence where the model wrote money, then adds the totals computed from the data. */
export function withTotals(en: string, bn: string, t: Totals): { en: string; bn: string } {
  const money = /৳|টাকা|\btk\b|\btaka\b|\bBDT\b/i;
  const keep = (text: string, split: RegExp) =>
    text
      .split(split)
      .map((x) => x.trim())
      .filter((x) => x && !money.test(x))
      .join(" ");
  let outEn = keep(en, /(?<=[.!?])\s+/);
  let outBn = keep(bn, /(?<=[।!?])\s+/);
  if (t.priced > 0 && t.cheapest < t.prescribed) {
    outEn += ` The same medicines cost ৳${taka(t.cheapest)} at the lowest price instead of ৳${taka(t.prescribed)}.`;
    outBn += ` একই ওষুধ সবচেয়ে কম দামে কিনলে খরচ ৳${toBnDigits(taka(t.prescribed))}-এর বদলে ৳${toBnDigits(taka(t.cheapest))}।`;
  }
  return { en: outEn.trim(), bn: outBn.trim() };
}

const lineSchema = z.object({
  n: z.number().int().describe("line number, 1-based, in order"),
  raw: z.string().describe("the line exactly as written, Bangla kept as Bangla"),
  form: z.string().describe("Tab, Cap, Syp, Susp, Inj, Drop, Cream... as written, or empty"),
  name: z.string().describe("brand or generic name as written"),
  strength: z.string().describe("e.g. 20mg, or empty"),
  dose_text: z.string().describe("dose as written, e.g. 1+0+1, or '1 when in pain'"),
  morning: z.number(),
  noon: z.number(),
  night: z.number(),
  days: z.number().nullable().describe("number of days, null if not written"),
  continuing: z.boolean().describe("true for চলবে / continue / long-term"),
  as_needed: z.boolean().describe("true for when needed / ব্যথা হলে / জ্বর হলে"),
  timing: z.enum(["before_food", "after_food", "with_food", "unspecified"]),
  box_2d: z.array(z.number()).length(4).nullable().describe("[ymin, xmin, ymax, xmax] 0-1000 around the line and its dose"),
});

export interface RunOptions {
  image: Uint8Array;
  mediaType: string;
  /** One or more Gemini keys; steps rotate across them to stay inside per-key rate limits. */
  apiKeys: string[];
  emit: (e: RunEvent) => void;
  signal?: AbortSignal;
}

/** Runs the agent once. Emits events as it goes; resolves when finished or failed. */
let rotation = 0;
export async function runAgent(opts: RunOptions): Promise<void> {
  const offset = rotation++;
  try {
    await runWith(PRIMARY_MODEL, opts, offset);
  } catch (err) {
    if ((err as { likhloStarted?: boolean }).likhloStarted) throw err;
    // the primary model was busy before anything was shown: try the fallback once
    await runWith(FALLBACK_MODEL, opts, offset + 1);
  }
}

async function runWith(modelId: string, { image, mediaType, apiKeys, emit, signal }: RunOptions, offset: number): Promise<void> {
  const t0 = Date.now();
  const at = () => Date.now() - t0;
  const providers = apiKeys.map((apiKey) => createGoogle({ apiKey }));
  const modelFor = (stepNumber: number) => providers[(offset + stepNumber) % providers.length](modelId);

  const lines = new Map<number, RxLine>();
  const candidates = new Map<number, Set<number>>();
  const chosen = new Map<number, Medicine>();
  const matches = new Map<number, Match>();
  let clashes: Clash[] | null = null;
  let stepId = 0;
  let started = false;
  let finished = false;
  const step = (tool: string, title: string, detail: string, lineNums: number[], ms: number) => {
    const s: Step = { id: ++stepId, tool, title, detail, lines: lineNums, ms };
    emit({ t: "step", at: at(), step: s });
  };
  const timed = async <T,>(fn: () => T | Promise<T>) => {
    const s = Date.now();
    const v = await fn();
    return [v, Date.now() - s] as const;
  };
  const byId = new Map<number, Medicine>();

  /** Same-medicine brands and the course cost for one chosen line (data only). */
  const priceLine = (line: number) => {
    const med = chosen.get(line);
    const rx = lines.get(line);
    if (!med || !rx) return null;
    const t = Date.now();
    const cheaper = findCheaper(med, 5);
    const equivalents = findEquivalents(med).length;
    const course = courseFor(rx, med, cheaper[0]);
    const m: Match = { ...matches.get(line)!, line, equivalents, cheaper: cheaper.map(toRow), course };
    matches.set(line, m);
    emit({ t: "match", at: at(), match: m });
    const best = cheaper[0];
    step(
      "find_cheaper",
      `Compared ${equivalents} brands of ${med.generic} ${med.strength}`,
      best
        ? `${med.brand} ৳${med.unitPrice} per ${med.unitLabel}; ${best.brand} ৳${best.unitPrice}`
        : `${med.brand} is already the lowest price (৳${med.unitPrice ?? "?"})`,
      [line],
      Date.now() - t,
    );
    return {
      prescribed: `${med.brand} ৳${med.unitPrice} per ${med.unitLabel}`,
      same_medicine_brands: equivalents,
      cheapest: cheaper.slice(0, 3).map((c) => `${c.brand} (${c.company}) ৳${c.unitPrice}`),
      course: course.basis,
      course_cost: { prescribed: course.prescribed, cheapest: course.cheapest },
    };
  };

  /** Shared ingredients and leaflet interactions across every chosen line (data only). */
  const runClashes = () => {
    const t = Date.now();
    const found = clashSentences(chosen);
    clashes = found;
    emit({ t: "clashes", at: at(), clashes: found });
    const pairs = (chosen.size * (chosen.size - 1)) / 2;
    step(
      "check_clashes",
      `Checked ${pairs} pair${pairs === 1 ? "" : "s"} for clashes`,
      found.length ? found.map((c) => c.en).join("\n") : "No shared ingredients; no leaflet names another medicine here.",
      [...new Set(found.flatMap((c) => c.lines))],
      Date.now() - t,
    );
    return found.map((c) => ({ kind: c.kind, lines: c.lines, what: c.en, leaflet_sentence: c.quote ?? null }));
  };

  const tools = {
    record_lines: tool({
      description: "Record every medicine line read from the Rx section of the photo. Call once, first.",
      inputSchema: z.object({
        patient: z.string().describe("patient name and age if written, else empty"),
        doctor: z.string().describe("doctor name if printed, else empty"),
        lines: z.array(lineSchema),
      }),
      execute: async ({ patient, doctor, lines: input }) => {
        started = true;
        const out: RxLine[] = input.map((l) => {
          const parsed = /[+\-]/.test(l.dose_text) ? parseDose(l.dose_text.replace(/[^\d০-৯½¼¾+\-.\s]/g, "").trim()) : null;
          const slots = parsed
            ? { morning: parsed.morning, noon: parsed.noon, night: parsed.night + parsed.evening }
            : { morning: l.morning, noon: l.noon, night: l.night };
          const perDay = parsed ? parsed.perDay : l.morning + l.noon + l.night;
          const b = l.box_2d;
          return {
            n: l.n,
            raw: l.raw,
            form: l.form,
            name: l.name,
            strength: l.strength,
            doseText: l.dose_text,
            slots,
            perDay,
            days: l.days,
            continuing: l.continuing,
            asNeeded: l.as_needed,
            timing: l.timing as Timing,
            box: b && b.length === 4 ? [b[0], b[1], b[2], b[3]] : null,
          };
        });
        for (const l of out) lines.set(l.n, l);
        emit({ t: "lines", at: at(), lines: out, patient: patient || undefined, doctor: doctor || undefined });
        emit({ t: "status", at: at(), status: "working", model: modelId });
        step(
          "record_lines",
          `Read ${out.length} medicine line${out.length === 1 ? "" : "s"} from the photo`,
          out.map((l) => `${l.n}. ${l.raw}`).join("\n"),
          out.map((l) => l.n),
          0,
        );
        return { recorded: out.map((l) => ({ n: l.n, name: l.name, strength: l.strength, form: l.form, perDay: l.perDay })) };
      },
    }),

    search_medicine: tool({
      description:
        "Search 21,714 Bangladeshi medicine brands by the name as written (fuzzy: handles spelling slips). Returns up to 6 candidates.",
      inputSchema: z.object({
        line: z.number().int(),
        query: z.string().describe("brand or generic name, with strength if written, e.g. 'Seclo 20'"),
        form: z.string().optional().describe("Tab, Cap, Syp..."),
      }),
      execute: async ({ line, query, form }) => {
        const [hits, ms] = await timed(() => searchBrands(query, { form, limit: 6 }));
        const set = candidates.get(line) ?? new Set<number>();
        for (const h of hits) {
          set.add(h.med.id);
          byId.set(h.med.id, h.med);
        }
        candidates.set(line, set);
        const top = hits[0]?.med;
        step(
          "search_medicine",
          `Searched “${query}”`,
          top ? `${hits.length} candidates; closest: ${top.brand} ${top.strength} (${top.form})` : "no brand found",
          [line],
          ms,
        );
        return {
          line,
          candidates: hits.map((h) => ({
            id: h.med.id,
            brand: h.med.brand,
            form: h.med.form,
            generic: h.med.generic,
            strength: h.med.strength,
            company: h.med.company,
            score: Math.round(h.score * 100) / 100,
          })),
        };
      },
    }),

    choose_medicine: tool({
      description: "Choose which candidate the line means. id must come from search_medicine results for this line, or null.",
      inputSchema: z.object({
        line: z.number().int(),
        id: z.number().int().nullable(),
        why: z.string().describe("one short reason, e.g. 'brand and 20 mg capsule match'"),
      }),
      execute: async ({ line, id, why }) => {
        if (id !== null && !candidates.get(line)?.has(id)) {
          return { error: "That id was not among this line's search results. Search again or choose null." };
        }
        const med = id === null ? null : byId.get(id)!;
        if (med) chosen.set(line, med);
        const info = med ? genericInfo(med.generic) : null;
        const m: Match = { line, med: med ? toRow(med) : null, why, drugClass: info?.drugClass };
        matches.set(line, m);
        emit({ t: "match", at: at(), match: m });
        step(
          "choose_medicine",
          med ? `Line ${line} is ${med.brand} ${med.strength}` : `Line ${line}: no match`,
          med ? `${med.generic} · ${med.form} · ${med.company}. ${why}` : why,
          [line],
          0,
        );
        const pricing = med ? priceLine(line) : null;
        const allDone = lines.size > 0 && [...lines.keys()].every((n) => matches.has(n));
        const clashReport = allDone && clashes === null && chosen.size > 1 ? runClashes() : undefined;
        return med
          ? {
              line,
              chosen: `${med.brand} ${med.strength} ${med.form}`,
              generic: med.generic,
              drugClass: info?.drugClass ?? "",
              leaflet_indication: info?.indication ?? "",
              leaflet_uses: info?.uses ?? "",
              pricing,
              ...(clashReport ? { clashes_across_prescription: clashReport } : {}),
            }
          : { line, chosen: null, ...(clashReport ? { clashes_across_prescription: clashReport } : {}) };
      },
    }),

    check_clashes: tool({
      description:
        "Re-run the clash check across every chosen medicine: shared ingredients (double dose) and interactions named in each generic's leaflet.",
      inputSchema: z.object({}),
      execute: async () => ({ clashes: runClashes() }),
    }),

    read_leaflet: tool({
      description: "Read one section of a generic's leaflet (monograph).",
      inputSchema: z.object({
        line: z.number().int(),
        section: z.enum(["dosage", "side_effects", "contraindications", "pregnancy", "uses"]),
      }),
      execute: async ({ line, section }) => {
        const med = chosen.get(line);
        const info = med ? genericInfo(med.generic) : null;
        if (!med || !info) return { line, text: null };
        const text =
          section === "dosage"
            ? info.dosage
            : section === "side_effects"
              ? info.sideEffects
              : section === "contraindications"
                ? info.contraindications
                : section === "pregnancy"
                  ? info.pregnancy
                  : info.uses;
        step("read_leaflet", `Read the ${section.replace("_", " ")} section for ${med.generic}`, text.slice(0, 280), [line], 0);
        return { line, generic: med.generic, section, text };
      },
    }),

    finish: tool({
      description: "Finish with plain explanations and the family summary. Call once, last.",
      inputSchema: z.object({
        lines: z.array(z.object({ line: z.number().int(), for_en: z.string(), for_bn: z.string() })),
        summary_en: z.string(),
        summary_bn: z.string(),
      }),
      execute: async ({ lines: expl, summary_en, summary_bn }) => {
        if (clashes === null && chosen.size > 1) {
          clashes = clashSentences(chosen);
          emit({ t: "clashes", at: at(), clashes });
        }
        for (const e of expl) {
          const m = matches.get(e.line);
          if (m) matches.set(e.line, { ...m, forEn: e.for_en.trim(), forBn: e.for_bn.trim() });
        }
        // any line the agent forgot to price is priced here, from the data
        for (const [line, med] of chosen) {
          const m = matches.get(line)!;
          if (!m.course && lines.get(line)) {
            const cheaper = findCheaper(med, 5);
            matches.set(line, {
              ...m,
              cheaper: cheaper.map(toRow),
              equivalents: findEquivalents(med).length,
              course: courseFor(lines.get(line)!, med, cheaper[0]),
            });
          }
        }
        const all = [...matches.values()].sort((a, b) => a.line - b.line);
        const priced = all.filter((m) => m.course?.prescribed != null && m.course?.cheapest != null);
        const sum = (k: "prescribed" | "cheapest") =>
          Math.round(priced.reduce((s, m) => s + (m.course![k] as number), 0) * 100) / 100;
        const totals: Totals = {
          prescribed: sum("prescribed"),
          cheapest: sum("cheapest"),
          priced: priced.length,
          basis: "for the days written; medicines to continue are counted for 30 days",
        };
        finished = true;
        const summary = withTotals(summary_en, summary_bn, totals);
        step("finish", "Wrote the plan and the summary", summary.en, all.map((m) => m.line), 0);
        emit({ t: "done", at: at(), matches: all, totals, summary });
        return { ok: true };
      },
    }),
  };

  emit({ t: "status", at: at(), status: "reading", model: modelId });

  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "Here is the prescription. Read it and do the full check." },
        { type: "file", mediaType, data: image },
      ],
    },
  ];

  const result = streamText({
    model: modelFor(0),
    prepareStep: ({ stepNumber }) => ({ model: modelFor(stepNumber) }),
    system: SYSTEM,
    messages,
    tools,
    stopWhen: [isStepCount(MAX_STEPS), hasToolCall("finish")],
    maxRetries: 1,
    timeout: RUN_TIMEOUT_MS,
    abortSignal: signal,
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
  });

  try {
    for await (const part of result.stream) {
      if (part.type === "error") throw part.error;
    }
  } catch (err) {
    if (started) Object.assign(err as object, { likhloStarted: true });
    throw err;
  }

  if (!started) {
    emit({
      t: "error",
      at: at(),
      code: "unreadable",
      message: "Couldn't find medicine lines in this photo. Try a flatter, brighter shot of the whole prescription.",
    });
    return;
  }
  if (!finished) {
    // the loop stopped early (step cap): close the run from what was found, numbers from the data
    await tools.finish.execute!(
      { lines: [], summary_en: "Here is what Likhlo could check in this prescription.", summary_bn: "প্রেসক্রিপশনে যা মিলিয়ে দেখা গেছে, তা নিচে আছে।" },
      { toolCallId: "auto-finish", messages: [] } as never,
    );
  }
}
