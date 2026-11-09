import type { Metadata, Viewport } from "next";
import { Anek_Bangla, Caveat, Hind_Siliguri } from "next/font/google";
import "./globals.css";

const display = Anek_Bangla({
  variable: "--font-display",
  subsets: ["bengali", "latin"],
  axes: ["wdth"],
});

const body = Hind_Siliguri({
  variable: "--font-body",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600"],
});

const pen = Caveat({
  variable: "--font-pen",
  subsets: ["latin"],
  weight: ["600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://likhlo-bd.vercel.app"),
  title: "Likhlo: what did the doctor write, and is there a cheaper same medicine?",
  description:
    "Snap a prescription. Likhlo reads every line, explains each medicine in Bangla and English, warns when two medicines clash, and finds the same medicine for less among 21,714 Bangladeshi brands.",
  openGraph: {
    title: "Likhlo: ডাক্তার কী লিখলো?",
    description: "Read any prescription, catch double doses, and pay less for the same medicine.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Likhlo reading a prescription: ৳409 instead of ৳612" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#f3faf7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${pen.variable}`}>
      <body>{children}</body>
    </html>
  );
}
