import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "@/components/Keyboard";
import { ColorSwatches, Section, Segmented, SliderRow, Workspace, Tag } from "@/components/parts";
import { BRIGHTNESS_MAX, EFFECTS, SPEED_MAX, effectByMode, ledOf, type Effect } from "@/lib/a75";
import { colorAt, type Rgb } from "@/lib/effects";
import type { LedParam } from "@/lib/backend";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PageId } from "@/App";

/** A tiny animated hint of each effect on its tile. */
function tileGradient(e: Effect): string {
  if (e.kind === "music") return "linear-gradient(90deg,#4d8dff 0 12%,transparent 12% 16%,#7b6cff 16% 30%,transparent 30% 34%,#bf5af2 34% 52%,transparent 52% 56%,#ff3791 56% 66%,transparent 66% 70%,#ff9500 70% 78%,transparent 78%)";
  if (e.kind === "screen") return "linear-gradient(90deg,#1e3a8a,#0ea5e9,#f59e0b)";
  if (e.kind === "custom") return "repeating-linear-gradient(90deg,#ff3b30 0 10%,#ffd60a 10% 20%,#34c759 20% 30%,#4d8dff 30% 40%)";
  if (!e.rgb) return "linear-gradient(90deg,#ff3b30,#ffd60a,#34c759,#00c7be,#4d8dff,#bf5af2)";
  return "";
}

