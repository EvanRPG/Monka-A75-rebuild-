import { useEffect, useRef, useState, type ComponentType } from "react";
import { AppProvider, useApp } from "@/lib/store";
import { IS_DESKTOP } from "@/lib/backend";
import { Toaster } from "@/components/parts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AppWindow,
  BarChart3,
  Gauge,
  RotateCw,
  Square,
  AudioLines,
  Battery,
  Brush,
  Cable,
  Keyboard as KeyboardIcon,
  Lightbulb,
  ListVideo,
  Monitor,
  Moon,
  Radio,
  SlidersHorizontal,
  Settings2,
  Sun,
} from "lucide-react";
import Lighting from "@/pages/Lighting";
import Paint from "@/pages/Paint";
import Music from "@/pages/Music";
import Screen from "@/pages/Screen";
import Keys from "@/pages/Keys";
import Macros from "@/pages/Macros";
import Device from "@/pages/Device";
import Meters from "@/pages/Meters";
import Knob from "@/pages/Knob";
import Rules from "@/pages/Rules";
import Stats from "@/pages/Stats";
import Settings from "@/pages/Settings";
import { api } from "@/lib/backend";
import { t } from "@/lib/i18n";

export type PageId =
  | "lighting"
  | "paint"
  | "music"
  | "screen"
  | "meters"
  | "keys"
  | "knob"
  | "macros"
  | "rules"
  | "stats"
  | "device"
  | "settings";

interface PageDef {
  id: PageId;
  name: string;
  desc: string;
  icon: ComponentType<{ className?: string }>;
  group: "灯光" | "按键" | "智能" | "设备";
  /** Beyond the vendor driver: shown with experimental features on. */
  exp?: boolean;
}

const PAGES: PageDef[] = [
  { id: "lighting", name: t("灯效"), desc: t("18 种板载灯效，亮度、速度、颜色、方向"), icon: Lightbulb, group: "灯光" },
  { id: "paint", name: t("逐键灯光"), desc: t("给每个键单独上色，存进键盘"), icon: Brush, group: "灯光" },
  { id: "music", name: t("音乐律动"), desc: t("电脑分析声音，键盘跟着节奏亮"), icon: AudioLines, group: "灯光" },
  { id: "screen", name: t("屏幕光影"), desc: t("键盘跟随屏幕主色变化"), icon: Monitor, group: "灯光" },
  { id: "meters", name: t("键盘仪表"), desc: t("把键盘当小屏幕：CPU、内存、音量、倒计时"), icon: Gauge, group: "灯光", exp: true },
  { id: "keys", name: t("按键"), desc: t("改键和 Fn 层"), icon: KeyboardIcon, group: "按键" },
  { id: "knob", name: t("旋钮"), desc: t("左转、右转、按下各做什么"), icon: RotateCw, group: "按键", exp: true },
  { id: "macros", name: t("宏"), desc: t("录制一串按键，绑定到任意键"), icon: ListVideo, group: "按键" },
  { id: "rules", name: t("按程序切换"), desc: t("打开指定程序时自动换灯效、锁 Win 键"), icon: AppWindow, group: "智能", exp: true },
  { id: "stats", name: t("打字统计"), desc: t("按键热力图和打字速度"), icon: BarChart3, group: "智能", exp: true },
  { id: "device", name: t("设备"), desc: t("防抖、休眠、配置档、恢复出厂"), icon: SlidersHorizontal, group: "设备" },
  { id: "settings", name: t("设置"), desc: t("语言、外观、实验性功能、关于"), icon: Settings2, group: "设备" },
];

function readHash(): PageId {
  const h = typeof location !== "undefined" ? location.hash.slice(1) : "";
  return (PAGES.find((p) => p.id === h)?.id ?? "lighting") as PageId;
}

