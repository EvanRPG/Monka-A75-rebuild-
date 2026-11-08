import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "@/components/Keyboard";
import { Callout, Section, Segmented, SliderRow, Tag, Workspace } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { LIT_KEYS, type KeyCap } from "@/lib/a75";
import { api, IS_DESKTOP, type MusicParams, type MusicStatus } from "@/lib/backend";
import { toast } from "sonner";
import { Play, Square, Volume2 } from "lucide-react";
import type { Rgb } from "@/lib/effects";

const DEFAULTS: MusicParams = { style: 0, gain: 55, gate: 12, decay: 45, bass: 30, spread: 25 };

const X0 = Math.min(...LIT_KEYS.map((k) => k.x));
const X1 = Math.max(...LIT_KEYS.map((k) => k.x + k.w));
const ROWS = [...new Set(LIT_KEYS.map((k) => k.y))].sort((a, b) => a - b);

function bandOf(k: KeyCap) {
  return Math.min(31, Math.floor((((k.x + k.w / 2) - X0) / (X1 - X0)) * 32));
}
function rowOf(k: KeyCap) {
  return ROWS.indexOf(k.y);
}
function hue(t: number): Rgb {
  const f = (n: number) => {
    const k = (n + t * 6) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

export default function Music() {
  const [params, setParams] = useState<MusicParams>(DEFAULTS);
  const [status, setStatus] = useState<MusicStatus>({ running: false, source: null, levels: new Array(32).fill(0) });
  const [busy, setBusy] = useState(false);
  const levels = useRef(status.levels);
  levels.current = status.levels;
  const style = useRef(params.style);
  style.current = params.style;

  // Read back what was actually sent, ~30 times a second while running.
  useEffect(() => {
    if (!status.running) return;
    let alive = true;
    const tick = () => {
      api
        .musicStatus()
        .then((s) => alive && setStatus(s))
        .catch(() => {});
    };
    const t = setInterval(tick, 33);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [status.running]);

  // Leaving the page stops the stream, so the keyboard is never left in music mode.
  useEffect(() => () => void api.musicStop().catch(() => {}), []);

  // The demo has no real keyboard to protect: start it so the page shows something.
  useEffect(() => {
    if (IS_DESKTOP) return;
    api.musicStart(DEFAULTS).then(() => api.musicStatus()).then(setStatus).catch(() => {});
  }, []);

  const change = (p: MusicParams) => {
    setParams(p);
    if (status.running) api.musicParams(p).catch(() => {});
  };

  const toggle = async () => {
    setBusy(true);
    try {
      if (status.running) {
        await api.musicStop();
        setStatus({ running: false, source: null, levels: new Array(32).fill(0) });
      } else {
        await api.musicStart(params);
        setStatus(await api.musicStatus());
      }
    } catch (e) {
      toast.error(`${status.running ? "停止" : "启动"}失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  const light = useMemo(
    () => (k: KeyCap) => {
      const b = bandOf(k);
      const L = levels.current[b] ?? 0;
      const r = rowOf(k); // 0 = top row, 5 = bottom row
      let on = false;
      if (style.current === 0) on = 5 - r < L;
      else if (style.current === 1) on = Math.abs(r - 2.5) < L / 2;
      else on = b % 2 === 0 ? 5 - r < L : r < L;
      return on ? hue(b / 32) : null;
    },
    [],
  );

  const peak = Math.max(...status.levels);

  return (
    <Workspace
      stage={<Keyboard light={status.running ? light : null} showKnob={false} />}
      below={
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold">发往键盘的电平</h3>
              <span className="text-xs text-muted-foreground">32 段，每段 0 到 6 级，每秒 32 帧</span>
            </div>
            <span className="tabular font-mono text-xs text-muted-foreground">峰值 {peak} / 6</span>
          </div>
          <div className="flex h-28 items-end gap-[3px]" aria-label="频谱">
            {status.levels.map((v, i) => (
              <div key={i} className="flex h-full flex-1 flex-col-reverse gap-[2px]">
                {Array.from({ length: 6 }, (_, j) => (
                  <div
                    key={j}
                    className="flex-1 rounded-[2px] transition-colors duration-75"
                    style={{
                      background: j < v ? `rgb(${hue(i / 32).join(",")})` : "var(--muted)",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>低音</span>
            <span>中音</span>
            <span>高音</span>
          </div>
        </div>
      }
      panel={
        <>
          <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">音乐律动</span>
              <Tag tone="warn">实验功能</Tag>
            </div>
            <Button onClick={toggle} disabled={busy} variant={status.running ? "secondary" : "default"} className="h-10 w-full">
              {status.running ? <Square /> : <Play />}
              {status.running ? "停止律动" : "开始律动"}
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Volume2 className="size-3.5 shrink-0" />
              <span className="truncate">{status.source ?? "跟随系统默认播放设备"}</span>
            </div>
            {status.error && <p className="text-xs text-destructive">律动已停止：{status.error}</p>}
          </div>
          <Section title="样式">
            <Segmented
              id="music-style"
              className="w-full"
              value={params.style}
              options={[
                [0, "竖立"],
                [1, "分离"],
                [2, "交叉"],
              ]}
              onChange={(v) => change({ ...params, style: v })}
            />
          </Section>
          <Section title="调节" aside={<button type="button" className="text-xs text-primary hover:underline" onClick={() => change(DEFAULTS)}>恢复默认</button>}>
            <SliderRow id="music-gain" label="灵敏度" value={params.gain} min={0} max={100} onChange={(v) => change({ ...params, gain: v })} format={(v) => `${v}%`} hint="声音小也想跳得满，就调高。" />
            <SliderRow id="music-gate" label="噪声门限" value={params.gate} min={0} max={100} onChange={(v) => change({ ...params, gate: v })} format={(v) => `${v}%`} hint="低于门限的声音不亮灯，安静时键盘保持全暗。" />
            <SliderRow id="music-decay" label="下落拖尾" value={params.decay} min={0} max={100} onChange={(v) => change({ ...params, decay: v })} format={(v) => `${v}%`} hint="越大，灯柱落下得越慢。" />
            <SliderRow id="music-bass" label="低音加权" value={params.bass} min={0} max={100} onChange={(v) => change({ ...params, bass: v })} format={(v) => `${v}%`} hint="突出鼓点和贝斯。" />
            <SliderRow id="music-spread" label="光晕扩散" value={params.spread} min={0} max={100} onChange={(v) => change({ ...params, spread: v })} format={(v) => `${v}%`} hint="让相邻频段互相带亮，画面更柔和。" />
          </Section>
          <Section title="注意">
            <Callout tone="warn">
              律动需要插着线使用。如果停止后键盘灯不亮，打开原版魔咖驱动，点「恢复默认」即可恢复，键盘不会损坏。
            </Callout>
          </Section>
        </>
      }
    />
  );
}
