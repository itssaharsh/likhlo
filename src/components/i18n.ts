import type { Lang } from "./format";

/** Page chrome in both languages. Medicine names, generics and leaflet quotes stay as the data writes them. */
const STRINGS = {
  yourDay: { en: "Your day", bn: "আপনার দিন" },
  agentSteps: { en: "What the agent did", bn: "এজেন্ট কী করল" },
  code: { en: "Code", bn: "কোড" },
  subline: { en: "What did the doctor write, and is there a cheaper same medicine?", bn: "আর একই ওষুধ কি কম দামে পাওয়া যায়?" },
  lede: {
    en: "Photo in: every medicine explained, double doses caught, the same medicine for less.",
    bn: "ছবি দিন: প্রতিটি ওষুধের ব্যাখ্যা, দ্বিগুণ ডোজের সতর্কতা, আর একই ওষুধ কম দামে।",
  },
  read: { en: "Read my prescription", bn: "প্রেসক্রিপশন পড়ুন" },
  orSample: { en: "or try a sample", bn: "অথবা একটি নমুনা দেখুন" },
  planSub: {
    en: "Every medicine, placed where it goes in the day. Show it to whoever gives the medicines.",
    bn: "প্রতিটি ওষুধ দিনের কোন সময়ে, তা এক নজরে। যিনি ওষুধ খাওয়ান, তাঁকে দেখান।",
  },
  planEmpty: { en: "Your plan appears after a reading.", bn: "প্রেসক্রিপশন পড়ার পর এখানে পরিকল্পনা দেখাবে।" },
  stepsSub: {
    en: "Gemini reads the photo and decides what to look up; every fact comes back from a tool over 21,714 Bangladeshi medicine brands and their leaflets.",
    bn: "Gemini ছবি পড়ে ঠিক করে কী খুঁজতে হবে; প্রতিটি তথ্য আসে ২১,৭১৪টি বাংলাদেশি ব্র্যান্ড আর তাদের লিফলেট থেকে।",
  },
  readLive: { en: "Read it live", bn: "লাইভ পড়ুন" },
  skip: { en: "Skip", bn: "বাদ দিন" },
  stop: { en: "Stop", bn: "থামান" },
  readingPhoto: { en: "Reading the photo…", bn: "ছবি পড়া হচ্ছে…" },
  sped: { en: " · replay, sped up", bn: " · রিপ্লে, দ্রুত" },
} as const;

export type Key = keyof typeof STRINGS;
export const t = (key: Key, lang: Lang) => STRINGS[key][lang];

export const SAMPLE_TITLES: Record<string, { en: string; bn: string }> = {
  rahima: { en: "Rahima's prescription", bn: "রহিমার প্রেসক্রিপশন" },
  karim: { en: "Diabetes and BP, monthly", bn: "ডায়াবেটিস ও প্রেশার, মাসিক" },
  arif: { en: "A child's cough syrups", bn: "শিশুর কাশির সিরাপ" },
};
