// Interface language. Strings are written in Chinese in the code and looked
// up in a table for other languages; a missing entry falls back to the
// Chinese. The language is read once at start, and switching it reloads
// the window, so strings built at module load are translated too.

import { EN } from "./i18n-en";

export type Lang = "zh" | "en";

export const LANGS: [Lang, string][] = [
  ["zh", "中文"],
  ["en", "English"],
];

function readLang(): Lang {
  try {
    const v = localStorage.getItem("a75.lang");
    if (v === "zh" || v === "en") return v;
  } catch {
    /* storage unavailable */
  }
  return "zh";
}

export const LANG: Lang = readLang();

if (typeof document !== "undefined") document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";

export function setLang(l: Lang) {
  try {
    localStorage.setItem("a75.lang", l);
  } catch {
    /* storage unavailable */
  }
  location.reload();
}

/** Translate a Chinese source string. `{0}`, `{1}` take the arguments. */
export function t(zh: string, ...args: (string | number)[]): string {
  const s = LANG === "en" ? (EN[zh] ?? zh) : zh;
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m)) : s;
}
