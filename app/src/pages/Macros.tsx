import { useEffect, useRef, useState } from "react";
import { Section, Callout } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Macro, type MacroEvent } from "@/lib/backend";
import { findFn } from "@/lib/keys";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Circle, Save, Square, Trash2, Plus } from "lucide-react";

const CODE: Record<string, number> = {
  Enter: 40, Escape: 41, Backspace: 42, Tab: 43, Space: 44, Minus: 45, Equal: 46, BracketLeft: 47,
  BracketRight: 48, Backslash: 49, Semicolon: 51, Quote: 52, Backquote: 53, Comma: 54, Period: 55,
  Slash: 56, CapsLock: 57, PrintScreen: 70, ScrollLock: 71, Pause: 72, Insert: 73, Home: 74,
  PageUp: 75, Delete: 76, End: 77, PageDown: 78, ArrowRight: 79, ArrowLeft: 80, ArrowDown: 81,
  ArrowUp: 82, ControlLeft: 224, ShiftLeft: 225, AltLeft: 226, MetaLeft: 227, ControlRight: 228,
  ShiftRight: 229, AltRight: 230, MetaRight: 231,
};
for (let i = 0; i < 26; i++) CODE[`Key${String.fromCharCode(65 + i)}`] = 4 + i;
for (let i = 1; i <= 9; i++) CODE[`Digit${i}`] = 29 + i;
CODE.Digit0 = 39;
for (let i = 1; i <= 12; i++) CODE[`F${i}`] = 57 + i;

const usageName = (u: number) => findFn([0, 0, u, 0])?.label ?? `键码 ${u}`;

const SLOTS = 16;

