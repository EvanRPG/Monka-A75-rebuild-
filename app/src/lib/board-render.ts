// Draws a white A75 from the vendor key coordinates, for the "white" skin.
// Lighting shows the way it does on a white board: colour spills into the
// gaps between caps, tints the cap tops, and shines through the legends.
import { KEYS, PICTURE, type KeyCap } from "./a75";
import type { Rgb } from "./effects";

const CASE = { x: 80, y: 1, w: 702, h: 284, r: 16 };
const KNOB = { cx: 752, cy: 31, r: 18 };

const LEGEND: Record<string, string> = {
  "`": "~\n`", "1": "!\n1", "2": "@\n2", "3": "#\n3", "4": "$\n4", "5": "%\n5", "6": "^\n6",
  "7": "&\n7", "8": "*\n8", "9": "(\n9", "0": ")\n0", "-": "_\n-", "=": "+\n=", "[": "{\n[",
  "]": "}\n]", "\\": "|\n\\", ";": ":\n;", "'": "\"\n'", ",": "<\n,", ".": ">\n.", "/": "?\n/",
  Space: "",
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Case and plate, drawn once per size. */
export function drawCase(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, CASE.y, 0, CASE.y + CASE.h);
  g.addColorStop(0, "#f4f5f7");
  g.addColorStop(1, "#dfe1e6");
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  rr(ctx, CASE.x, CASE.y, CASE.w, CASE.h, CASE.r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // Inner bevel.
  rr(ctx, CASE.x + 1, CASE.y + 1, CASE.w - 2, CASE.h - 2, CASE.r - 1);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Plate well.
  rr(ctx, 96, 8, 676, 266, 6);
  ctx.fillStyle = "#cfd2d8";
  ctx.fill();
}

/** Caps, legends and knob; transparent between caps so light shows. */
export function drawCaps(ctx: CanvasRenderingContext2D) {
  for (const k of KEYS) {
    if (k.knob) continue;
    // Skirt.
    rr(ctx, k.x - 2.5, k.y - 1.5, k.w + 5, k.h + 6, 4);
    const s = ctx.createLinearGradient(0, k.y, 0, k.y + k.h + 5);
    s.addColorStop(0, "#e9ebef");
    s.addColorStop(1, "#c9ccd3");
    ctx.fillStyle = s;
    ctx.fill();
    // Top.
    rr(ctx, k.x, k.y, k.w, k.h, 3);
    const t = ctx.createLinearGradient(0, k.y, 0, k.y + k.h);
    t.addColorStop(0, "#ffffff");
    t.addColorStop(1, "#f0f1f4");
    ctx.fillStyle = t;
    ctx.fill();
  }
  // Knob.
  const kg = ctx.createRadialGradient(KNOB.cx - 6, KNOB.cy - 7, 2, KNOB.cx, KNOB.cy, KNOB.r);
  kg.addColorStop(0, "#ffffff");
  kg.addColorStop(1, "#c3c7cf");
  ctx.beginPath();
  ctx.arc(KNOB.cx, KNOB.cy, KNOB.r, 0, Math.PI * 2);
  ctx.fillStyle = kg;
  ctx.fill();
  ctx.strokeStyle = "#b5bac3";
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(KNOB.cx + Math.cos(a) * (KNOB.r - 3), KNOB.cy + Math.sin(a) * (KNOB.r - 3));
    ctx.lineTo(KNOB.cx + Math.cos(a) * (KNOB.r - 0.5), KNOB.cy + Math.sin(a) * (KNOB.r - 0.5));
    ctx.strokeStyle = "rgba(120,126,138,0.45)";
    ctx.stroke();
  }
}

export function drawLegend(ctx: CanvasRenderingContext2D, k: KeyCap, color: string) {
  const text = LEGEND[k.name] ?? k.name;
  if (!text) return;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  const lines = text.split("\n");
  const single = lines.length === 1 && text.length === 1;
  if (single) {
    ctx.font = "600 11px 'Inter Variable', 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(text, k.x + 5, k.y + 14);
  } else if (lines.length === 2) {
    ctx.font = "600 8.5px 'Inter Variable', 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(lines[0], k.x + 5, k.y + 11);
    ctx.fillText(lines[1], k.x + 5, k.y + 24);
  } else {
    ctx.font = "600 7px 'Inter Variable', 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(text, k.x + 5, k.y + 12, k.w - 8);
  }
}

/** One frame: case, light under the caps, caps, tint and lit legends. */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  scale: number,
  layers: { case: HTMLCanvasElement; caps: HTMLCanvasElement },
  light: ((k: KeyCap, i: number) => Rgb | null) | null,
) {
  const W = PICTURE.w * scale;
  const H = PICTURE.h * scale;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(layers.case, 0, 0, W, H);
  const lit = KEYS.filter((k) => !k.knob);
  const colors = light ? lit.map((k, i) => light(k, i)) : [];

  ctx.save();
  ctx.scale(scale, scale);
  // Light in the gaps.
  if (light) {
    lit.forEach((k, i) => {
      const c = colors[i];
      if (!c || c[0] + c[1] + c[2] < 6) return;
      ctx.shadowColor = `rgba(${c[0]},${c[1]},${c[2]},1)`;
      ctx.shadowBlur = 9;
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.9)`;
      rr(ctx, k.x - 3, k.y - 2, k.w + 6, k.h + 7, 4);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  ctx.drawImage(layers.caps, 0, 0, W, H);

  ctx.save();
  ctx.scale(scale, scale);
  lit.forEach((k, i) => {
    const c = light ? colors[i] : null;
    const on = c && c[0] + c[1] + c[2] >= 6;
    if (on) {
      rr(ctx, k.x, k.y, k.w, k.h, 3);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.16)`;
      ctx.fill();
      drawLegend(ctx, k, `rgb(${Math.min(255, c[0] * 0.85 + 20)},${Math.min(255, c[1] * 0.85 + 20)},${Math.min(255, c[2] * 0.85 + 20)})`);
    } else {
      drawLegend(ctx, k, light ? "#9aa0aa" : "#5b616c");
    }
  });
  ctx.restore();
}

export function makeLayer(scale: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round(PICTURE.w * scale);
  c.height = Math.round(PICTURE.h * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  draw(ctx);
  return c;
}
