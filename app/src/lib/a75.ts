// Monka A75 (device 1549, yc500 family): picture, key positions, matrix
// slots and the effect table, all taken from the vendor driver v2.1.66.
// Coordinates are in pixels of the 871x288 picture; the vendor stores y as
// a negative top offset.
import layoutRaw from "./a75-layout.json";
import matrixRaw from "./a75-matrix.json";
import fnMatrixRaw from "./a75-fnmatrix.json";
import darkUrl from "@/assets/a75-dark.png";
import whiteUrl from "@/assets/a75-white.png";
import { t } from "@/lib/i18n";

/** Both pictures share the vendor's 871x288 frame and key coordinates. */
export const PICTURE = { dark: darkUrl, white: whiteUrl, w: 871, h: 288 };

export type Entry = [number, number, number, number];

export interface KeyCap {
  /** Matrix slot 0..127. */
  slot: number;
  /** Label the vendor prints for the key. */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Knob turn or press; drawn without a keycap highlight. */
  knob?: boolean;
}

const DEFAULT_MATRIX = matrixRaw as number[];
export const DEFAULT_FN_MATRIX = fnMatrixRaw as number[];

export function entryAt(matrix: number[], slot: number): Entry {
  return [matrix[slot * 4], matrix[slot * 4 + 1], matrix[slot * 4 + 2], matrix[slot * 4 + 3]];
}

function entryOfValue(v: number): Entry {
  if (v < 256) return [0, 0, v, 0];
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}

function slotOf(e: Entry): number {
  for (let s = 0; s < 128; s++) {
    const d = entryAt(DEFAULT_MATRIX, s);
    if (d.every((b, i) => b === e[i])) return s;
  }
  return -1;
}

const NAME_FIX: Record<string, string> = {
  "Page\nUp": "PgUp",
  "Page\nDown": "PgDn",
  "(space)": "Space",
  BackSpace: "Backspace",
  "Caps Lock": "Caps",
  r_Shift: "Shift",
  r_Ctrl: "Ctrl",
  fn: "Fn",
  "U-": t("旋钮左转"),
  "U+": t("旋钮右转"),
};

interface RawKey {
  keyName: string;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
  knob?: boolean;
}

export const KEYS: KeyCap[] = [
  ...(layoutRaw as { layout: RawKey[] }).layout.map((k) => ({
    slot: slotOf(entryOfValue(k.value)),
    name: NAME_FIX[k.keyName] ?? k.keyName,
    x: k.x,
    y: -k.y,
    w: k.w,
    h: k.h,
    knob: k.knob,
  })),
  // Knob press: matrix slot 84, not in the vendor's picture table.
  { slot: 84, name: t("旋钮按下"), x: 735, y: 18, w: 18, h: 33, knob: true },
];

/** Slots that are physical keys with a cap (lighting covers these). */
export const LIT_KEYS = KEYS.filter((k) => !k.knob);

export const defaultMatrix = () => [...DEFAULT_MATRIX];
export const defaultFnMatrix = () => [...DEFAULT_FN_MATRIX];

/** One backlight effect as the A75's own table lists it. */
export interface Effect {
  /** LEDPARAM mode byte. */
  mode: number;
  name: string;
  /** Takes a single colour; otherwise colourful only. */
  rgb: boolean;
  speed: boolean;
  options?: string[];
  kind: "onboard" | "custom" | "music" | "screen";
}

// Order and names follow the vendor's Monka table; mode bytes are verified
// against captures (1, 2, 22) and the vendor code (13, 20, 21).
export const EFFECTS: Effect[] = [
  { mode: 1, name: t("常亮"), rgb: true, speed: false, kind: "onboard" },
  { mode: 2, name: t("动态呼吸"), rgb: true, speed: true, kind: "onboard" },
  { mode: 3, name: t("光谱循环"), rgb: false, speed: true, kind: "onboard" },
  { mode: 4, name: t("随波逐流"), rgb: true, speed: true, options: [t("向右"), t("向左"), t("向下"), t("向上")], kind: "onboard" },
  { mode: 5, name: t("碧波荡漾"), rgb: true, speed: true, kind: "onboard" },
  { mode: 6, name: t("繁星点点"), rgb: true, speed: true, kind: "onboard" },
  { mode: 7, name: t("川流不息"), rgb: true, speed: true, options: [t("Z 字"), t("回环")], kind: "onboard" },
  { mode: 8, name: t("如影随形"), rgb: true, speed: true, kind: "onboard" },
  { mode: 9, name: t("重峦叠嶂"), rgb: true, speed: true, kind: "onboard" },
  { mode: 10, name: t("正弦波"), rgb: true, speed: true, kind: "onboard" },
  { mode: 11, name: t("彩泉涌动"), rgb: true, speed: true, options: [t("向外"), t("向内")], kind: "onboard" },
  { mode: 12, name: t("百花争艳"), rgb: true, speed: true, options: [t("向右"), t("向左")], kind: "onboard" },
  { mode: 14, name: t("一石二鸟"), rgb: true, speed: true, kind: "onboard" },
  { mode: 15, name: t("峰回路转"), rgb: true, speed: true, options: [t("逆时针"), t("顺时针")], kind: "onboard" },
  { mode: 16, name: t("多彩纵横"), rgb: true, speed: true, kind: "onboard" },
  { mode: 17, name: t("漫天飞雪"), rgb: true, speed: true, kind: "onboard" },
  { mode: 18, name: t("流星"), rgb: true, speed: true, kind: "onboard" },
  { mode: 19, name: t("踏雪无痕"), rgb: true, speed: true, kind: "onboard" },
  { mode: 13, name: t("逐键自定义"), rgb: false, speed: false, kind: "custom" },
  { mode: 22, name: t("音乐律动"), rgb: false, speed: false, kind: "music" },
  { mode: 21, name: t("屏幕光影"), rgb: false, speed: false, kind: "screen" },
];

export const effectByMode = (mode: number) => EFFECTS.find((e) => e.mode === mode);

export const BRIGHTNESS_MAX = 4;
export const SPEED_MAX = 4;

/** Key centre as 0..1 of the picture, for effect previews. */
export const ledOf = (k: KeyCap) => ({ x: (k.x + k.w / 2) / PICTURE.w, y: (k.y + k.h / 2) / PICTURE.h });
