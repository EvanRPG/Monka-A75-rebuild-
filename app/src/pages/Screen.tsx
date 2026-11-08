import { useMemo, useRef, useState } from "react";
import { Keyboard } from "@/components/Keyboard";
import { Callout, Section, SliderRow, Tag, Workspace } from "@/components/parts";
import { Button } from "@/components/ui/button";
import type { MusicParams } from "@/lib/backend";
import { LIVE_DEFAULTS } from "@/lib/live";
import { useApp } from "@/lib/store";
import { toast } from "sonner";
import { Monitor, Square } from "lucide-react";

export default function Screen() {
  const { live, liveParams, startLive, updateLive, stopLive } = useApp();
  const running = live.running && liveParams?.source === "screen";
  const [boost, setBoost] = useState(liveParams?.boost ?? LIVE_DEFAULTS.boost);
  const [busy, setBusy] = useState(false);
  const color = useRef(live.color);
  color.current = live.color;

  const params = (b = boost): MusicParams => ({ ...LIVE_DEFAULTS, ...(liveParams ?? {}), source: "screen", boost: b });

  const toggle = async () => {
    setBusy(true);
    try {
      if (running) await stopLive();
      else await startLive(params());
    } catch (e) {
      toast.error(`${running ? "停止" : "启动"}失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  const light = useMemo(() => () => color.current ?? null, []);
  const c = live.color;

  return (
    <Workspace
      stage={<Keyboard light={running ? light : null} showKnob={false} />}
      below={
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <div
            className="size-14 shrink-0 rounded-lg border border-border"
            style={{ background: running && c ? `rgb(${c.join(",")})` : "var(--muted)" }}
          />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">发往键盘的颜色</div>
            <div className="tabular font-mono text-xs text-muted-foreground">
              {running && c ? `R ${c[0]}  G ${c[1]}  B ${c[2]}` : "未开始"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">整块屏幕的平均色，每秒 25 次，整个键盘一起变色。</p>
          </div>
        </div>
      }
      panel={
        <>
          <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">屏幕光影</span>
              <Tag tone="warn">实验功能</Tag>
            </div>
            <Button onClick={toggle} disabled={busy} variant={running ? "secondary" : "default"} className="h-10 w-full">
              {running ? <Square /> : <Monitor />}
              {running ? "停止跟随" : live.running ? "切换到屏幕光影" : "开始跟随屏幕"}
            </Button>
            {live.error && <p className="text-xs text-destructive">已停止：{live.error}</p>}
          </div>
          <Section title="色彩">
            <SliderRow
              id="screen-boost"
              label="鲜艳度"
              value={boost}
              min={0}
              max={100}
              onChange={(v) => {
                setBoost(v);
                if (running) updateLive(params(v));
              }}
              format={(v) => `${v}%`}
              hint="屏幕平均下来大多偏灰，调高让键盘颜色更饱和、更亮。"
            />
          </Section>
          <Section title="说明">
            <Callout>
              做法照搬原版：把屏幕缩成一个像素取平均色，用屏幕光影模式发给键盘。只能整体变色，做不到每个键单独变。只取主显示器。
            </Callout>
            <Callout tone="warn">需要插着线使用。停止后恢复原来的灯效。这是第一次在你的键盘上跑，效果要实测。</Callout>
          </Section>
        </>
      }
    />
  );
}