export default function Lighting({ go }: { go: (p: PageId) => void }) {
  const { led, setLed } = useApp();
  const [draft, setDraft] = useState<LedParam | null>(led);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (led && !draft) setDraft(led);
  }, [led, draft]);

  const effect = draft ? effectByMode(draft.mode) : undefined;

  /** Lighting lands in the keyboard's flash, so writes are spaced (the
   *  backend keeps at least a second between them). Clicks write at once;
   *  sliders write when released; the colour picker once it settles. */
  const apply = (p: LedParam, when: "now" | "settle" | "preview" = "now") => {
    setDraft(p);
    if (timer.current) clearTimeout(timer.current);
    if (when === "preview") return;
    const go = () => setLed(p).catch((e) => toast.error(`写入失败：${e}`));
    if (when === "now") go();
    else timer.current = setTimeout(go, 600);
  };

  const lightFn = useMemo(() => {
    if (!draft || !effect || effect.kind !== "onboard") return null;
    const p = {
      mode: draft.mode,
      speed: draft.speed,
      brightness: draft.brightness,
      brightnessMax: BRIGHTNESS_MAX,
      option: draft.option,
      rainbow: !effect.rgb || draft.dazzle,
      r: draft.r,
      g: draft.g,
      b: draft.b,
    };
    return (k: Parameters<typeof ledOf>[0], i: number, frame: number): Rgb => colorAt("yc500", p, ledOf(k), i, frame);
  }, [draft, effect]);

  if (!draft) return null;

  const onboard = EFFECTS.filter((e) => e.kind === "onboard");
  const hosted = EFFECTS.filter((e) => e.kind !== "onboard");

  const pick = (e: Effect) => {
    if (e.kind === "custom") return go("paint");
    if (e.kind === "music") return go("music");
    if (e.kind === "screen") return go("screen");
    apply({ ...draft, mode: e.mode, option: Math.min(draft.option, (e.options?.length ?? 1) - 1) });
  };

  return (
    <Workspace
      stage={<Keyboard light={lightFn} showKnob={false} />}
      below={
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2.5 flex items-center gap-2">
              <h3 className="text-[13px] font-semibold">板载灯效</h3>
              <span className="text-xs text-muted-foreground">由键盘自己运行，拔掉线也保留</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {onboard.map((e) => (
                <EffectTile key={e.mode} e={e} active={draft.mode === e.mode} onClick={() => pick(e)} color={[draft.r, draft.g, draft.b]} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2.5 flex items-center gap-2">
              <h3 className="text-[13px] font-semibold">需要电脑配合</h3>
              <span className="text-xs text-muted-foreground">由本软件实时计算后发给键盘</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {hosted.map((e) => (
                <EffectTile key={e.mode} e={e} active={false} onClick={() => pick(e)} color={[draft.r, draft.g, draft.b]} link />
              ))}
            </div>
          </div>
        </div>
      }
      panel={
        <>
          <div className="px-5 pt-5 pb-4">
            <div className="text-xs text-muted-foreground">当前灯效</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-lg font-semibold">{effect?.name ?? `模式 ${draft.mode}`}</span>
              <Tag tone={led && JSON.stringify(led) === JSON.stringify(draft) ? "ok" : "muted"}>{led && JSON.stringify(led) === JSON.stringify(draft) ? "已写入键盘" : "未写入"}</Tag>
            </div>
          </div>
          <Section title="参数">
            <SliderRow
              id="led-brightness"
              label="亮度"
              value={draft.brightness}
              min={0}
              max={BRIGHTNESS_MAX}
              onChange={(v) => apply({ ...draft, brightness: v }, "preview")}
              onCommit={(v) => apply({ ...draft, brightness: v })}
              format={(v) => (v === 0 ? "关闭" : `${v} / ${BRIGHTNESS_MAX}`)}
            />
            {effect?.speed && (
              <SliderRow
                id="led-speed"
                label="速度"
                value={draft.speed}
                min={0}
                max={SPEED_MAX}
                onChange={(v) => apply({ ...draft, speed: v }, "preview")}
                onCommit={(v) => apply({ ...draft, speed: v })}
                format={(v) => ["最慢", "慢", "中", "快", "最快"][v]}
              />
            )}
          </Section>
          {effect?.options && (
            <Section title="方向">
              <Segmented
                id="led-direction"
                className="w-full"
                value={draft.option}
                options={effect.options.map((o, i) => [i, o] as [number, string])}
                onChange={(v) => apply({ ...draft, option: v })}
              />
            </Section>
          )}
          <Section title="颜色">
            {effect?.rgb ? (
              <>
                <Segmented
                  id="led-colormode"
                  className="w-full"
                  value={draft.dazzle ? "rainbow" : "single"}
                  options={[
                    ["single", "单色"],
                    ["rainbow", "七彩"],
                  ]}
                  onChange={(v) => apply({ ...draft, dazzle: v === "rainbow" })}
                />
                {!draft.dazzle && (
                  <ColorSwatches
                    id="led-color"
                    value={[draft.r, draft.g, draft.b]}
                    onChange={([r, g, b]) => apply({ ...draft, r, g, b }, "settle")}
                  />
                )}
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">这个灯效固定为七彩，不能选颜色。</p>
            )}
          </Section>
          <Section title="说明">
            <p className="text-xs leading-relaxed text-muted-foreground">
              点选立即写入键盘，滑块松手后写入。左侧预览是示意，实际效果以键盘为准。Fn 键的灯用来显示充电和配对状态，不跟随灯效。
            </p>
          </Section>
        </>
      }
    />
  );
}

function EffectTile({
  e,
  active,
  onClick,
  color,
  link,
}: {
  e: Effect;
  active: boolean;
  onClick: () => void;
  color: number[];
  link?: boolean;
}) {
  const g = tileGradient(e) || `linear-gradient(90deg, rgb(${color.join(",")}) , rgb(${color.join(",")}))`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group flex h-[58px] flex-col justify-between rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-input hover:bg-accent",
      )}
    >
      <span className="flex items-center justify-between gap-1 text-[13px] font-medium">
        <span className="truncate">{e.name}</span>
        {link && <span className="text-xs text-muted-foreground group-hover:text-foreground">›</span>}
      </span>
      <span className="h-1 w-full rounded-full opacity-80" style={{ background: g }} />
    </button>
  );
}
