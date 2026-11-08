// The Lighting page's picture of each onboard effect on the A75.
//
// The board computes its effects itself; LEDPARAM carries only the mode
// number and its settings, so there is nothing to read back and replay.
// Breathing, Spectrum and Sine wave follow the yc500 firmware (effects.ts).
// The rest are drawn from the owner's description of the real board
// (2026-11-09): direction, colour pattern, what a key press does.

import { LIT_KEYS, PICTURE, defaultMatrix, entryAt, type KeyCap } from "./a75";
import { colorAt, type EffectParam, type Rgb } from "./effects";

/** A key press the reactive effects answer: real, clicked or a demo. */
export interface Press {
  /** Index into LIT_KEYS. */
  key: number;
  /** performance.now() of the press. */
  at: number;
}

interface Geo {
  x: number;
  y: number;
  row: number;
  /** Position in the row, 0 at the left. */
  col: number;
  /** Order along a zigzag over the rows. */
  zig: number;
  /** Order along a ring from the outside in. */
  ring: number;
  /** Distance from the centre, 0..1, and angle 0..1. */
  d: number;
  a: number;
}

const ROW_YS = [...new Set(LIT_KEYS.map((k) => k.y))].sort((a, b) => a - b);
// Keys whose top sits a few pixels off their row (the arrow cluster) join
// the nearest row.
const ROWS = ROW_YS.reduce<number[]>((acc, y) => (acc.length && y - acc[acc.length - 1] < 20 ? acc : [...acc, y]), []);
const rowOf = (k: KeyCap) => ROWS.reduce((best, y, i) => (Math.abs(k.y - y) < Math.abs(k.y - ROWS[best]) ? i : best), 0);

