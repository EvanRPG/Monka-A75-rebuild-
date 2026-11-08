import { useEffect, useRef, useState } from "react";
import { Section, Callout } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Macro, type MacroEvent } from "@/lib/backend";
import { CODE, findFn } from "@/lib/keys";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Circle, Save, Square, Trash2, Plus } from "lucide-react";
import { t } from "@/lib/i18n";


const usageName = (u: number) => findFn([0, 0, u, 0])?.label ?? t("键码 {0}", u);

/** US-layout keystrokes for a phrase: [usage, needs shift]. */
const CHAR: Record<string, [number, boolean]> = {
  " ": [44, false], "\n": [40, false], "-": [45, false], _: [45, true], "=": [46, false], "+": [46, true],
  "[": [47, false], "{": [47, true], "]": [48, false], "}": [48, true], "\\": [49, false], "|": [49, true],
  ";": [51, false], ":": [51, true], "'": [52, false], '"': [52, true], "`": [53, false], "~": [53, true],
  ",": [54, false], "<": [54, true], ".": [55, false], ">": [55, true], "/": [56, false], "?": [56, true],
  "!": [30, true], "@": [31, true], "#": [32, true], $: [33, true], "%": [34, true], "^": [35, true],
  "&": [36, true], "*": [37, true], "(": [38, true], ")": [39, true],
};
for (let i = 0; i < 26; i++) {
  CHAR[String.fromCharCode(97 + i)] = [4 + i, false];
  CHAR[String.fromCharCode(65 + i)] = [4 + i, true];
}
for (let i = 1; i <= 9; i++) CHAR[String(i)] = [29 + i, false];
CHAR["0"] = [39, false];

function phraseEvents(text: string): { events: MacroEvent[]; skipped: number } {
  const events: MacroEvent[] = [];
  let skipped = 0;
  for (const ch of text) {
    const k = CHAR[ch];
    if (!k) {
      skipped++;
      continue;
    }
    const [u, shift] = k;
    // Delays generous enough for slow apps and remote desktops to keep up.
    if (shift) events.push({ kind: "key", usage: 225, pressed: true, delayMs: 15 });
    events.push({ kind: "key", usage: u, pressed: true, delayMs: 20 });
    events.push({ kind: "key", usage: u, pressed: false, delayMs: 15 });
    if (shift) events.push({ kind: "key", usage: 225, pressed: false, delayMs: 15 });
  }
  return { events, skipped };
}

const SLOTS = 16;

