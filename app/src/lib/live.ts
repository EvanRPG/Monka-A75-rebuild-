// Helpers for pages that drive the board live (music, meters, screen).
import { LIT_KEYS, type KeyCap } from "./a75";
import type { MusicParams } from "./backend";
import type { Rgb } from "./effects";

export const LIVE_DEFAULTS: MusicParams = {
  mode: 22,
  style: 0,
  algo: 0,
  source: "music",
  volumeOverlay: false,
  timerSecs: 25 * 60,
  boost: 40,
  gain: 55,
  gate: 12,
  decay: 45,
  bass: 30,
  spread: 25,
};

const X0 = Math.min(...LIT_KEYS.map((k) => k.x));
const X1 = Math.max(...LIT_KEYS.map((k) => k.x + k.w));
const ROWS = [...new Set(LIT_KEYS.map((k) => k.y))].sort((a, b) => a - b);

export const bandOf = (k: KeyCap) => Math.min(31, Math.floor(((k.x + k.w / 2 - X0) / (X1 - X0)) * 32));
const rowOf = (k: KeyCap) => ROWS.indexOf(k.y);

export function hue(t: number): Rgb {
  const f = (n: number) => {
    const k = (n + t * 6) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

/** Rough picture of how the firmware draws 32 levels; the board decides. */
export function levelsLight(levels: () => number[], style: () => number, color?: (band: number) => Rgb) {
  return (k: KeyCap): Rgb | null => {
    const b = bandOf(k);
    const L = levels()[b] ?? 0;
    const r = rowOf(k); // 0 top .. 5 bottom
    const s = style();
    const on = s === 0 ? 5 - r < L : s === 1 ? Math.abs(r - 2.5) < L / 2 : b % 2 === 0 ? 5 - r < L : r < L;
    return on ? (color ? color(b) : hue(b / 32)) : null;
  };
}
