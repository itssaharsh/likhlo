import Reader from "@/components/Reader";
import type { RecordedRun } from "@/lib/run-types";
import rahima from "../../public/runs/rahima.json";
import karim from "../../public/runs/karim.json";
import arif from "../../public/runs/arif.json";

const samples = [rahima, karim, arif] as unknown as RecordedRun[];

// numbers for the impact band, computed from the recorded readings
const doneOf = (r: RecordedRun) => r.events.find((e) => e.t === "done") as Extract<RecordedRun["events"][number], { t: "done" }>;
const karimTotals = doneOf(samples[1]).totals;
const karimYear = Math.round((karimTotals.prescribed - karimTotals.cheapest) * 12);
const karimPct = Math.round(((karimTotals.prescribed - karimTotals.cheapest) / karimTotals.prescribed) * 100);
const seclo = doneOf(samples[0]).matches.find((m) => m.med?.brand === "Seclo");
const secloBrands = seclo?.equivalents ?? 0;
const secloLow = seclo?.cheaper?.[0]?.unitPrice ?? seclo?.med?.unitPrice ?? 0;
const secloHigh = seclo?.med?.unitPrice ?? 0;

export default function Home() {
  return (
    <>
      <Reader samples={samples} />

      <section className="band">
        <div className="section">
          <h2>
            What it adds up to
            <small>Every number here comes from the medicine data and the readings above.</small>
          </h2>
          <div className="impact">
            <div>
              <span className="k">Abdul Karim&apos;s monthly list</span>
              <span className="n num">৳{karimYear.toLocaleString("en-US")}<small> a year</small></span>
              <span className="l">
                saved on the same diabetes and blood-pressure medicines: {karimPct}% less, every month, with the same generic,
                strength and form.
              </span>
            </div>
            <div>
              <span className="n num">21,714</span>
              <span className="l">Bangladeshi medicine brands, each with its price</span>
            </div>
            <div>
              <span className="n num">{secloBrands}</span>
              <span className="l">brands make the same omeprazole 20 mg capsule as Seclo (৳{secloHigh} each); the lowest is ৳{secloLow}</span>
            </div>
            <div>
              <span className="n num">1,570</span>
              <span className="l">medicine leaflets read for double doses and warnings</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="site-foot">
        <div className="in">
          <div>
            <div className="brand">
              <svg viewBox="0 0 48 48" role="img" aria-label="Likhlo">
                <title>Likhlo</title>
                <rect x="2" y="2" width="44" height="44" rx="12" fill="oklch(46% 0.1 172)" />
                <path d="M24 12v24M12 24h24" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
                <path d="M31 33l7 7" stroke="oklch(85% 0.12 80)" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <b>Likhlo</b>
            </div>
            <p>
              Prices and leaflets come from a public list of 21,714 Bangladeshi medicines (MedEx-derived). The sample
              prescriptions are made up. Likhlo explains a prescription; your doctor or pharmacist decides any change.
            </p>
          </div>
          <ul>
            <li><a href="https://github.com/itssaharsh/likhlo">Code on GitHub</a></li>
            <li><a href="https://github.com/itssaharsh/likhlo#whats-real">What&apos;s real and what&apos;s simulated</a></li>
            <li><a href="https://huggingface.co/datasets/ArnobBot/Medicine-Dataset-of-Bangladesh">The medicine data</a></li>
          </ul>
        </div>
      </footer>
    </>
  );
}