export default function Macros() {
  const { experimental } = useApp();
  const [slot, setSlot] = useState(0);
  const [macro, setMacro] = useState<Macro>({ repeat: 1, events: [] });
  const [names, setNames] = useState<Record<number, number>>({});
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phrase, setPhrase] = useState("");
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
      // Read it back: the toast should say what the board holds.
      const back = await api.readMacro(slot);
      setNames((n) => ({ ...n, [slot]: back.events.length }));
      if (back.events.length !== macro.events.length) {
        toast.error(t("宏 {0} 写入后读回不一致（写 {1} 步，读回 {2} 步）", slot + 1, macro.events.length, back.events.length));
      } else {
        toast.success(t("宏 {0} 已保存到键盘", slot + 1));
      }
    } catch (e) {
      toast.error(t("保存失败：{0}", e));
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
            <span>{t("宏")} {i + 1}</span>
            <span className="tabular text-xs text-muted-foreground">{names[i] ? t("{0} 步", names[i]) : t("空")}</span>
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-[15px] font-semibold">{t("宏")} {slot + 1}</h2>
          <Button variant={recording ? "destructive" : "outline"} size="sm" onClick={() => {
            if (!recording) { setMacro((m) => ({ ...m, events: [] })); last.current = performance.now(); }
            setRecording(!recording);
          }}>
            {recording ? <Square /> : <Circle className="text-destructive" />}
            {recording ? t("停止录制") : t("重新录制")}
          </Button>
          <Button variant="outline" size="sm" disabled={recording} onClick={() => setMacro((m) => ({ ...m, events: [...m.events, { kind: "key", usage: 4, pressed: true, delayMs: 20 }, { kind: "key", usage: 4, pressed: false, delayMs: 20 }] }))}>
            <Plus />
            {t("添加按键")}
          </Button>
          <Button size="sm" onClick={save} disabled={saving || recording}>
            <Save />
            {t("保存到键盘")}
          </Button>
        </div>
        {recording && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px]">
            <span className="size-2 animate-pulse rounded-full bg-destructive" />
            {t("正在录制：直接在键盘上按键，按键之间的间隔也会记下来。")}
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_120px_40px] items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <span>#</span>
            <span>{t("动作")}</span>
            <span>{t("之后等待")}</span>
            <span />
          </div>
          {macro.events.length === 0 && <p className="px-3 py-10 text-center text-[13px] text-muted-foreground">{t("还没有步骤。点「重新录制」开始。")}</p>}
          {macro.events.map((e, i) => (
            <div key={i} className="grid grid-cols-[44px_minmax(0,1fr)_120px_40px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0">
              <span className="tabular font-mono text-xs text-muted-foreground">{i + 1}</span>
              <span className="flex min-w-0 items-center gap-2 text-[13px]">
                {e.kind !== "mouseMove" && (e.pressed ? <ArrowDown className="size-3.5 shrink-0 text-primary" /> : <ArrowUp className="size-3.5 shrink-0 text-muted-foreground" />)}
                <span className="truncate">
                  {e.kind === "key" ? `${e.pressed ? t("按下") : t("松开")} ${usageName(e.usage)}` : e.kind === "mouseButton" ? t("{0} 鼠标键 {1}", e.pressed ? t("按下") : t("松开"), e.button) : t("鼠标移动 {0}, {1}", e.dx, e.dy)}
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
              <Button variant="ghost" size="icon-xs" aria-label={t("删除这一步")} onClick={() => setMacro((m) => ({ ...m, events: m.events.filter((_, j) => j !== i) }))}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </div>
      <aside className="min-w-0 overflow-y-auto border-t border-border bg-card md:col-span-2 lg:col-span-1 lg:border-t-0 lg:border-l">
        <Section title={t("执行")}>
          <label htmlFor="macro-repeat" className="flex items-center justify-between gap-3 text-[13px]">
            {t("重复次数")}
            <Input id="macro-repeat" type="number" min={1} max={65535} value={macro.repeat} onChange={(e) => setMacro({ ...macro, repeat: Math.max(1, Math.min(65535, Number(e.target.value) || 1)) })} className="tabular h-8 w-24" />
          </label>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{macro.events.length} {t("步")}</span>
            <span className="tabular">{t("单次约")} {(total / 1000).toFixed(2)} {t("秒")}</span>
          </div>
        </Section>
        {experimental && <Section title={t("输入一段文字")}>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("把常用的邮箱、签名、指令变成宏，按一个键就自动打出来。只支持英文、数字和键盘上的符号（中文要靠输入法，宏打不出来）。")}</p>
          <Input id="macro-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={t("在这里输入，比如你的邮箱")} className="h-9" />
          <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={recording} onClick={() => setPhrase("hello@example.com")}>
            {t("填入示例")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!phrase.trim() || recording}
            onClick={() => {
              const { events, skipped } = phraseEvents(phrase);
              if (events.length > 120) {
                toast.error(t("文字太长，键盘的一个宏最多放大约 60 个字母"));
                return;
              }
              setMacro((m) => ({ ...m, events }));
              if (skipped) toast.info(t("有 {0} 个字符不能用宏输入，已跳过", skipped));
            }}
          >
            {t("生成步骤（替换当前步骤）")}
          </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("生成后记得点上方「保存到键盘」，再到按键页绑定。使用时先把电脑输入法切到英文，否则字母会被输入法拦下。")}</p>
        </Section>}
        <Section title={t("绑定到按键")}>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{t("保存后，到「按键」页选一个键，在「宏」分类里点「宏 {0}」。那里还能选触发方式：按一下执行、按一下开/关、按住循环。", slot + 1)}</p>
        </Section>
        <Section title={t("说明")}>
          <Callout>{t("宏会存进键盘，换电脑也能用。保存时软件会控制写入节奏，连续保存之间会稍等几秒。")}</Callout>
        </Section>
      </aside>
    </div>
  );
}
