import { useEffect, useRef } from "react";
import { KEYS, PICTURE, type KeyCap } from "@/lib/a75";
import type { Rgb } from "@/lib/effects";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export interface KeyboardProps {
  /** Highlighted slots. */
  selected?: number[];
  onKey?: (k: KeyCap, e: React.MouseEvent) => void;
  /** Extra text drawn on a key, e.g. its new function. */
  badges?: Record<number, string>;
  /** Per-key light at a frame (5 ms units); null leaves the key unlit. */
  light?: ((k: KeyCap, index: number, frame: number) => Rgb | null) | null;
  /** Show the knob's three hotspots. */
  showKnob?: boolean;
  /** Paint mode: hold the mouse and drag across keys. */
  onDragKey?: (k: KeyCap) => void;
  className?: string;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export function Keyboard({ selected = [], onKey, badges, light, showKnob = true, onDragKey, className }: KeyboardProps) {
  const { dark } = useApp();
  const canvas = useRef<HTMLCanvasElement>(null);
  const lightRef = useRef(light);
  lightRef.current = light;
  const dragging = useRef(false);

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const t0 = performance.now();
    const lit = KEYS.filter((k) => !k.knob);
    const draw = (now: number) => {
      const fn = lightRef.current;
      const rect = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(rect.width * dpr);
      const H = Math.round(rect.height * dpr);
      if (W === 0) {
        raf = requestAnimationFrame(draw);
        return;
      }
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const frame = Math.floor((now - t0) / 5);
      ctx.clearRect(0, 0, W, H);
      if (fn) {
        const sx = W / PICTURE.w;
        const sy = H / PICTURE.h;
        lit.forEach((k, i) => {
          const rgb = fn(k, i, frame);
          if (!rgb) return;
          const [r, g, b] = rgb;
          if (r + g + b < 6) return;
          const x = k.x * sx;
          const y = k.y * sy;
          const w = k.w * sx;
          const h = k.h * sy;
          if (dark) {
            // Black board: light glows out of a dimmed photo (screen blend).
            ctx.shadowColor = `rgba(${r},${g},${b},0.95)`;
            ctx.shadowBlur = 10 * dpr;
            ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
            ctx.beginPath();
            ctx.roundRect(x + sx, y + sy, w - 2 * sx, h - 2 * sy, 3 * sx);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},0.35)`;
            ctx.beginPath();
            ctx.roundRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.45, 2 * sx);
            ctx.fill();
          } else {
            // White board: light tints the translucent caps (multiply blend).
            const soft = (v: number) => Math.round(255 - (255 - v) * 0.75);
            ctx.shadowColor = `rgba(${r},${g},${b},0.8)`;
            ctx.shadowBlur = 7 * dpr;
            ctx.fillStyle = `rgb(${soft(r)},${soft(g)},${soft(b)})`;
            ctx.beginPath();
            ctx.roundRect(x - 2 * sx, y - 2 * sy, w + 4 * sx, h + 6 * sy, 4 * sx);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dark]);

  return (
    <div
      className={cn("relative w-full select-none", className)}
      style={{ aspectRatio: `${PICTURE.w} / ${PICTURE.h}`, maxWidth: "100%" }}
    >
      <img
        src={dark ? PICTURE.dark : PICTURE.white}
        alt="Monka A75 键盘"
        draggable={false}
        className={cn(
          "absolute inset-0 h-full w-full transition-[filter] duration-300",
          light && dark ? "brightness-[0.42] saturate-[0.35]" : "",
        )}
      />
      <canvas
        ref={canvas}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ mixBlendMode: dark ? "screen" : "multiply" }}
      />
      {KEYS.filter((k) => showKnob || !k.knob).map((k) => {
        const sel = selected.includes(k.slot);
        const badge = badges?.[k.slot];
        return (
          <button
            key={k.slot}
            type="button"
            title={k.name}
            aria-label={k.name}
            aria-pressed={sel}
            onMouseDown={(e) => {
              if (onDragKey) {
                dragging.current = true;
                onDragKey(k);
                e.preventDefault();
              }
            }}
            onMouseEnter={() => {
              if (onDragKey && dragging.current) onDragKey(k);
            }}
            onClick={(e) => onKey?.(k, e)}
            className={cn(
              "group absolute flex items-end justify-center outline-none",
              k.knob ? "rounded-full" : "rounded-[4px]",
              "transition-[background-color,box-shadow] duration-100",
              "hover:bg-[var(--key-hover)] focus-visible:ring-2 focus-visible:ring-primary",
              sel && "bg-[var(--key-sel)] ring-2 ring-primary",
            )}
            style={{
              left: pct(k.x, PICTURE.w),
              top: pct(k.y, PICTURE.h),
              width: pct(k.w, PICTURE.w),
              height: pct(k.h, PICTURE.h),
            }}
          >
            {badge && (
              <span className="pointer-events-none mb-[-3px] max-w-[160%] truncate rounded-[3px] bg-primary px-1 text-[9px] leading-[13px] font-medium text-primary-foreground shadow">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
