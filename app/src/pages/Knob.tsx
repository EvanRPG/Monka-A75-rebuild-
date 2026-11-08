import { useEffect, useState } from "react";
import { Callout, Section, Segmented } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_FN_MATRIX, defaultMatrix, entryAt, type Entry } from "@/lib/a75";
import { api } from "@/lib/backend";
import { GROUPS, describe, sameEntry } from "@/lib/keys";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RotateCcw, RotateCw, CircleDot } from "lucide-react";

const LEFT = 91;
const RIGHT = 90;
const PRESS = 84;
type Layer = "base" | "fn";

const E = (a: number, b: number, c: number, d: number): Entry => [a, b, c, d];

const PRESETS: { id: string; name: string; desc: string; left: Entry; right: Entry; press: Entry | null }[] = [
  { id: "volume", name: "音量", desc: "左转减小、右转增大，按下静音", left: E(3, 0, 234, 0), right: E(3, 0, 233, 0), press: E(3, 0, 226, 0) },
  { id: "media", name: "切歌", desc: "左转上一首、右转下一首，按下播放/暂停", left: E(3, 0, 182, 0), right: E(3, 0, 181, 0), press: E(3, 0, 205, 0) },
  { id: "light", name: "键盘灯光亮度", desc: "左转变暗、右转变亮，按下开关灯", left: E(13, 2, 2, 0), right: E(13, 2, 1, 0), press: E(13, 0, 0, 0) },
  { id: "screen", name: "屏幕亮度", desc: "左转变暗、右转变亮（笔记本屏幕）", left: E(3, 0, 112, 0), right: E(3, 0, 111, 0), press: null },
  { id: "scroll", name: "鼠标滚轮", desc: "左转向上滚、右转向下滚，按下鼠标中键", left: E(1, 0, 245, 1), right: E(1, 0, 245, 255), press: E(1, 0, 242, 0) },
  { id: "speed", name: "灯效速度", desc: "左转变慢、右转变快，按下切换灯效", left: E(13, 3, 2, 0), right: E(13, 3, 1, 0), press: E(13, 1, 0, 0) },
];

const PICKABLE = GROUPS.filter((g) => ["media", "light", "mouse", "nav", "board", "special"].includes(g.id));

function FnSelect({ id, value, onChange }: { id: string; value: Entry | null; onChange: (e: Entry) => void }) {
  const key = value ? value.join(",") : "";
  const known = value && PICKABLE.some((g) => g.items.some((f) => sameEntry(f.entry, value)));
  return (
    <Select value={key} onValueChange={(v) => onChange(v.split(",").map(Number) as Entry)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="读取中…">{value ? describe(value) : undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {value && !known && (
          <SelectItem value={key}>{describe(value)}（当前）</SelectItem>
        )}
        {PICKABLE.map((g) => (
          <SelectGroup key={g.id}>
            <SelectLabel>{g.name}</SelectLabel>
            {g.items.map((f) => (
              <SelectItem key={f.entry.join(",")} value={f.entry.join(",")}>
                {f.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Knob() {
  const { profile } = useApp();
  const [layer, setLayer] = useState<Layer>("base");
  const [maps, setMaps] = useState<{ base: number[]; fn: number[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.readKeymap(profile), api.readFnKeymap(profile)])
      .then(([base, fn]) => setMaps({ base, fn }))
      .catch((e) => toast.error(`读取失败：${e}`));
  }, [profile]);

  const m = maps?.[layer] ?? null;
  const cur = (slot: number) => (m ? entryAt(m, slot) : null);
  const defaults = layer === "base" ? defaultMatrix() : DEFAULT_FN_MATRIX;

  const write = async (pairs: [number, Entry][]) => {
    if (!maps) return;
    setBusy(true);
    try {
      for (const [slot, e] of pairs) {
        if (m && sameEntry(entryAt(m, slot), e)) continue;
        await api.setKey(profile, slot, e, layer === "fn");
        setMaps((prev) => {
          if (!prev) return prev;
          const next = [...prev[layer]];
          e.forEach((b, i) => (next[slot * 4 + i] = b));
          return { ...prev, [layer]: next };
        });
      }
      toast.success("旋钮已写入");
    } catch (e) {
      toast.error(`写入失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  const active = PRESETS.find((p) => {
    const l = cur(LEFT);
    const r = cur(RIGHT);
    const pr = cur(PRESS);
    return l && r && sameEntry(l, p.left) && sameEntry(r, p.right) && (!p.press || (pr && sameEntry(pr, p.press)));
  });

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            id="knob-layer"
            value={layer}
            options={[
              ["base", "直接转旋钮"],
              ["fn", "按住 Fn 转旋钮"],
            ]}
            onChange={setLayer}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !maps}
            onClick={() => write([[LEFT, entryAt(defaults, LEFT)], [RIGHT, entryAt(defaults, RIGHT)], [PRESS, entryAt(defaults, PRESS)]])}
          >
            <RotateCcw />
            恢复出厂
          </Button>
        </div>

        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 text-[14px] font-semibold">一键套用</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy || !maps}
                onClick={() => write([[LEFT, p.left], [RIGHT, p.right], ...(p.press ? ([[PRESS, p.press]] as [number, Entry][]) : [])])}
                className={cn(
                  "rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-50",
                  active?.id === p.id ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-accent",
                )}
              >
                <div className="text-[13px] font-medium">{p.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{p.desc}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
          {(
            [
              [LEFT, "左转", RotateCcw],
              [RIGHT, "右转", RotateCw],
              [PRESS, "按下", CircleDot],
            ] as const
          ).map(([slot, name, Icon]) => (
            <div key={slot} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <Icon className="size-4 text-muted-foreground" />
                {name}
              </div>
              <FnSelect id={`knob-${slot}`} value={cur(slot)} onChange={(e) => write([[slot, e]])} />
              <div className="text-xs text-muted-foreground">出厂：{describe(entryAt(defaults, slot), layer === "fn")}</div>
            </div>
          ))}
        </section>

        <Section title="说明" className="rounded-xl border border-border bg-card">
          <Callout>
            每改一项写一次键盘，按顺序写入，三项一起改大约 2 秒。需要更多功能（比如组合键、宏）可以到「按键」页点旋钮来改。
          </Callout>
        </Section>
      </div>
    </div>
  );
}
