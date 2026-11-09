"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyEvent, emptyRun, replayState, type RecordedRun, type RunEvent, type RunState } from "@/lib/run-types";
import Stage from "./Stage";
import Results, { Verdict } from "./Results";
import DayPlan from "./DayPlan";
import MedicineSearch from "./MedicineSearch";
import StepLog from "./StepLog";
import MedSheet from "./MedSheet";
import { SlipIcon, SlipSheet } from "./PharmacySlip";
import { bnDigits, type Lang } from "./format";
import { SAMPLE_TITLES, t } from "./i18n";

type Source =
  | { kind: "sample"; id: string; image: string; size: [number, number] }
  | { kind: "upload"; image: string; size: [number, number]; file: Blob };

type Mode = "recorded" | "replay" | "live";

const REPLAY_MAX_MS = 11000;

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dhaka" });

/** Shrinks a phone photo to at most 1600 px on its long side, as JPEG, before it is sent. */
async function prepareImage(file: File): Promise<{ blob: Blob; size: [number, number] }> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    if (blob) return { blob, size: [w, h] };
  } catch {
    /* the browser can't decode it (e.g. HEIC outside Safari): send it as it is */
  }
  return { blob: file, size: [3, 4] };
}

const ICON_CAMERA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

export default function Reader({ samples }: { samples: RecordedRun[] }) {
  const first = samples[0];
  const [source, setSource] = useState<Source>({ kind: "sample", id: first.id, image: first.image, size: first.imageSize });
  const [run, setRun] = useState<RunState>(() => replayState(first.events));
  const [mode, setMode] = useState<Mode>("recorded");
  const [lang, setLang] = useState<Lang>("en");
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const [openLine, setOpenLine] = useState<number | null>(null);
  const [landed, setLanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [liveAt, setLiveAt] = useState<string | undefined>(undefined);
  const timers = useRef<number[]>([]);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  /** Bumped by every new action, so a slower earlier action never overwrites a newer one. */
  const token = useRef(0);
  const uploadUrl = useRef<string | null>(null);

  const sample = useMemo(() => (source.kind === "sample" ? samples.find((s) => s.id === source.id) : undefined), [samples, source]);

  const stopAll = useCallback(() => {
    token.current++;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    abort.current?.abort();
    abort.current = null;
    audio.current?.pause();
    setListening(false);
    setSlipOpen(false);
  }, []);

  const replay = useCallback(
    (s: RecordedRun) => {
      stopAll();
      setSource({ kind: "sample", id: s.id, image: s.image, size: s.imageSize });
      setRun({ ...emptyRun(), status: "reading" });
      setMode("replay");
      setLanded(false);
      setNotice(null);
      const total = s.events.at(-1)?.at ?? 1;
      const k = Math.min(1, REPLAY_MAX_MS / total);
      for (const e of s.events) {
        timers.current.push(
          window.setTimeout(() => {
            setRun((r) => applyEvent(r, e));
            if (e.t === "done") setLanded(true);
          }, 350 + e.at * k),
        );
      }
    },
    [stopAll],
  );

  const showRecorded = useCallback(
    (s: RecordedRun, note: string | null = null) => {
      stopAll();
      setSource({ kind: "sample", id: s.id, image: s.image, size: s.imageSize });
      setRun(replayState(s.events));
      setMode("recorded");
      setLanded(true);
      setNotice(note);
    },
    [stopAll],
  );

  /** Runs the live agent on a photo, drawing each event as it arrives. */
  const readLive = useCallback(
    async (blob: Blob, next: Source) => {
      stopAll();
      const mine = token.current;
      setSource(next);
      setRun({ ...emptyRun(), status: "reading" });
      setMode("live");
      setLiveAt(new Date().toISOString());
      setLanded(false);
      setNotice(null);
      const ctrl = new AbortController();
      abort.current = ctrl;
      const form = new FormData();
      form.append("image", blob, "prescription.jpg");
      let gotBusy = false;
      let finished = false;
      const fail = (code: "failed" | "too_large", message: string) =>
        setRun((r) => applyEvent(r, { t: "error", at: r.elapsed, code, message }));
      try {
        const res = await fetch("/api/read", { method: "POST", body: form, signal: ctrl.signal });
        if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) {
          if (res.status === 413) fail("too_large", "That photo is too large. Try one under 4 MB.");
          else fail("failed", "Something went wrong while reading. Try again, or try a sample.");
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            let e: RunEvent;
            try {
              e = JSON.parse(line) as RunEvent;
            } catch {
              continue;
            }
            if (token.current !== mine) return;
            if (e.t === "done" || e.t === "error") finished = true;
            if (e.t === "error" && (e.code === "busy" || e.code === "limit")) gotBusy = true;
            setRun((r) => applyEvent(r, e));
            if (e.t === "done") setLanded(true);
          }
        }
        if (!finished && token.current === mine) fail("failed", "The reading stopped before it finished. Try again.");
      } catch (err) {
        if ((err as Error).name === "AbortError" || token.current !== mine) return;
        fail("failed", "The connection dropped. Try again.");
      }
      if (gotBusy && next.kind === "sample") {
        const s = samples.find((x) => x.id === next.id);
        if (s) showRecorded(s, `Live reading is busy right now. This is the ${dateOf(s.recordedAt)} reading of the same photo.`);
      }
    },
    [samples, showRecorded, stopAll],
  );

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setNotice("That isn't a photo. Try a JPG or PNG of the prescription.");
        return;
      }
      const mine = ++token.current;
      const { blob, size } = await prepareImage(file);
      if (token.current !== mine) return;
      if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
      const url = URL.createObjectURL(blob);
      uploadUrl.current = url;
      readLive(blob, { kind: "upload", image: url, size, file: blob });
    },
    [readLive],
  );

  const runSampleLive = useCallback(async () => {
    if (!sample) return;
    const mine = ++token.current;
    const blob = await (await fetch(sample.image)).blob();
    if (token.current !== mine) return;
    readLive(blob, { kind: "sample", id: sample.id, image: sample.image, size: sample.imageSize });
  }, [readLive, sample]);

  const listen = useCallback(async () => {
    if (listening) {
      audio.current?.pause();
      setListening(false);
      return;
    }
    let src: string | null = null;
    const mine = token.current;
    try {
      if (source.kind === "sample" && mode !== "live") src = `/runs/${source.id}-bn.mp3`;
      else if (run.summary) {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: run.summary.bn }),
        });
        if (res.ok) src = URL.createObjectURL(await res.blob());
      }
    } catch {
      src = null;
    }
    if (token.current !== mine) return;
    if (!src) {
      setNotice("Bangla audio is busy right now. Try again in a minute.");
      return;
    }
    audio.current?.pause();
    const a = new Audio(src);
    audio.current = a;
    a.onended = () => setListening(false);
    a.onerror = () => {
      setListening(false);
      setNotice("Bangla audio is busy right now. Try again in a minute.");
    };
    setListening(true);
    a.play().catch(() => setListening(false));
  }, [listening, mode, run.summary, source]);

  // deep links: ?sample=<id> opens that sample; ?state=empty|loading|error forces a state
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = samples.find((x) => x.id === p.get("sample"));
    const state = p.get("state");
    const t = window.setTimeout(() => {
      if (s) showRecorded(s);
      if (state === "loading") setRun({ ...replayState((s ?? first).events, 9000), status: "working" });
      if (state === "empty") setRun(emptyRun());
      if (state === "error")
        setRun({ ...emptyRun(), status: "error", error: { code: "unreadable", message: "Couldn't find medicine lines in this photo. Try a flatter, brighter shot of the whole prescription." } });
    }, 0);
    return () => window.clearTimeout(t);
  }, [first, samples, showRecorded]);

  useEffect(() => () => stopAll(), [stopAll]);

  // drag and drop a photo anywhere on the page
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      onFile(e.dataTransfer?.files?.[0]);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [onFile]);

  const working = run.status === "reading" || run.status === "working";
  const pick = () => fileInput.current?.click();

  const caption = (() => {
    if (notice) return <span>{notice}</span>;
    if (working)
      return (
        <>
          <span className="live-dot" aria-hidden="true" />
          <span>
            {run.status === "reading" ? t("readingPhoto", lang) : run.steps.at(-1)?.title ?? "Working…"}
            {mode === "replay" ? t("sped", lang) : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              if (mode === "replay" && sample) return showRecorded(sample);
              stopAll();
              setRun((r) => applyEvent(r, { t: "error", at: r.elapsed, code: "failed", message: "You stopped the reading. Lines read so far are shown." }));
            }}
          >
            {mode === "replay" ? t("skip", lang) : t("stop", lang)}
          </button>
        </>
      );
    if (run.status === "done" && mode !== "live" && sample)
      return (
        <>
          <span>
            {lang === "bn"
              ? `রেকর্ড করা পড়া · এজেন্টের ${bnDigits(run.steps.length)}টি ধাপ`
              : `Recorded reading, ${dateOf(sample.recordedAt)} · ${run.steps.length} agent steps`}
          </span>
          <button type="button" onClick={runSampleLive}>{t("readLive", lang)}</button>
        </>
      );
    if (run.status === "done" && mode === "live")
      return <span>Read live just now · {run.steps.length} agent steps · {(run.elapsed / 1000).toFixed(0)} s</span>;
    return null;
  })();

  const readAt = mode !== "live" && sample ? sample.recordedAt : liveAt;
  const canSlip = run.status === "done" && run.lines.length > 0;
  const openSlip = () => setSlipOpen(true);

  const matchOpen = openLine !== null ? run.matches[openLine] ?? null : null;
  const lineOpen = openLine !== null ? run.lines.find((l) => l.n === openLine) ?? null : null;

  return (
    <>
      <header className="top">
        <Link className="wordmark" href="/" aria-label="Likhlo home">
          <svg viewBox="0 0 48 48" role="img" aria-label="Likhlo">
            <title>Likhlo</title>
            <rect x="2" y="2" width="44" height="44" rx="12" fill="oklch(46% 0.1 172)" />
            <path d="M24 12v24M12 24h24" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
            <path d="M31 33l7 7" stroke="oklch(85% 0.12 80)" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <b>Likhlo</b>
          <span lang="bn">লিখলো</span>
        </Link>
        <nav>
          <a href="#plan" className="hide-sm" lang={lang}>{t("yourDay", lang)}</a>
          <a href="#steps" className="hide-sm" lang={lang}>{t("agentSteps", lang)}</a>
          <a href="https://github.com/itssaharsh/likhlo" className="hide-sm" lang={lang}>{t("code", lang)}</a>
          <div className="lang lang-top" role="group" aria-label="Language">
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
            <button type="button" aria-pressed={lang === "bn"} onClick={() => setLang("bn")} lang="bn">বাংলা</button>
          </div>
        </nav>
      </header>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <main className="hero">
        <Stage
          image={source.image}
          size={source.size}
          run={run}
          focusLine={focusLine}
          onFocusLine={setFocusLine}
          onOpenLine={setOpenLine}
          caption={caption}
          dragging={dragging}
        />
        <div className="side-head">
          <h1 className="q">
            <span className="q-bn" lang="bn">ডাক্তার কী লিখলো?</span>
            <span className="q-en" lang={lang}>{t("subline", lang)}</span>
          </h1>
          <p className="lede" lang={lang}>{t("lede", lang)}</p>
          <div className="actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={pick} lang={lang}>
              {ICON_CAMERA}
              {t("read", lang)}
            </button>
            <span className="or" lang={lang}>{t("orSample", lang)}</span>
          </div>
          <div className="try" role="group" aria-label="Try a sample prescription">
            {samples.map((s) => (
              <button
                key={s.id}
                type="button"
                className="btn btn-quiet"
                aria-pressed={source.kind === "sample" && source.id === s.id}
                onClick={() => replay(s)}
                lang={lang}
              >
                {SAMPLE_TITLES[s.id]?.[lang] ?? s.title}
              </button>
            ))}
          </div>
          <Verdict run={run} lang={lang} landed={landed} />
        </div>
        <div className="side-results">
          <Results
            run={run}
            lang={lang}
            setLang={setLang}
            focusLine={focusLine}
            onFocusLine={setFocusLine}
            onOpenLine={setOpenLine}
            onListen={run.summary ? listen : undefined}
            listening={listening}
            onSlip={canSlip ? openSlip : undefined}
          />
          {run.status === "error" && (
            <div className="try" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={pick}>{ICON_CAMERA}Try another photo</button>
              <button type="button" className="btn btn-quiet" onClick={() => showRecorded(first)}>See a sample reading</button>
            </div>
          )}
        </div>
      </main>

      <section id="search" className="band msearch-band" aria-labelledby="search-title">
        <div className="section">
          <h2 id="search-title">
            Already know the medicine? · <span lang="bn">ওষুধের নাম জানেন?</span>
            <small>{lang === "bn" ? "পাতা বা বাক্সে লেখা ব্র্যান্ডের নাম লিখুন: দাম আর একই ওষুধ কম দামে দেখুন।" : "Type the brand on the strip or the box to see its price and the same medicine for less."}</small>
          </h2>
          <MedicineSearch lang={lang} />
        </div>
      </section>

      <section id="plan" className="band">
        <div className="section">
          <h2>
            <span lang="bn">আপনার দিন</span> · Your day
            <small lang={lang}>{t("planSub", lang)}</small>
          </h2>
          {run.lines.length ? <DayPlan run={run} lang={lang} /> : <p className="intro" lang={lang}>{t("planEmpty", lang)}</p>}
          {canSlip && (
            <div className="plan-actions">
              <button type="button" className="btn btn-primary" onClick={openSlip}>
                <SlipIcon />
                Save for the pharmacy
              </button>
              <span>Each medicine, its dose, the lowest price and every warning on one card for the pharmacy counter or WhatsApp.</span>
            </div>
          )}
        </div>
      </section>

      <section id="steps" className="hood">
        <div className="section">
          <h2>
            <span lang={lang}>{t("agentSteps", lang)}</span>
            <small lang={lang}>{t("stepsSub", lang)}</small>
          </h2>
          <StepLog run={run} onFocusLine={setFocusLine} />
        </div>
      </section>

      <SlipSheet open={slipOpen} run={run} readAt={readAt} lang={lang} setLang={setLang} onClose={() => setSlipOpen(false)} />
      <MedSheet match={matchOpen} line={lineOpen} lang={lang} clashes={run.clashes} matches={run.matches} onClose={() => setOpenLine(null)} />
    </>
  );
}
