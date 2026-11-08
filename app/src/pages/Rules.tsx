import { useEffect, useRef, useState } from "react";
import { Callout, ColorSwatches, Segmented, Tag } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRIGHTNESS_MAX, EFFECTS, effectByMode } from "@/lib/a75";
import { api, type AppRule, type LedParam, type Prefs } from "@/lib/backend";
import { useApp } from "@/lib/store";
import { toast } from "sonner";
import { AppWindow, Plus, Trash2 } from "lucide-react";

const ONBOARD = EFFECTS.filter((e) => e.kind === "onboard");

function RuleCard({ rule, onChange, onDelete }: { rule: AppRule; onChange: (r: AppRule) => void; onDelete: () => void }) {
  const eff = effectByMode(rule.led.mode);
  const setLed = (p: Partial<LedParam>) => onChange({ ...rule, led: { ...rule.led, ...p } });
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <AppWindow className="size-4 shrink-0 text-muted-foreground" />
        <span className="mr-auto truncate font-mono text-[13px] font-medium">{rule.exe}</span>
        <Button variant="ghost" size="icon-sm" aria-label={`删除 ${rule.exe} 的规则`} onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted-foreground" htmlFor={`rule-eff-${rule.exe}`}>灯效</label>
          <Select value={String(rule.led.mode)} onValueChange={(v) => setLed({ mode: Number(v), option: 0 })}>
            <SelectTrigger id={`rule-eff-${rule.exe}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {ONBOARD.map((e) => (
                <SelectItem key={e.mode} value={String(e.mode)}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="mt-1 text-xs text-muted-foreground" htmlFor={`rule-br-${rule.exe}`}>亮度</label>
          <Segmented
            id={`rule-br-${rule.exe}`}
            size="sm"
            value={rule.led.brightness}
            options={Array.from({ length: BRIGHTNESS_MAX + 1 }, (_, i) => [i, i === 0 ? "关" : String(i)] as [number, string])}
            onChange={(v) => setLed({ brightness: v })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">颜色</span>
          {eff?.rgb ? (
            <>
              <Segmented
                id={`rule-cm-${rule.exe}`}
                size="sm"
                value={rule.led.dazzle ? "r" : "s"}
                options={[
                  ["s", "单色"],
                  ["r", "七彩"],
                ]}
                onChange={(v) => setLed({ dazzle: v === "r" })}
              />
              {!rule.led.dazzle && (
                <ColorSwatches id={`rule-c-${rule.exe}`} value={[rule.led.r, rule.led.g, rule.led.b]} onChange={([r, g, b]) => setLed({ r, g, b })} />
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">这个灯效固定七彩。</p>
          )}
        </div>
      </div>
      <label htmlFor={`rule-win-${rule.exe}`} className="flex items-center justify-between gap-3 border-t border-border pt-3 text-[13px]">
        <span>
          同时锁定 Win 键
          <span className="block text-xs text-muted-foreground">离开这个程序后恢复原样</span>
        </span>
        <Switch id={`rule-win-${rule.exe}`} checked={rule.winLock} onCheckedChange={(v) => onChange({ ...rule, winLock: v })} />
      </label>
    </div>
  );
}

export default function Rules() {
  const { led } = useApp();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [name, setName] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getPrefs().then(setPrefs).catch((e) => toast.error(`读取失败：${e}`));
    const load = () => api.recentApps().then(setRecent).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const save = (p: Prefs) => {
    setPrefs(p);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => api.setPrefs(p).catch((e) => toast.error(`保存失败：${e}`)), 400);
  };

  if (!prefs) return null;

  const add = (exe: string) => {
    const e = exe.trim().toLowerCase();
    if (!e) return;
    const file = e.endsWith(".exe") ? e : `${e}.exe`;
    if (prefs.rules.some((r) => r.exe === file)) return toast.info(`${file} 已经有规则了`);
    const base: LedParam = led ?? { mode: 1, speed: 2, brightness: 4, option: 0, dazzle: false, r: 255, g: 255, b: 255 };
    save({ ...prefs, rules: [...prefs.rules, { exe: file, led: { ...base, mode: 1, dazzle: false, r: 255, g: 59, b: 48 }, winLock: false }] });
    setName("");
  };

  const candidates = recent.filter((r) => !prefs.rules.some((x) => x.exe === r));

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold">按程序自动切换灯效</h3>
              <Tag tone="warn">实验功能</Tag>
            </div>
            <Switch id="rules-on" aria-label="启用按程序切换" checked={prefs.rulesEnabled} onCheckedChange={(v) => save({ ...prefs, rulesEnabled: v })} />
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            切到下面列出的程序时，键盘自动换成对应的灯效；切到其他程序就换回原来的样子。每次切换只写一次键盘。律动和屏幕光影运行时不会切换。
          </p>
          <Callout>关掉窗口后软件会留在右下角托盘里继续工作。要完全退出，在托盘图标上点右键选「退出」。</Callout>
        </section>

        {prefs.rules.map((r, i) => (
          <RuleCard
            key={r.exe}
            rule={r}
            onChange={(nr) => save({ ...prefs, rules: prefs.rules.map((x, j) => (j === i ? nr : x)) })}
            onDelete={() => save({ ...prefs, rules: prefs.rules.filter((_, j) => j !== i) })}
          />
        ))}

        <section className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-card p-5">
          <h3 className="text-[14px] font-semibold">添加程序</h3>
          {candidates.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">最近在前台出现过的程序（先打开游戏，再切回这里）：</p>
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((r) => (
                  <Button key={r} variant="outline" size="sm" onClick={() => add(r)}>
                    <Plus />
                    {r}
                  </Button>
                ))}
              </div>
            </>
          )}
          <div className="flex gap-2">
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add(name)}
              placeholder="或直接输入程序名，例如 valorant.exe"
              className="h-9"
            />
            <Button onClick={() => add(name)} disabled={!name.trim()}>
              添加
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