export default function Macros() {
  const [slot, setSlot] = useState(0);
  const [macro, setMacro] = useState<Macro>({ repeat: 1, events: [] });
  const [names, setNames] = useState<Record<number, number>>({});
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    api.readMacro(slot).then((m) => {
      setMacro(m);
      setNames((n) => ({ ...n, [slot]: m.events.length }));
    });
  }, [slot]);

  useEffect(() => {
    // Fill in the list's event counts once.
    for (let i = 0; i < SLOTS; i++) api.readMacro(i).then((m) => setNames((n) => ({ ...n, [i]: m.events.length })));
  }, []);

  useEffect(() => {
    if (!recording) return;
    const on = (e: KeyboardEvent) => {
      const u = CODE[e.code];
      if (u === undefined || e.repeat) return;
      e.preventDefault();
      const now = performance.now();
      setMacro((m) => {
        const events = [...m.events];
        if (events.length) events[events.length - 1] = { ...events[events.length - 1], delayMs: Math.min(65535, Math.round(now - last.current)) };
        events.push({ kind: "key", usage: u, pressed: e.type === "keydown", delayMs: 10 });
        return { ...m, events };
      });
      last.current = now;
    };
    window.addEventListener("keydown", on);
    window.addEventListener("keyup", on);
    return () => {
      window.removeEventListener("keydown", on);
      window.removeEventListener("keyup", on);
    };
  }, [recording]);

  const setEvent = (i: number, ev: MacroEvent) => setMacro((m) => ({ ...m, events: m.events.map((e, j) => (j === i ? ev : e)) }));

  const save = async () => {
    setSaving(true);
    try {
      await api.writeMacro(slot, macro);
      setNames((n) => ({ ...n, [slot]: macro.events.length }));
      toast.success(`宏 ${slot + 1} 已保存到键盘`);
    } catch (e) {
      toast.error(`保存失败：${e}`);
    } finally {
      setSaving(false);
    }
  };

  const total = macro.events.reduce((s, e) => s + e.delayMs, 0);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)_320px]">
      <nav className="flex gap-1 overflow-x-auto border-b border-border p-2 md:flex-col md:overflow-y-auto md:border-r md:border-b-0">
        {Array.from({ length: SLOTS }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => !recording && setSlot(i)}
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[13px]",
              i === slot ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>宏 {i + 1}</span>
            <span className="tabular text-xs text-muted-foreground">{names[i] ? `${names[i]} 步` : "空"}</span>
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-[15px] font-semibold">宏 {slot + 1}</h2>
          <Button variant={recording ? "destructive" : "outline"} size="sm" onClick={() => {
            if (!recording) { setMacro((m) => ({ ...m, events: [] })); last.current = performance.now(); }
            setRecording(!recording);
          }}>
            {recording ? <Square /> : <Circle className="text-destructive" />}
            {recording ? "停止录制" : "重新录制"}
          </Button>
          <Button variant="outline" size="sm" disabled={recording} onClick={() => setMacro((m) => ({ ...m, events: [...m.events, { kind: "key", usage: 4, pressed: true, delayMs: 20 }, { kind: "key", usage: 4, pressed: false, delayMs: 20 }] }))}>
            <Plus />
            添加按键
          </Button>
          <Button size="sm" onClick={save} disabled={saving || recording}>
            <Save />
            保存到键盘
          </Button>
        </div>
        {recording && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px]">
            <span className="size-2 animate-pulse rounded-full bg-destructive" />
            正在录制：直接在键盘上按键，按键之间的间隔也会记下来。
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_120px_40px] items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <span>#</span>
            <span>动作</span>
            <span>之后等待</span>
            <span />
          </div>
          {macro.events.length === 0 && <p className="px-3 py-10 text-center text-[13px] text-muted-foreground">还没有步骤。点「重新录制」开始。</p>}
          {macro.events.map((e, i) => (
            <div key={i} className="grid grid-cols-[44px_minmax(0,1fr)_120px_40px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0">
              <span className="tabular font-mono text-xs text-muted-foreground">{i + 1}</span>
              <span className="flex min-w-0 items-center gap-2 text-[13px]">
                {e.kind !== "mouseMove" && (e.pressed ? <ArrowDown className="size-3.5 shrink-0 text-primary" /> : <ArrowUp className="size-3.5 shrink-0 text-muted-foreground" />)}
                <span className="truncate">
                  {e.kind === "key" ? `${e.pressed ? "按下" : "松开"} ${usageName(e.usage)}` : e.kind === "mouseButton" ? `${e.pressed ? "按下" : "松开"} 鼠标键 ${e.button}` : `鼠标移动 ${e.dx}, ${e.dy}`}
                </span>
              </span>
              <div className="flex items-center gap-1">
                <Input
                  id={`macro-delay-${i}`}
                  type="number"
                  min={0}
                  max={65535}
                  value={e.delayMs}
                  onChange={(ev) => setEvent(i, { ...e, delayMs: Math.max(0, Math.min(65535, Number(ev.target.value) || 0)) })}
                  className="tabular h-7 w-20 px-2 text-[13px]"
                />
                <span className="text-xs text-muted-foreground">ms</span>
              </div>
              <Button variant="ghost" size="icon-xs" aria-label="删除这一步" onClick={() => setMacro((m) => ({ ...m, events: m.events.filter((_, j) => j !== i) }))}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </div>
      <aside className="min-w-0 overflow-y-auto border-t border-border bg-card md:col-span-2 lg:col-span-1 lg:border-t-0 lg:border-l">
        <Section title="执行">
          <label htmlFor="macro-repeat" className="flex items-center justify-between gap-3 text-[13px]">
            重复次数
            <Input id="macro-repeat" type="number" min={1} max={65535} value={macro.repeat} onChange={(e) => setMacro({ ...macro, repeat: Math.max(1, Math.min(65535, Number(e.target.value) || 1)) })} className="tabular h-8 w-24" />
          </label>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{macro.events.length} 步</span>
            <span className="tabular">单次约 {(total / 1000).toFixed(2)} 秒</span>
          </div>
        </Section>
        <Section title="绑定到按键">
          <p className="text-[13px] leading-relaxed text-muted-foreground">保存后，到「按键」页选一个键，在「宏」分类里点「宏 {slot + 1}」。</p>
        </Section>
        <Section title="说明">
          <Callout>宏会存进键盘，换电脑也能用。保存时软件会控制写入节奏，连续保存之间会稍等几秒。</Callout>
        </Section>
      </aside>
    </div>
  );
}
