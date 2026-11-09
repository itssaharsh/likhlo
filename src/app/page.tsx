import Reader from "@/components/Reader";
import type { RecordedRun } from "@/lib/run-types";
import rahima from "../../public/runs/rahima.json";
import karim from "../../public/runs/karim.json";
import arif from "../../public/runs/arif.json";

const samples = [rahima, karim, arif] as unknown as RecordedRun[];

export default function Home() {
  return (
    <>
      <Reader samples={samples} />

      <section className="band">
        <div className="section">
          <h2>
            How Likhlo reads a prescription
            <small>Three steps, all on the photo you took.</small>
          </h2>
          <div className="how">
            <figure>
              <div style={{ background: "url(/samples/rahima.jpg) 62% 36% / 190% auto no-repeat" }} aria-hidden="true">
                <span className="hl" style={{ top: "38%", left: "18%", width: "70%", height: "19%" }} />
                <span className="pin done" style={{ top: "47%", left: "13%" }}>1</span>
              </div>
              <figcaption>
                <b>1. It reads the handwriting</b>
                <span>Gemini finds each medicine line, the 1+0+1 dose, before or after food, and how many days.</span>
              </figcaption>
            </figure>
            <figure>
              <div style={{ display: "grid", placeItems: "center", padding: 20 }} aria-hidden="true">
                <div className="card" style={{ width: "100%", padding: "14px 16px" }}>
                  <div style={{ fontWeight: 600 }}>Seclo 20 mg <span style={{ color: "var(--muted)", fontWeight: 400 }}>· Omeprazole</span></div>
                  <div style={{ color: "var(--muted)", fontSize: 14 }}>123 brands make this same capsule</div>
                  <div className="num" style={{ marginTop: 8 }}>
                    <span style={{ textDecoration: "line-through", color: "var(--faint)" }}>৳6 each</span>{" "}
                    <b style={{ color: "var(--accent-ink)" }}>৳3 each</b> · G-Omeprazole
                  </div>
                </div>
              </div>
              <figcaption>
                <b>2. It finds the same medicine for less</b>
                <span>Same generic, same strength, same form, from 21,714 Bangladeshi brands with their prices.</span>
              </figcaption>
            </figure>
            <figure>
              <div style={{ display: "grid", placeItems: "center", padding: 20 }} aria-hidden="true">
                <div className="clash" style={{ width: "100%", animation: "none" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4.5M12 17.5v.01" /></svg>
                  <div>
                    <b>Napa Extend and Ace Plus both contain paracetamol.</b>
                    <small>Taking both can double the dose.</small>
                  </div>
                </div>
              </div>
              <figcaption>
                <b>3. It warns you when medicines clash</b>
                <span>Shared ingredients, and warnings quoted word for word from each medicine&apos;s leaflet.</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <footer className="foot">
        <span>
          Prices and leaflets come from a public list of 21,714 Bangladeshi medicines (MedEx-derived). The sample prescriptions
          are made up. Likhlo explains; your doctor or pharmacist decides any change.
        </span>
        <span>
          <a href="https://github.com/itssaharsh/likhlo">Code on GitHub</a> ·{" "}
          <a href="https://huggingface.co/datasets/ArnobBot/Medicine-Dataset-of-Bangladesh">The medicine data</a>
        </span>
      </footer>
    </>
  );
}
