import type { Metadata, Viewport } from "next";
import { Anek_Bangla, Hind_Siliguri } from "next/font/google";
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://likhlo.vercel.app"),
  title: "Likhlo: what did the doctor write, and is there a cheaper same medicine?",
  description:
    "Snap a prescription. Likhlo reads every line, explains each medicine in Bangla and English, warns when two medicines clash, and finds the same medicine for less among 21,714 Bangladeshi brands.",
  openGraph: {
    title: "Likhlo: ডাক্তার কী লিখলো?",
    description: "Read any prescription, catch double doses, and pay less for the same medicine.",
  },
};

export const viewport: Viewport = {
  themeColor: "#f3faf7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