function Shell() {
  const { device, scanning, scanNote, setTheme, dark, experimental } = useApp();
  const [page, setPage] = useState<PageId>(readHash);

  useEffect(() => {
    const on = () => setPage(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = (p: PageId) => {
    setPage(p);
    try {
      history.replaceState(null, "", `#${p}`);
    } catch {
      /* sandboxed */
    }
  };

  const shown = PAGES.filter((p) => experimental || !p.exp);
  // A hidden page (experimental turned off) falls back to the first one.
  const def = shown.find((p) => p.id === page) ?? shown[0];
  useEffect(() => {
    if (def.id !== page) go(def.id);
  }, [def.id, page]);
  const groups = ["灯光", "按键", "智能", "设备"] as const;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-border bg-sidebar md:w-[212px] md:border-r md:border-b-0">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <div className="grid size-7 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">A75</div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">{t("魔咖 A75")}</div>
            <div className="text-[11px] text-muted-foreground">{t("键盘驱动")}</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:gap-0 md:overflow-visible md:pb-0">
          {groups.filter((g) => shown.some((p) => p.group === g)).map((g) => (
            <div key={g} className="contents md:mb-3 md:block">
              <div className="hidden px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground md:block">{t(g)}</div>
              {shown.filter((p) => p.group === g).map((p) => {
                const Icon = p.icon;
                const on = p.id === page;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => go(p.id)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-full",
                      on ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4", on && "text-primary")} />
                    {p.name}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-border p-3 md:block">
          <DeviceCard />
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2 sm:px-6">
          <div className="mr-auto min-w-0">
            <h1 className="text-[15px] font-semibold">{def.name}</h1>
            <p className="truncate text-xs text-muted-foreground">{def.desc}</p>
          </div>
          {!IS_DESKTOP && (
            <span className="rounded-[4px] border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">{t("演示模式：未连接真实键盘")}</span>
          )}
          <LivePill go={go} />
          <StatusPills scanning={scanning} />
          <button
            type="button"
            aria-label={dark ? t("切换到浅色") : t("切换到深色")}
            onClick={() => setTheme(dark ? "light" : "dark")}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </header>
        {device || def.id === "settings" ? (
          <PageView page={def.id} go={go} />
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div className="max-w-sm">
              <div className="text-[15px] font-semibold">
                {scanning
                  ? t("正在寻找键盘…")
                  : scanNote?.stalled
                    ? t("键盘停止响应了")
                    : scanNote?.offline
                      ? t("键盘在休眠")
                      : scanNote?.openFailed
                        ? t("键盘被别的软件占用")
                        : t("没有找到键盘")}
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">
                {scanNote?.stalled
                  ? t("拔掉数据线，等 10 秒再插回去，这里会自动重新连接。键盘不会损坏。")
                  : scanNote?.offline
                    ? t("接收器插着，但键盘没醒。按一下键盘上的任意键就能唤醒。")
                    : scanNote?.openFailed
                      ? t("先完全退出原版魔咖驱动（包括右下角托盘图标），两个软件不能同时打开。")
                      : t("用数据线把 A75 接到电脑上，或插好 2.4G 接收器并按任意键唤醒键盘。先关掉原版魔咖驱动，两个软件不能同时打开。")}
              </p>
            </div>
          </div>
        )}
      </main>
      <Toaster />
      <BatteryWatch />
    </div>
  );
}

function PageView({ page, go }: { page: PageId; go: (p: PageId) => void }) {
  switch (page) {
    case "lighting":
      return <Lighting go={go} />;
    case "paint":
      return <Paint />;
    case "music":
      return <Music />;
    case "screen":
      return <Screen />;
    case "keys":
      return <Keys />;
    case "macros":
      return <Macros />;
    case "device":
      return <Device />;
    case "meters":
      return <Meters />;
    case "knob":
      return <Knob />;
    case "rules":
      return <Rules />;
    case "stats":
      return <Stats />;
    case "settings":
      return <Settings />;
  }
}

const LIVE_NAMES: Record<string, [string, PageId]> = {
  music: [t("音乐律动"), "music"],
  screen: [t("屏幕光影"), "screen"],
  cpu: [t("CPU 仪表"), "meters"],
  ram: [t("内存仪表"), "meters"],
  volume: [t("音量仪表"), "meters"],
  timer: [t("倒计时"), "meters"],
};

/** Shown while the computer drives the board, on every page. */
function LivePill({ go }: { go: (p: PageId) => void }) {
  const { live, liveParams, stopLive } = useApp();
  if (!live.running || !liveParams) return null;
  const [name, page] = LIVE_NAMES[liveParams.source] ?? [t("实时灯光"), "music"];
  return (
    <div className="flex h-7 items-center overflow-hidden rounded-md border border-primary/40 bg-primary/10 text-xs">
      <button type="button" onClick={() => go(page)} className="flex h-full items-center gap-1.5 px-2.5 hover:bg-primary/15">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        {name}{t("进行中")}
      </button>
      <button type="button" aria-label={t("停止")} onClick={() => stopLive()} className="grid h-full place-items-center border-l border-primary/30 px-2 hover:bg-primary/15">
        <Square className="size-3" />
      </button>
    </div>
  );
}

/** 2.4G only: one notification each time the battery drops under the threshold. */
function BatteryWatch() {
  const { device } = useApp();
  const warned = useRef(false);
  useEffect(() => {
    const b = device?.battery;
    if (device?.link !== "receiver" || b == null) return;
    api.getPrefs().then((p) => {
      if (p.batteryAlert > 0 && b < p.batteryAlert && !warned.current) {
        warned.current = true;
        api.notify(t("A75 电量低"), t("键盘电量 {0}%，记得插线充电。", b)).catch(() => {});
      }
      if (b >= p.batteryAlert + 5) warned.current = false;
    });
  }, [device?.battery, device?.link]);
  return null;
}

function StatusPills({ scanning }: { scanning: boolean }) {
  const { device } = useApp();
  if (!device) return <span className="text-xs text-muted-foreground">{scanning ? t("连接中…") : t("未连接")}</span>;
  const wired = device.link === "usb";
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5">
        <span className="size-1.5 rounded-full bg-ok" />
        {wired ? <Cable className="size-3.5 text-muted-foreground" /> : <Radio className="size-3.5 text-muted-foreground" />}
        {wired ? t("有线") : "2.4G"}
      </span>
      <span className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5">
        <Battery className="size-3.5 text-muted-foreground" />
        <span className="tabular">{wired ? t("供电中") : device.battery != null ? `${device.battery}%` : "—"}</span>
      </span>
    </div>
  );
}

function DeviceCard() {
  const { device } = useApp();
  if (!device) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-[13px] font-medium">Monka A75</div>
      <div className="font-mono text-[11px] text-muted-foreground">
        {t("固件 V")}{device.revision?.toString(16) ?? "?"} · ID {device.deviceId}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <TooltipProvider>
        <Shell />
      </TooltipProvider>
    </AppProvider>
  );
}
