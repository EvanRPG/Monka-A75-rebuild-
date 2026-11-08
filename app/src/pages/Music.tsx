import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "@/components/Keyboard";
import { LiveBars } from "@/components/LiveBars";
import { Callout, Section, Segmented, SliderRow, Workspace } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { IS_DESKTOP, type MusicParams } from "@/lib/backend";
import { LIVE_DEFAULTS, levelsLight } from "@/lib/live";
import { useApp } from "@/lib/store";
import { toast } from "sonner";
import { Play, Square, Volume2 } from "lucide-react";

export default function Music() {
  const { live, liveParams, startLive, updateLive, stopLive, experimental } = useApp();
  /** Without experimental features the stream behaves like the vendor's. */
  const eff = (p: MusicParams): MusicParams => (experimental ? p : { ...p, algo: 1, volumeOverlay: false });
  const [params, setParams] = useState<MusicParams>(() =>
    liveParams?.source === "music" ? liveParams : { ...LIVE_DEFAULTS, ...(liveParams ?? {}), source: "music" },
  );
  const [busy, setBusy] = useState(false);
  const running = live.running && liveParams?.source === "music";
  const levels = useRef(live.levels);
  levels.current = live.levels;
  const style = useRef(params.style);
  style.current = params.style;

  // The demo has no real keyboard to protect: start it so the page shows something.
  useEffect(() => {
    if (!IS_DESKTOP && !live.running) startLive(eff({ ...params, source: "music" })).catch(() => {});
  }, []);

  const change = (p: MusicParams) => {
    setParams(p);
    if (running) updateLive(eff(p));
  };

  const toggle = async () => {
    setBusy(true);
    try {
      if (running) await stopLive();
      else await startLive(eff({ ...params, source: "music" }));
    } catch (e) {
      toast.error(`${running ? "停止" : "启动"}失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  const light = useMemo(() => levelsLight(() => levels.current, () => style.current), []);

  return (
    <Workspace
      stage={<Keyboard light={running ? light : null} showKnob={false} />}
      below={<LiveBars levels={running ? live.levels : new Array(32).fill(0)} title="发往键盘的电平" note="32 段，每段 0 到 6 级，每秒 32 帧" />}
      panel={
        <>
          <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">音乐律动</span>
            </div>
            <Button onClick={toggle} disabled={busy} variant={running ? "secondary" : "default"} className="h-10 w-full">
              {running ? <Square /> : <Play />}
              {running ? "停止律动" : live.running ? "切换到音乐律动" : "开始律动"}
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Volume2 className="size-3.5 shrink-0" />
              <span className="truncate">{(running && live.source) || "跟随系统默认播放设备"}</span>
            </div>
            {live.error && <p className="text-xs text-destructive">已停止：{live.error}</p>}
          </div>
          <Section title="律动模式">
            <Segmented
              id="music-mode"
              className="w-full"
              value={params.mode}
              options={[
                [22, "律动 2"],
                [20, "律动 3"],
              ]}
              onChange={(v) => change({ ...params, mode: v })}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              原版驱动的两种音乐模式，用的是同一份频谱数据，由键盘用各自的方式画出来。
            </p>
          </Section>
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
              onChange={(v) => change({ ...params, style: v, algo: v === 0 ? params.algo : 1 })}
            />
            {experimental && params.style !== 0 && <p className="text-xs leading-relaxed text-muted-foreground">分离和交叉固定用原版的频谱算法，效果和原版驱动一致。</p>}
          </Section>
          {experimental && params.style === 0 && <Section title="频谱算法">
            <Segmented
              id="music-algo"
              className="w-full"
              value={params.algo}
              options={[
                [0, "本软件"],
                [1, "原版"],
              ]}
              onChange={(v) => change({ ...params, algo: v })}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {params.algo === 0
                ? "从低音到高音覆盖全频段，下面的参数都能调。"
                : "照搬原版：只看中频（约 630 到 1400 Hz），每帧把最响的一段拉满。灵敏度、门限和低音加权对它不起作用。"}
            </p>
          </Section>}
          {experimental && (
            <>
          <Section
            title="调节"
            aside={
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => change({ ...LIVE_DEFAULTS, mode: params.mode, style: params.style, algo: params.algo, volumeOverlay: params.volumeOverlay })}>
                恢复默认
              </button>
            }
          >
            <SliderRow disabled={params.algo === 1} id="music-gain" label="灵敏度" value={params.gain} min={0} max={100} onChange={(v) => change({ ...params, gain: v })} format={(v) => `${v}%`} hint="声音小也想跳得满，就调高。" />
            <SliderRow disabled={params.algo === 1} id="music-gate" label="噪声门限" value={params.gate} min={0} max={100} onChange={(v) => change({ ...params, gate: v })} format={(v) => `${v}%`} hint="低于门限的声音不亮灯，安静时键盘保持全暗。" />
            <SliderRow id="music-decay" label="下落拖尾" value={params.decay} min={0} max={100} onChange={(v) => change({ ...params, decay: v })} format={(v) => `${v}%`} hint="越大，灯柱落下得越慢。" />
            <SliderRow disabled={params.algo === 1} id="music-bass" label="低音加权" value={params.bass} min={0} max={100} onChange={(v) => change({ ...params, bass: v })} format={(v) => `${v}%`} hint="突出鼓点和贝斯。" />
            <SliderRow id="music-spread" label="光晕扩散" value={params.spread} min={0} max={100} onChange={(v) => change({ ...params, spread: v })} format={(v) => `${v}%`} hint="让相邻频段互相带亮，画面更柔和。" />
          </Section>
          <Section title="旋钮音量条">
            <label htmlFor="music-vol" className="flex items-center justify-between gap-3 text-[13px]">
              转旋钮时显示音量条
              <Switch id="music-vol" checked={params.volumeOverlay} onCheckedChange={(v) => change({ ...params, volumeOverlay: v })} />
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">律动时调音量，键盘会用 1.5 秒显示一条从左到右的音量条，然后回到律动。</p>
          </Section>
            </>
          )}
          <Section title="注意">
            <Callout tone="warn">
              需要插着线使用。切到别的页面律动会继续，顶栏可以随时停止。停止后会恢复原来的灯效；万一灯不亮，用原版魔咖驱动点「恢复默认」即可恢复。
            </Callout>
          </Section>
        </>
      }
    />
  );
}
