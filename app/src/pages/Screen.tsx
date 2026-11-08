import { Keyboard } from "@/components/Keyboard";
import { Callout, Section, Tag, Workspace } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Monitor } from "lucide-react";

export default function Screen() {
  return (
    <Workspace
      stage={<Keyboard light={(k) => {
        const t = (k.x + k.w / 2) / 871;
        return [Math.round(30 + 200 * t), Math.round(90 + 60 * Math.sin(t * 3)), Math.round(220 - 170 * t)];
      }} showKnob={false} />}
      below={
        <div className="rounded-xl border border-dashed border-border bg-card p-5 text-[13px] leading-relaxed text-muted-foreground">
          屏幕光影会取屏幕上的主色，实时铺到键盘上，看视频、打游戏时键盘跟着画面变色。键盘图上是示意效果。
        </div>
      }
      panel={
        <>
          <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">屏幕光影</span>
              <Tag tone="muted">开发中</Tag>
            </div>
            <Button disabled className="h-10 w-full">
              <Monitor />
              开始跟随屏幕
            </Button>
          </div>
          <Section title="进度">
            <Callout>
              还差一步：确认键盘接收屏幕颜色的数据格式。每帧只有 64 字节，放不下每个键单独的颜色，所以效果会是整体或分区变色。确认后在这里开放。
            </Callout>
          </Section>
        </>
      }
    />
  );
}
