import { useMemo, useRef, useState } from "react";
import { Keyboard } from "@/components/Keyboard";
import { LiveBars } from "@/components/LiveBars";
import { Callout, Section, Tag, Workspace } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LiveSource, MusicParams } from "@/lib/backend";
import { LIVE_DEFAULTS, levelsLight } from "@/lib/live";
import type { Rgb } from "@/lib/effects";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Cpu, MemoryStick, Play, Square, Timer, Volume2 } from "lucide-react";

type Meter = Extract<LiveSource, "cpu" | "ram" | "volume" | "timer">;

const METERS: { id: Meter; name: string; desc: string; icon: typeof Cpu; color: (b: number) => Rgb }[] = [
  { id: "cpu", name: "CPU 占用", desc: "最近 8 秒的 CPU 曲线，从左往右滚动", icon: Cpu, color: (b) => [77, Math.round(141 + b * 3), 255] },
  { id: "ram", name: "内存占用", desc: "已用内存的比例，从左往右填满", icon: MemoryStick, color: () => [191, 90, 242] },
  { id: "volume", name: "系统音量", desc: "当前音量，转旋钮马上能看到变化", icon: Volume2, color: () => [52, 199, 89] },
  { id: "timer", name: "倒计时", desc: "番茄钟：剩余时间从右往左缩短，到点全键盘闪烁", icon: Timer, color: (b) => [255, Math.round(149 - b * 2), 0] },
];

export default function Meters() {
  const { live, liveParams, startLive, updateLive, stopLive } = useApp();
  const current = liveParams && METERS.some((m) => m.id === liveParams.source) ? (liveParams.source as Meter) : null;
  const running = live.running && current !== null;
  const [meter, setMeter] = useState<Meter>(current ?? "cpu");
  const [minutes, setMinutes] = useState(Math.round((liveParams?.timerSecs ?? LIVE_DEFAULTS.timerSecs) / 60));
  const [busy, setBusy] = useState(false);
  const levels = useRef(live.levels);
  levels.current = live.levels;
  const def = METERS.find((m) => m.id === meter)!;
  const colorRef = useRef(def.color);
  colorRef.current = def.color;

  const params = (m: Meter, mins = minutes): MusicParams => ({
    ...LIVE_DEFAULTS,
    ...(liveParams ?? {}),
    source: m,
    timerSecs: Math.max(1, Math.round(mins * 60)),
  });

  const pick = (m: Meter) => {
    setMeter(m);
    if (running) updateLive(params(m));
  };

  const toggle = async () => {
    setBusy(true);
    try {
      if (running) await stopLive();
      else await startLive(params(meter));
    } catch (e) {
      toast.error(`${running ? "停止" : "启动"}失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  const light = useMemo(() => levelsLight(() => levels.current, () => 0, (b) => colorRef.current(b)), []);

  return (
    <Workspace
      stage={<Keyboard light={running ? light : null} showKnob={false} />}
      below={
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {METERS.map((m) => {
              const Icon = m.icon;
              const on = m.id === meter;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pick(m.id)}
                  aria-pressed={on}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                    on ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent",
                  )}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                  <span>
                    <span className="block text-[13px] font-medium">{m.name}</span>
                    <span className="block text-xs text-muted-foreground">{m.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <LiveBars levels={running ? live.levels : new Array(32).fill(0)} title="发往键盘的画面" note="32 列，每列 0 到 6 格" />
        </div>
      }
      panel={
        <>
          <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">键盘仪表</span>
              <Tag tone="warn">实验功能</Tag>
            </div>
            <Button onClick={toggle} disabled={busy} variant={running ? "secondary" : "default"} className="h-10 w-full">
              {running ? <Square /> : <Play />}
              {running ? "停止显示" : live.running ? `切换到${def.name}` : `开始显示${def.name}`}
            </Button>
          </div>
          {meter === "timer" && (
            <Section title="倒计时长度">
              <div className="flex flex-wrap gap-1.5">
                {[5, 15, 25, 45].map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={minutes === m ? "default" : "outline"}
                    onClick={() => {
                      setMinutes(m);
                      if (running) updateLive(params("timer", m));
                    }}
                  >
                    {m} 分钟
                  </Button>
                ))}
              </div>
              <label htmlFor="timer-min" className="flex items-center justify-between gap-3 text-[13px]">
                自定义（分钟）
                <Input
                  id="timer-min"
                  type="number"
                  min={1}
                  max={600}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
                  onBlur={() => running && updateLive(params("timer"))}
                  className="tabular h-8 w-24"
                />
              </label>
              <p className="text-xs text-muted-foreground">改时长会从头开始计时。</p>
            </Section>
          )}
          <Section title="原理">
            <p className="text-xs leading-relaxed text-muted-foreground">
              借用音乐律动的「竖立」画法：键盘被当成 32 列 × 6 格的小屏幕，由电脑实时送数据。颜色由键盘的律动配色决定，左边的预览只是示意。
            </p>
          </Section>
          <Section title="注意">
            <Callout tone="warn">需要插着线使用。显示期间原来的灯效会暂停，停止后自动恢复。切到别的页面也会继续显示，顶栏可以随时停止。</Callout>
          </Section>
        </>
      }
    />
  );
}
