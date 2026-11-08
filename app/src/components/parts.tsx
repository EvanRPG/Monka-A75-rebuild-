import { type ReactNode } from "react";
import { Toaster as Sonner } from "sonner";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";

export function Toaster() {
  const { theme } = useApp();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      toastOptions={{
        className: "!bg-popover !text-foreground !border-border !shadow-lg !text-[13px]",
      }}
    />
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
  size = "md",
  id,
}: {
  value: T;
  options: [T, ReactNode][];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
  id?: string;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      className={cn("inline-flex rounded-md border border-border bg-muted p-0.5", className)}
    >
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onChange(v)}
          className={cn(
            "flex-1 rounded-[5px] px-3 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            size === "sm" ? "h-7 text-xs" : "h-8 text-[13px]",
            v === value
              ? "bg-card text-foreground shadow-sm ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A titled block in the right-hand parameter column. */
export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3 border-b border-border px-5 py-4 last:border-b-0", className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold tracking-wide text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Labelled slider with its value on the right. */
export function SliderRow({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  format,
  disabled,
  hint,
}: {
  id: string;
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  format?: (v: number) => ReactNode;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px]">
          {label}
        </label>
        <span className="tabular font-mono text-xs text-muted-foreground">{format ? format(value) : value}</span>
      </div>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0])}
        onValueCommit={(v) => onCommit?.(v[0])}
      />
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const SWATCHES: [number, number, number][] = [
  [255, 255, 255],
  [255, 59, 48],
  [255, 149, 0],
  [255, 214, 10],
  [52, 199, 89],
  [0, 199, 190],
  [77, 141, 255],
  [94, 92, 230],
  [191, 90, 242],
  [255, 55, 145],
];

export const toHex = ([r, g, b]: number[]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
export const fromHex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

export function ColorSwatches({
  value,
  onChange,
  id,
}: {
  value: [number, number, number];
  onChange: (c: [number, number, number]) => void;
  id: string;
}) {
  const hex = toHex(value);
  const isPreset = SWATCHES.some((s) => toHex(s) === hex);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {SWATCHES.map((c) => {
        const h = toHex(c);
        return (
          <button
            key={h}
            type="button"
            aria-label={`颜色 ${h}`}
            onClick={() => onChange(c)}
            className={cn(
              "size-7 rounded-full ring-offset-2 ring-offset-card transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring",
              h === hex ? "ring-2 ring-foreground" : "ring-1 ring-black/10 dark:ring-white/10",
            )}
            style={{ background: h }}
          />
        );
      })}
      <label
        htmlFor={id}
        className={cn(
          "relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-offset-2 ring-offset-card",
          !isPreset ? "ring-2 ring-foreground" : "ring-1 ring-border",
        )}
        style={{
          background: !isPreset ? hex : "conic-gradient(#ff3b30,#ffd60a,#34c759,#00c7be,#4d8dff,#bf5af2,#ff3b30)",
        }}
        title="自定义颜色"
      >
        <input
          id={id}
          type="color"
          value={hex}
          onChange={(e) => onChange(fromHex(e.target.value))}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <span className="ml-1 font-mono text-xs text-muted-foreground uppercase">{hex}</span>
    </div>
  );
}

export function Callout({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5 text-xs leading-relaxed",
        tone === "warn"
          ? "border-warn/30 bg-warn/10 text-foreground"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

/** Small state chip: 已验证 / 待验证 / 实验. */
export function Tag({ tone, children }: { tone: "ok" | "warn" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-[4px] px-1.5 text-[11px] font-medium",
        tone === "ok" && "bg-ok/15 text-ok",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** Page frame: centre stage (keyboard) with the parameter column on the right. */
export function Workspace({
  stage,
  below,
  panel,
}: {
  stage: ReactNode;
  below?: ReactNode;
  panel: ReactNode;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="rounded-xl border border-border bg-stage px-3 py-5 sm:px-6 sm:py-7">{stage}</div>
        {below}
      </div>
      <aside className="min-w-0 overflow-y-auto border-t border-border bg-card lg:border-t-0 lg:border-l">
        {panel}
      </aside>
    </div>
  );
}
