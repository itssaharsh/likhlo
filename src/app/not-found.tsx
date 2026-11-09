import Link from "next/link";

export default function NotFound() {
  return (
    <main className="section" style={{ minHeight: "70vh", display: "grid", placeContent: "center", textAlign: "center" }}>
      <h1 className="q">
        <span className="q-bn" lang="bn">এই পাতাটি নেই</span>
        <span className="q-en">There&apos;s nothing at this address.</span>
      </h1>
      <p className="lede" style={{ margin: "16px auto 24px" }}>Read a prescription instead.</p>
      <p>
        <Link className="btn btn-primary btn-lg" href="/">Back to Likhlo</Link>
      </p>
    </main>
  );
}
