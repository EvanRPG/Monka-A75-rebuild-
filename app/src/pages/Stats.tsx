import { useEffect, useMemo, useState } from "react";
import { Keyboard } from "@/components/Keyboard";
import { Callout, Section, Tag, Workspace } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { KEYS, LIT_KEYS, defaultMatrix, entryAt, type KeyCap } from "@/lib/a75";
import { api, type Prefs, type Stats as StatsT } from "@/lib/backend";
import type { Rgb } from "@/lib/effects";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { t } from "@/lib/i18n";

const BASE = defaultMatrix();
/** HID usage the key sends out of the box, for matching counts to keys. */
const usageOf = (k: KeyCap) => {
  const e = entryAt(BASE, k.slot);
  return e[0] === 0 && e[1] === 0 ? e[2] : -1;
};

/** Cold to hot: dark blue, cyan, yellow, red. */
function heat(t: number): Rgb {
  const stops: Rgb[] = [
    [20, 40, 120],
    [0, 190, 255],
    [255, 220, 0],
    [255, 40, 20],
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f)) as Rgb;
}

export default function Stats() {
  const [stats, setStats] = useState<StatsT | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [writing, setWriting] = useState(false);
  /** When the switch last turned on: the listener needs a moment to start. */
  const [enabledAt, setEnabledAt] = useState(0);

  useEffect(() => {
    api.getPrefs().then(setPrefs).catch(() => {});
    const load = () => api.getStats().then(setStats).catch(() => {});
    load();
    const iv = setInterval(load, 2000);
    return () => clearInterval(iv);
  }, []);

  const max = useMemo(() => Math.max(1, ...Object.values(stats?.counts ?? {})), [stats]);
  const colorOf = (k: KeyCap): Rgb | null => {
    const n = stats?.counts[String(usageOf(k))] ?? 0;
    return n > 0 ? heat(Math.sqrt(n / max)) : null;
  };

  const top = useMemo(() => {
    if (!stats) return [];
    return KEYS.filter((k) => !k.knob)
      .map((k) => ({ k, n: stats.counts[String(usageOf(k))] ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
  }, [stats]);

  const toggle = async (on: boolean) => {
    if (!prefs) return;
    const p = { ...prefs, statsEnabled: on };
    setPrefs(p);
    if (on) setEnabledAt(Date.now());
    await api.setPrefs(p).catch((e) => toast.error(t("保存失败：{0}", e)));
    setStats(await api.getStats());
  };

  const writeHeatmap = async () => {
    setWriting(true);
    try {
      const colors = new Array(384).fill(0);
      for (const k of LIT_KEYS) {
        const c = colorOf(k) ?? [0, 0, 0];
        colors.splice(k.slot * 3, 3, ...c);
      }
      await api.writePerKey(colors, true);
      toast.success(t("热力图已写进键盘（逐键自定义模式）"));
    } catch (e) {
      toast.error(t("写入失败：{0}", e));
    } finally {
      setWriting(false);
    }
  };

  const since = stats ? new Date(Number(stats.since) * 1000).toLocaleDateString("zh-CN") : "";

  return (
    <Workspace
      stage={<Keyboard light={stats && stats.total > 0 ? colorOf : null} showKnob={false} />}
      below={
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t("总按键次数")} value={stats ? stats.total.toLocaleString("zh-CN") : "—"} />
            <Stat label={t("最近一分钟")} value={stats ? t("{0} 次", stats.perMinute) : "—"} />
            <Stat label={t("统计开始于")} value={since || "—"} />
            <Stat label={t("按过的键")} value={stats ? t("{0} 个", Object.keys(stats.counts).length) : "—"} />
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-[13px] font-semibold">{t("最常用的 10 个键")}</h3>
            {top.length === 0 ? (
              <p className="py-4 text-[13px] text-muted-foreground">{t("还没有数据。打开右侧开关后正常打字即可。")}</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {top.map(({ k, n }) => (
                  <li key={k.slot} className="flex items-center gap-2 text-[13px]">
                    <span className="w-16 truncate font-mono">{k.name}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: `rgb(${heat(Math.sqrt(n / max)).join(",")})` }} />
                    </span>
                    <span className="tabular w-14 text-right font-mono text-xs text-muted-foreground">{n}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      }
      panel={
        <>
          <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{t("打字统计")}</span>
              <Tag tone="warn">{t("实验功能")}</Tag>
            </div>
            <label htmlFor="stats-on" className="flex items-center justify-between gap-3 text-[13px]">
              {t("记录按键次数")}
              <Switch id="stats-on" checked={!!prefs?.statsEnabled} onCheckedChange={toggle} />
            </label>
            {prefs?.statsEnabled && stats && !stats.active && Date.now() - enabledAt > 4000 && <p className="text-xs text-destructive">{t("计数没有启动：这台电脑不允许软件监听按键。")}</p>}
          </div>
          <Section title={t("隐私")}>
            <Callout>{t("只数每个键按了几次，不记录你打了什么字，也不记录顺序。数据只存在这台电脑上，不会上传。关掉开关就停止记录。")}</Callout>
          </Section>
          <Section title={t("热力图")}>
            <p className="text-xs leading-relaxed text-muted-foreground">{t("左边键盘图上，越常按的键越红，按得少的偏蓝。也可以把它写进键盘，作为逐键灯光图案。")}</p>
            <Button variant="outline" disabled={writing || !stats || stats.total === 0} onClick={writeHeatmap}>
              <Upload />
              {writing ? t("正在写入…") : t("把热力图写进键盘")}
            </Button>
          </Section>
          <Section title={t("清空")}>
            {confirm ? (
              <div className="flex items-center gap-2">
                <span className="mr-auto text-[13px] text-destructive">{t("清空所有统计？")}</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{t("取消")}</Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    await api.resetStats();
                    setStats(await api.getStats());
                    setConfirm(false);
                  }}
                >
                  {t("清空")}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="self-start" onClick={() => setConfirm(true)}>
                {t("清空统计")}
              </Button>
            )}
          </Section>
        </>
      }
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
