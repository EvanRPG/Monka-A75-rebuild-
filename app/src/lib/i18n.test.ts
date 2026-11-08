import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EN } from "./i18n-en";

/** Every t("...") in the interface has an English entry. */
describe("English table", () => {
  const root = join(__dirname, "..");
  const files = ["App.tsx", "lib/a75.ts", "lib/keys.ts", "lib/backend.ts"];
  for (const dir of ["pages", "components"]) for (const f of readdirSync(join(root, dir))) if (/\.tsx?$/.test(f)) files.push(`${dir}/${f}`);
  const keys = new Set<string>();
  for (const f of files) {
    const s = readFileSync(join(root, f), "utf8");
    for (const m of s.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
  }
  it("covers every string", () => {
    const missing = [...keys].filter((k) => !(k in EN));
    expect(missing).toEqual([]);
  });
  it("keeps the placeholders", () => {
    const bad = Object.entries(EN).filter(([zh, en]) => (zh.match(/\{\d\}/g) ?? []).sort().join() !== (en.match(/\{\d\}/g) ?? []).sort().join());
    expect(bad).toEqual([]);
  });
});
