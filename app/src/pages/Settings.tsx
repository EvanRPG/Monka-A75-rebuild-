import { useEffect, useState, type ReactNode } from "react";
import { Callout, Segmented } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_FN_MATRIX, KEYS, entryAt } from "@/lib/a75";
import { api, IS_DESKTOP, type Prefs } from "@/lib/backend";
import { LANG, LANGS, setLang, t, type Lang } from "@/lib/i18n";
import { describe } from "@/lib/keys";
import { useApp, type ThemeChoice } from "@/lib/store";
import { toast } from "sonner";
import { ClipboardCopy, ExternalLink, FlaskConical, RefreshCw } from "lucide-react";

export const REPO = "EvanRPG/Monka-A75-rebuild-";
export const REPO_URL = `https://github.com/${REPO}`;
const UPSTREAM_URL = "https://github.com/dniminenn/sharkfin";
/** Shown in the browser preview; the desktop app reads its own. */
const PREVIEW_VERSION = "0.3.0";

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-[13px]">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

async function openUrl(url: string) {
  if (IS_DESKTOP) {
    const { openUrl: open } = await import("@tauri-apps/plugin-opener");
    await open(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/** "0.3.0" vs "v0.3.1": positive when b is newer. */
function newer(a: string, b: string): boolean {
  const n = (v: string) => v.replace(/^v/i, "").split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) > (x[i] ?? 0);
  }
  return false;
}

type Update = { state: "idle" | "checking" } | { state: "latest" } | { state: "found"; tag: string; url: string } | { state: "none" } | { state: "error"; msg: string };

/** Experimental features, listed where the switch is. */
const EXPERIMENTAL = [
  "键盘仪表（CPU、内存、音量、倒计时）",
  "旋钮页",
  "按程序切换灯效",
  "打字统计和热力图",
  "回报率调节",
  "备份与恢复",
  "音乐律动：本软件的频谱算法、参数调节、转旋钮显示音量条",
  "宏：输入文字生成宏",
  "2.4G 低电量提醒",
  "Fn 层诊断",
];

export default function Settings() {
  const { theme, setTheme, experimental, setExperimental, profile } = useApp();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [version, setVersion] = useState(PREVIEW_VERSION);
  const [update, setUpdate] = useState<Update>({ state: "idle" });
  const [diag, setDiag] = useState<string | null>(null);

  useEffect(() => {
    api.getPrefs().then(setPrefs).catch(() => {});
    api.getAutostart().then(setAutostart).catch(() => {});
    if (IS_DESKTOP) import("@tauri-apps/api/app").then((m) => m.getVersion()).then(setVersion).catch(() => {});
  }, []);

  const savePrefs = (p: Prefs) => {
    setPrefs(p);
    api.setPrefs(p).catch((e) => toast.error(t("保存失败：{0}", String(e))));
  };

  const checkUpdate = async () => {
    setUpdate({ state: "checking" });
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
      if (r.status === 404) return setUpdate({ state: "none" });
      if (!r.ok) return setUpdate({ state: "error", msg: `HTTP ${r.status}` });
      const j = (await r.json()) as { tag_name?: string; html_url?: string };
      if (j.tag_name && newer(version, j.tag_name)) setUpdate({ state: "found", tag: j.tag_name, url: j.html_url ?? `${REPO_URL}/releases` });
      else setUpdate({ state: "latest" });
    } catch (e) {
      setUpdate({ state: "error", msg: String(e) });
    }
  };

  /** Which Fn-layer slots differ from the factory table, per Fn index. */
  const runDiag = async () => {
    setDiag(t("读取中…"));
    const lines: string[] = [`A75 Fn diagnostic · app ${version} · profile ${profile}`];
    for (let idx = 0; idx < 4; idx++) {
      try {
        const m = await api.readFnKeymap(idx);
        const diffs: string[] = [];
        for (let slot = 0; slot < 128; slot++) {
          const a = entryAt(m, slot);
          const d = entryAt(DEFAULT_FN_MATRIX, slot);
          if (a.some((b, i) => b !== d[i])) {
            const name = KEYS.find((k) => k.slot === slot)?.name ?? `#${slot}`;
            diffs.push(`  ${name}(${slot}) = [${a.join(",")}] ${describe(a, true)} · default [${d.join(",")}]`);
          }
        }
        lines.push(`fn${idx}: ${diffs.length} changed`, ...diffs.slice(0, 30));
      } catch (e) {
        lines.push(`fn${idx}: ${e}`);
      }
    }
    setDiag(lines.join("\n"));
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t("语言和外观")}>
          <Row label={t("界面语言")} htmlFor="lang">
            <Segmented<Lang> id="lang" size="sm" value={LANG} options={LANGS} onChange={(l) => l !== LANG && setLang(l)} />
          </Row>
          <Row label={t("主题")} hint={t("浅色用白色键盘图，深色用黑色键盘图")} htmlFor="theme">
            <Segmented<ThemeChoice>
              id="theme"
              size="sm"
              value={theme}
              options={[
                ["dark", t("深色")],
                ["light", t("浅色")],
                ["system", t("跟随系统")],
              ]}
              onChange={setTheme}
            />
          </Row>
        </Card>

        <Card title={t("软件")}>
          <Row label={t("开机自动启动")} hint={t("启动后待在右下角托盘里")} htmlFor="autostart">
            <Switch
              id="autostart"
              checked={autostart}
              onCheckedChange={(v) => {
                setAutostart(v);
                api.setAutostart(v).catch((e) => {
                  setAutostart(!v);
                  toast.error(t("设置失败：{0}", String(e)));
                });
              }}
            />
          </Row>
          <Row label={t("关闭窗口时留在托盘")} hint={t("律动等功能继续工作")} htmlFor="close-tray">
            <Switch id="close-tray" checked={prefs?.closeToTray ?? true} onCheckedChange={(v) => prefs && savePrefs({ ...prefs, closeToTray: v })} />
          </Row>
          {experimental && (
            <Row label={t("2.4G 低电量提醒")} hint={t("电量低于这个值时弹出系统通知")} htmlFor="batt-alert">
              <Select value={String(prefs?.batteryAlert ?? 20)} onValueChange={(v) => prefs && savePrefs({ ...prefs, batteryAlert: Number(v) })}>
                <SelectTrigger id="batt-alert" size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 10, 20, 30].map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      {v === 0 ? t("关闭") : `${v}%`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          )}
          {!IS_DESKTOP && <p className="text-xs text-muted-foreground">{t("演示模式下这些开关不起作用。")}</p>}
        </Card>

        <Card title={t("实验性功能")} aside={<FlaskConical className="size-4 text-muted-foreground" />}>
          <Row label={t("显示实验性功能")} hint={t("原版驱动没有的新功能。还在测试，可能不稳定。")} htmlFor="experimental">
            <Switch id="experimental" checked={experimental} onCheckedChange={setExperimental} />
          </Row>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
            {EXPERIMENTAL.map((x) => (
              <li key={x}>{t(x)}</li>
            ))}
          </ul>
          {experimental && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <div className="text-[13px] font-medium">{t("Fn 层诊断")}</div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("读出键盘里 Fn 层和出厂设置不同的地方。用原版驱动改过 Fn 层之后点一下，把结果复制给开发者，用来查 Fn 层改键为什么不生效。只读取，不写入。")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={runDiag}>
                  {t("读取 Fn 层")}
                </Button>
                {diag && (
                  <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(diag).then(() => toast.success(t("已复制"))).catch(() => toast.error(t("复制失败，请手动选中文字复制")))}>
                    <ClipboardCopy />
                    {t("复制结果")}
                  </Button>
                )}
              </div>
              {diag && <pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text">{diag}</pre>}
            </div>
          )}
        </Card>

        <Card title={t("关于")}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-[13px]">
            <dt className="text-muted-foreground">{t("版本")}</dt>
            <dd className="font-mono">{version}</dd>
            <dt className="text-muted-foreground">{t("作者")}</dt>
            <dd>EvanRPG</dd>
            <dt className="text-muted-foreground">{t("源代码")}</dt>
            <dd className="min-w-0">
              <button type="button" className="inline-flex max-w-full items-center gap-1 truncate text-primary hover:underline" onClick={() => openUrl(REPO_URL)}>
                <span className="truncate">github.com/{REPO}</span>
                <ExternalLink className="size-3 shrink-0" />
              </button>
            </dd>
            <dt className="text-muted-foreground">{t("基于")}</dt>
            <dd className="min-w-0">
              <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => openUrl(UPSTREAM_URL)}>
                sharkfin · JR Lanteigne
                <ExternalLink className="size-3 shrink-0" />
              </button>
            </dd>
            <dt className="text-muted-foreground">{t("许可证")}</dt>
            <dd>GPL-3.0</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" disabled={update.state === "checking"} onClick={checkUpdate}>
              <RefreshCw className={update.state === "checking" ? "animate-spin" : undefined} />
              {t("检查更新")}
            </Button>
            {update.state === "latest" && <span className="text-xs text-muted-foreground">{t("已是最新版本")}</span>}
            {update.state === "none" && <span className="text-xs text-muted-foreground">{t("还没有发布过安装包")}</span>}
            {update.state === "error" && <span className="text-xs text-destructive">{t("检查失败：{0}", update.msg)}</span>}
            {update.state === "found" && (
              <Button size="sm" onClick={() => openUrl(update.url)}>
                {t("下载新版本 {0}", update.tag)}
              </Button>
            )}
          </div>
          <Callout>{t("本软件不是魔咖官方驱动，与厂商无关。它不会修改键盘固件，所有改动都能用原版驱动的「恢复默认」清除。")}</Callout>
        </Card>
      </div>
    </div>
  );
}
