import { hue } from "@/lib/live";

/** The 32 levels last sent, as the bar chart under the keyboard. */
export function LiveBars({ levels, title, note }: { levels: number[]; title: string; note?: string }) {
  const peak = Math.max(0, ...levels);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {note && <span className="text-xs text-muted-foreground">{note}</span>}
        </div>
        <span className="tabular font-mono text-xs text-muted-foreground">峰值 {peak} / 6</span>
      </div>
      <div className="flex h-28 items-end gap-[3px]" aria-label="电平">
        {levels.map((v, i) => (
          <div key={i} className="flex h-full flex-1 flex-col-reverse gap-[2px]">
            {Array.from({ length: 6 }, (_, j) => (
              <div
                key={j}
                className="flex-1 rounded-[2px] transition-colors duration-75"
                style={{ background: j < v ? `rgb(${hue(i / 32).join(",")})` : "var(--muted)" }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
