// Shapes shared by the agent (server), the recorded runs and the screen.
// A run is a list of events; the screen is a function of the events seen so far,
// so a live run and a replayed recording draw the same way.

export type Timing = "before_food" | "after_food" | "with_food" | "unspecified";

export interface Slots {
  morning: number;
  noon: number;
  night: number;
}

/** One handwritten medicine line, as the agent read it off the photo. */
export interface RxLine {
  n: number;
  raw: string;
  form: string;
  name: string;
  strength: string;
  doseText: string;
  slots: Slots;
  perDay: number;
  days: number | null;
  continuing: boolean;
  asNeeded: boolean;
  timing: Timing;
  /** [ymin, xmin, ymax, xmax], 0-1000 of the image. */
  box: [number, number, number, number] | null;
}

export interface MedRow {
  id: number;
  brand: string;
  form: string;
  generic: string;
  strength: string;
  company: string;
  unitPrice: number | null;
  unitLabel: string;
}

export interface Course {
  /** Units counted (tablets, capsules, bottles). */
  units: number;
  days: number | null;
  prescribed: number | null;
  cheapest: number | null;
  /** How the count was made, in words: "2 a day for 5 days". */
  basis: string;
}

export interface Match {
  line: number;
  med: MedRow | null;
  why: string;
  drugClass?: string;
  forEn?: string;
  forBn?: string;
  equivalents?: number;
  cheaper?: MedRow[];
  course?: Course;
}

export interface Clash {
  kind: "duplicate" | "interaction";
  lines: [number, number];
  ingredient: string;
  en: string;
  bn: string;
  /** Exact sentence from the medicine leaflet (interactions only). */
  quote?: string;
  source?: string;
}

export interface Step {
  id: number;
  tool: string;
  title: string;
  detail: string;
  lines: number[];
  ms: number;
}

export interface Totals {
  prescribed: number;
  cheapest: number;
  /** Lines that could be priced. */
  priced: number;
  basis: string;
}

export type RunEvent =
  | { t: "status"; at: number; status: "reading" | "working"; model?: string }
  /** The model in use was busy; the reading starts again on another one. */
  | { t: "restart"; at: number; model: string }
  | { t: "lines"; at: number; lines: RxLine[]; patient?: string; doctor?: string }
  | { t: "step"; at: number; step: Step }
  | { t: "match"; at: number; match: Match }
  | { t: "clashes"; at: number; clashes: Clash[] }
  | { t: "done"; at: number; matches: Match[]; totals: Totals; summary: { en: string; bn: string } }
  | { t: "error"; at: number; code: "unreadable" | "busy" | "too_large" | "limit" | "failed"; message: string };

export interface RecordedRun {
  id: string;
  title: string;
  recordedAt: string;
  model: string;
  image: string;
  imageSize: [number, number];
  events: RunEvent[];
}

export interface RunState {
  status: "idle" | "reading" | "working" | "done" | "error";
  model?: string;
  lines: RxLine[];
  patient?: string;
  doctor?: string;
  matches: Record<number, Match>;
  clashes: Clash[];
  steps: Step[];
  totals?: Totals;
  summary?: { en: string; bn: string };
  error?: { code: string; message: string };
  elapsed: number;
}

export const emptyRun = (): RunState => ({ status: "idle", lines: [], matches: {}, clashes: [], steps: [], elapsed: 0 });

export function applyEvent(s: RunState, e: RunEvent): RunState {
  const next: RunState = { ...s, elapsed: Math.max(s.elapsed, e.at) };
  switch (e.t) {
    case "status":
      return { ...next, status: e.status, model: e.model ?? s.model };
    case "restart":
      return { ...emptyRun(), status: "reading", model: e.model, elapsed: s.elapsed };
    case "lines":
      return { ...next, lines: e.lines, patient: e.patient, doctor: e.doctor };
    case "step":
      return { ...next, steps: [...s.steps, e.step] };
    case "match":
      return { ...next, matches: { ...s.matches, [e.match.line]: { ...s.matches[e.match.line], ...e.match } } };
    case "clashes":
      return { ...next, clashes: e.clashes };
    case "done": {
      const matches = { ...s.matches };
      for (const m of e.matches) matches[m.line] = { ...matches[m.line], ...m };
      return { ...next, status: "done", matches, totals: e.totals, summary: e.summary };
    }
    case "error":
      return { ...next, status: "error", error: { code: e.code, message: e.message } };
  }
}

export const replayState = (events: RunEvent[], upTo = Infinity): RunState =>
  events.filter((e) => e.at <= upTo).reduce(applyEvent, emptyRun());