const GEO: Geo[] = (() => {
  const cx = (k: KeyCap) => (k.x + k.w / 2) / PICTURE.w;
  const cy = (k: KeyCap) => (k.y + k.h / 2) / PICTURE.h;
  const xs = LIT_KEYS.map(cx);
  const ys = LIT_KEYS.map(cy);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const rows = LIT_KEYS.map(rowOf);
  const nRows = ROWS.length;
  const geo = LIT_KEYS.map((_k, i) => {
    const x = (xs[i] - x0) / (x1 - x0);
    const y = (ys[i] - y0) / (y1 - y0);
    // Aspect: the board is about 3.3 times wider than tall.
    const dx = (x - 0.5) * 3.3;
    const dy = y - 0.5;
    return {
      x,
      y,
      row: rows[i],
      col: 0,
      zig: 0,
      ring: 0,
      d: Math.min(1, Math.hypot(dx, dy) / Math.hypot(1.65, 0.5)),
      a: (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1,
    };
  });
  // Columns and the zigzag: rows top to bottom, alternate rows reversed.
  let n = 0;
  for (let r = 0; r < nRows; r++) {
    const inRow = geo.map((g, i) => [g, i] as const).filter(([g]) => g.row === r).sort((p, q) => p[0].x - q[0].x);
    inRow.forEach(([g], c) => (g.col = c));
    const order = r % 2 ? [...inRow].reverse() : inRow;
    for (const [g] of order) g.zig = n++;
  }
  // Rings: by distance to the nearest edge, then clockwise.
  const edge = (g: Geo) => Math.min(g.row, nRows - 1 - g.row, Math.round(g.x * 15), Math.round((1 - g.x) * 15));
  [...geo]
    .sort((p, q) => edge(p) - edge(q) || p.a - q.a)
    .forEach((g, i) => (g.ring = i));
  return geo;
})();

const N = GEO.length;
const ROW_COUNT = ROWS.length;

/** Deterministic noise in 0..1. */
function noise(i: number, n: number): number {
  let h = (i * 374761393 + n * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hsv(h: number): Rgb {
  const f = (n: number) => {
    const k = (n + (((h % 1) + 1) % 1) * 6) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

const scale = (c: Rgb, k: number): Rgb => {
  const m = Math.max(0, Math.min(1, k));
  return [Math.round(c[0] * m), Math.round(c[1] * m), Math.round(c[2] * m)];
};

const BLACK: Rgb = [0, 0, 0];

/** Host speed 0..4 to a rate factor; the real board spans about 4x. */
const rate = (speed: number) => 0.5 * Math.pow(1.45, Math.max(0, Math.min(4, speed)));

/** Demo presses while nobody presses anything: one random key now and then. */
function withDemo(presses: Press[], now: number, every: number): Press[] {
  const last = presses.length ? presses[presses.length - 1].at : -Infinity;
  if (now - last < 2500) return presses;
  const out = [...presses];
  const start = Math.max(last + 2500, now - 4000);
  for (let n = Math.ceil(start / every); n * every <= now; n++) out.push({ key: Math.floor(noise(99, n) * N), at: n * every });
  return out;
}

/**
 * A light function for the Keyboard picture. `presses` is read on every
 * frame, so the page can push into it.
 */
export function preview(p: EffectParam, presses: Press[]) {
  const gain = p.brightnessMax > 0 ? p.brightness / p.brightnessMax : 1;
  const sf = rate(p.speed);
  const own: Rgb = [p.r, p.g, p.b];
  /** A random colour in rainbow mode, the chosen one otherwise. */
  const pick = (seed: number, n: number): Rgb => (p.rainbow ? hsv(noise(seed, n)) : own);

  return (k: KeyCap, _i: number, frame: number): Rgb | null => {
    const i = LIT_KEYS.indexOf(k);
    if (i < 0) return null;
    const g = GEO[i];
    const now = performance.now();
    const t = now / 1000;
    let c: Rgb;
    switch (p.mode) {
      case 1:
      case 2:
      case 3:
        c = colorAt("yc500", { ...p, brightness: p.brightnessMax }, { x: g.x, y: g.y }, i, frame);
        break;
      case 4: {
        // A rainbow slides the chosen way: right, left, down, up.
        const along = [g.x, 1 - g.x, g.y, 1 - g.y][p.option % 4] ?? g.x;
        const ph = along - t * sf * 0.4;
        c = p.rainbow ? hsv(ph) : scale(own, 0.5 + 0.5 * Math.cos(ph * Math.PI * 2));
        break;
      }
      case 5: {
        // A press sends a ring out from the key, each key in a random colour.
        let lv = 0;
        let col = BLACK;
        for (const pr of withDemo(presses, now, 1400 / sf)) {
          const age = (now - pr.at) / 1000;
          if (age < 0 || age > 3) continue;
          const o = GEO[pr.key];
          const dist = Math.hypot((g.x - o.x) * 15, (g.row - o.row) * 1.1);
          const radius = age * sf * 9;
          const v = Math.max(0, 1 - Math.abs(dist - radius) / 1.4) * Math.max(0, 1 - age / 3);
          if (v > lv) {
            lv = v;
            col = pick(i, Math.floor(pr.at));
          }
        }
        c = scale(col, lv);
        break;
      }
      case 6:
      case 16: {
        // Twinkles: each key on its own clock, only a few lit at once.
        const seed = p.mode === 6 ? 0 : 50;
        const len = (2.2 + 2.4 * noise(i, seed + 1)) / sf;
        const u = t / len + noise(i, seed + 2);
        const cycle = Math.floor(u);
        const lit = noise(i, seed + 3 + cycle) < (p.mode === 6 ? 0.3 : 0.4);
        const v = lit ? Math.pow(Math.sin(Math.PI * (u - cycle)), 2) : 0;
        c = scale(p.mode === 16 || p.rainbow ? hsv(noise(i, cycle * 7 + seed)) : own, v);
        break;
      }
      case 7: {
        // A stream runs along the keys, every key in it a different colour.
        const order = p.option === 1 ? g.ring : g.zig;
        const head = (t * sf * 14) % (N + 10);
        const behind = head - order;
        const v = behind >= 0 && behind < 10 ? 1 - behind / 10 : 0;
        c = scale(p.rainbow ? hsv(noise(i, 11)) : own, v);
        break;
      }
      case 8: {
        // The pressed key lights and fades.
        let v = 0;
        let col = BLACK;
        for (const pr of withDemo(presses, now, 600 / sf)) {
          if (pr.key !== i) continue;
          const age = (now - pr.at) / 1000;
          const lv = age >= 0 ? Math.max(0, 1 - age / 1.2) : 0;
          if (lv > v) {
            v = lv;
            col = pick(i, Math.floor(pr.at));
          }
        }
        c = scale(col, v);
        break;
      }
      case 9: {
        // A swirl of random colours closes in on the centre, then opens out.
        const period = 6 / sf;
        const cyc = Math.floor(t / period);
        const u = (t / period) % 1;
        const s = g.d + 0.35 * g.a; // spiral coordinate, 0..1.35
        const front = u < 0.5 ? 1.35 * (1 - u * 2) : 1.35 * (u - 0.5) * 2;
        // Closing in: lit outside the front. Opening out: the dark grows
        // from the centre. Either way a key is lit past the front.
        const v = s >= front ? 1 : Math.max(0, 1 - (front - s) * 6);
        c = scale(pick(i, cyc), v);
        break;
      }
      case 10: {
        // The firmware's sine path, each lit key in its own random colour.
        const white = colorAt("yc500", { ...p, rainbow: false, r: 255, g: 255, b: 255, brightness: p.brightnessMax }, { x: g.x, y: g.y }, i, frame);
        c = scale(pick(i, Math.floor(t * sf)), white[0] / 255);
        break;
      }
      case 11: {
        // Rings flow out of (or into) the centre.
        const dir = p.option === 1 ? -1 : 1;
        const ph = g.d * 2.2 - dir * t * sf * 0.8;
        c = scale(p.rainbow ? hsv(ph) : own, 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.cos(ph * Math.PI * 2), 2));
        break;
      }
      case 12: {
        // Every key its own random colour, changing now and then.
        const len = (1.5 + 2 * noise(i, 21)) / sf;
        const u = t / len + noise(i, 22);
        const cyc = Math.floor(u);
        const f = Math.min(1, (u - cyc) * 4);
        const a = p.rainbow ? hsv(noise(i, cyc)) : scale(own, 0.2 + 0.8 * noise(i, cyc));
        const b = p.rainbow ? hsv(noise(i, cyc - 1)) : scale(own, 0.2 + 0.8 * noise(i, cyc - 1));
        c = [0, 1, 2].map((j) => Math.round(b[j] + (a[j] - b[j]) * f)) as Rgb;
        break;
      }
      case 14: {
        // A press lights its row, spreading both ways in random colours.
        let v = 0;
        let col = BLACK;
        for (const pr of withDemo(presses, now, 1300 / sf)) {
          const o = GEO[pr.key];
          if (o.row !== g.row) continue;
          const age = (now - pr.at) / 1000;
          if (age < 0 || age > 2.5) continue;
          const reach = age * sf * 12;
          const dist = Math.abs(g.col - o.col);
          const lv = dist <= reach ? Math.max(0, 1 - age / 2.5) : 0;
          if (lv > v) {
            v = lv;
            col = pick(i, Math.floor(pr.at));
          }
        }
        c = scale(col, v);
        break;
      }
      case 15: {
        // A light runs round the edge: counter-clockwise or clockwise.
        const dir = p.option === 1 ? 1 : -1;
        const head = (((dir * t * sf * 0.35) % 1) + 1) % 1;
        const behind = (((head - g.a) * dir) % 1 + 1) % 1;
        const outer = g.row === 0 || g.row === ROW_COUNT - 1 || g.x < 0.05 || g.x > 0.95 ? 1 : 0.25;
        c = scale(p.rainbow ? hsv(g.a) : own, Math.max(0, 1 - behind * 5) * outer);
        break;
      }
      case 17: {
        // Flakes drift down the board.
        const lane = Math.round(g.x * 15);
        const fall = t * sf * 2.2 / ROW_COUNT + noise(lane, 31);
        const cyc = Math.floor(fall);
        const pos = (fall - cyc) * (ROW_COUNT + 1) - 0.5;
        const on = noise(lane, cyc + 40) > 0.45;
        const v = on ? Math.max(0, 1 - Math.abs(pos - g.row) * 1.2) : 0;
        c = scale(p.rainbow ? hsv(noise(lane, cyc)) : own, v);
        break;
      }
      case 18: {
        // Meteors cross random rows from left to right, trailing a tail.
        const len = (1.6 + noise(g.row, 61)) / sf;
        const u = t / len + noise(g.row, 62);
        const cyc = Math.floor(u);
        const on = noise(g.row, cyc + 63) > 0.35;
        const head = (u - cyc) * 1.5 - 0.2;
        const behind = head - g.x;
        const v = on && behind >= 0 && behind < 0.3 ? 1 - behind / 0.3 : 0;
        c = scale(pick(g.row, cyc), v);
        break;
      }
      case 19: {
        // All lit; a pressed key goes dark, then comes back.
        let v = 1;
        for (const pr of withDemo(presses, now, 700 / sf)) {
          if (pr.key !== i) continue;
          const age = (now - pr.at) / 1000;
          if (age >= 0) v = Math.min(v, Math.min(1, age / 1.5));
        }
        c = scale(p.rainbow ? hsv(g.x) : own, v);
        break;
      }
      default:
        c = colorAt("yc500", { ...p, brightness: p.brightnessMax }, { x: g.x, y: g.y }, i, frame);
    }
    return scale(c, gain);
  };
}

/** Effects that answer key presses. */
export const REACTIVE = new Set([5, 8, 14, 19]);

const BASE = defaultMatrix();

/** The index in LIT_KEYS of the key that sends this HID usage, or -1. */
export function keyOfUsage(usage: number): number {
  return LIT_KEYS.findIndex((k) => {
    const e = entryAt(BASE, k.slot);
    return e[0] === 0 && e[1] === 0 && e[2] === usage;
  });
}
