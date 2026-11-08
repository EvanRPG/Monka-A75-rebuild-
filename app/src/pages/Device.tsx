import { useEffect, useState, type ReactNode } from "react";
import { Callout, Segmented, SliderRow, Tag } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type DeviceSettings, type ReportRate } from "@/lib/backend";
import { useApp, type ThemeChoice } from "@/lib/store";
import { toast } from "sonner";
import { BatteryCharging, Cable, Cpu, Radio, RotateCcw } from "lucide-react";

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
        <label htmlFor={htmlFor} className="text-[13px]">{label}</label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const SLEEP_OPTIONS: [number, string][] = [
  [60, "1 分钟"],
  [180, "3 分钟"],
  [300, "5 分钟"],
  [600, "10 分钟"],
  [1800, "30 分钟"],
  [3600, "1 小时"],
  [0, "从不"],
];

function sleepLabel(v: number) {
  if (v === 0) return "从不";
  if (v % 3600 === 0) return `${v / 3600} 小时`;
  if (v % 60 === 0) return `${v / 60} 分钟`;
  return `${v} 秒`;
}

function SleepSelect({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  // Whatever the keyboard holds is shown, even if it is not one of ours.
  const options = SLEEP_OPTIONS.some(([v]) => v === value)
    ? SLEEP_OPTIONS
    : [...SLEEP_OPTIONS, [value, sleepLabel(value)] as [number, string]].sort((a, b) => (a[0] || 1e9) - (b[0] || 1e9));
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} size="sm" className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={String(v)}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Device() {
  const { device, theme, setTheme } = useApp();
  const [s, setS] = useState<DeviceSettings | null>(null);
  const [rate, setRate] = useState<ReportRate | null>(null);
  const [readBack, setReadBack] = useState<ReportRate | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    api.getSettings().then(setS).catch((e) => toast.error(`读取设置失败：${e}`));
    api
      .getReportRate()
      .then((r) => {
        setRate(r);
        setReadBack(r);
      })
      .catch(() => setReadBack(null));
  }, []);

  const changeRate = async (r: ReportRate) => {
    setRate(r);
    try {
      const back = await api.setReportRate(r);
      setReadBack(back);
      if (back === r) toast.success(`回报率已设为 ${r} Hz，回读一致`);
      else toast.error(`键盘回读为 ${back ?? "无应答"}，设置可能没生效`);
    } catch (e) {
      toast.error(`写入失败：${e}`);
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      await api.factoryReset();
      toast.success("已恢复出厂设置");
      setConfirmReset(false);
    } catch (e) {
      toast.error(`恢复失败：${e}`);
    } finally {
      setResetting(false);
    }
  };

  const wired = device?.link === "usb";

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="设备信息">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <Info icon={<Cpu className="size-4" />} k="型号" v="魔咖 Monka A75 三模" />
            <Info icon={wired ? <Cable className="size-4" /> : <Radio className="size-4" />} k="连接方式" v={wired ? "有线 USB" : "2.4G 接收器"} />
            <Info
              icon={<BatteryCharging className="size-4" />}
              k="电量"
              v={wired ? "有线供电中" : device?.battery != null ? `${device.battery}%` : "未知"}
            />
            <Info k="固件版本" v={device?.revision != null ? `V${device.revision.toString(16)}` : "未知"} mono />
            <Info k="设备编号" v={String(device?.deviceId ?? "—")} mono />
            <Info k="方案代号" v="s75 · yc500 族" mono />
          </dl>
          {wired && <Callout>电量只能在 2.4G 下读到：键盘本身不报电量，是接收器转报的。插线时看 Fn 键的灯：蓝灯闪烁表示正在充电，绿灯常亮表示已充满。</Callout>}
        </Card>

        <Card title="回报率" aside={<Tag tone={readBack ? "warn" : "muted"}>{readBack ? "待验证" : "不可用"}</Tag>}>
          <Segmented
            id="report-rate"
            className={readBack ? "w-full" : "pointer-events-none w-full opacity-50"}
            value={rate ?? 1000}
            options={[125, 250, 500, 1000].map((r) => [r as ReportRate, `${r} Hz`] as [ReportRate, string])}
            onChange={changeRate}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>键盘回读</span>
            <span className="tabular font-mono">{readBack ? `${readBack} Hz` : "无应答"}</span>
          </div>
          <Callout tone="warn">
            {readBack
              ? "原版驱动里有这项设置，但还没确认 A75 的固件会照做。回读一致只说明键盘记住了数值，实际速率要用回报率测试网页再测一次。"
              : "键盘没有正常回应回报率查询。为了安全，这项设置不开放。"}
          </Callout>
        </Card>

        <Card title="按键">
          {s ? (
            <>
              <SliderRow
                id="debounce"
                label="防抖时间"
                value={s.debounce}
                min={1}
                max={10}
                onChange={(v) => setS({ ...s, debounce: v })}
                onCommit={(v) => api.setDebounce(v).then(() => toast.success(`防抖已设为 ${v} ms`)).catch((e) => toast.error(`写入失败：${e}`))}
                format={(v) => `${v} ms`}
                hint="出现连击（按一次出两个字）时调大一点；越小反应越快。"
              />
              {s.options && (
                <>
                  <Row label="锁定 Win 键" hint="打游戏时防止误按弹出开始菜单" htmlFor="opt-winlock">
                    <Switch id="opt-winlock" checked={s.options.winLock} onCheckedChange={(v) => { const o = { ...s.options!, winLock: v }; setS({ ...s, options: o }); api.setOptions(o); }} />
                  </Row>
                  <Row label="WASD 与方向键互换" htmlFor="opt-wasd">
                    <Switch id="opt-wasd" checked={s.options.wasdSwap} onCheckedChange={(v) => { const o = { ...s.options!, wasdSwap: v }; setS({ ...s, options: o }); api.setOptions(o); }} />
                  </Row>
                </>
              )}
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">读取中…</p>
          )}
        </Card>

        <Card title="无线休眠">
          {s ? (
            <>
              <Row label="2.4G 无操作后休眠" htmlFor="sleep-24">
                <SleepSelect id="sleep-24" value={s.sleep.sleep24} onChange={(v) => { const sl = { ...s.sleep, sleep24: v }; setS({ ...s, sleep: sl }); api.setSleep(sl); }} />
              </Row>
              <Row label="蓝牙无操作后休眠" htmlFor="sleep-bt">
                <SleepSelect id="sleep-bt" value={s.sleep.sleepBt} onChange={(v) => { const sl = { ...s.sleep, sleepBt: v }; setS({ ...s, sleep: sl }); api.setSleep(sl); }} />
              </Row>
              <Row label="深度休眠" hint="更省电，唤醒稍慢" htmlFor="sleep-deep">
                <SleepSelect id="sleep-deep" value={s.sleep.deep24} onChange={(v) => { const sl = { ...s.sleep, deep24: v, deepBt: v }; setS({ ...s, sleep: sl }); api.setSleep(sl); }} />
              </Row>
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">读取中…</p>
          )}
        </Card>

        <Card title="外观">
          <Row label="主题" hint="浅色用白色键盘图，深色用黑色键盘图" htmlFor="theme">
            <Segmented<ThemeChoice>
              id="theme"
              size="sm"
              value={theme}
              options={[
                ["dark", "深色"],
                ["light", "浅色"],
                ["system", "跟随系统"],
              ]}
              onChange={setTheme}
            />
          </Row>

        </Card>

        <Card title="恢复出厂设置">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            清除改键、宏、逐键图案和灯效，回到出厂状态。需要插线，约 4 秒。
          </p>
          {confirmReset ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-[13px] text-destructive">确定要清除全部设置吗？</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>取消</Button>
              <Button variant="destructive" size="sm" disabled={resetting || !wired} onClick={reset}>
                {resetting ? "正在恢复…" : "确定恢复"}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="self-start" disabled={!wired} onClick={() => setConfirmReset(true)}>
              <RotateCcw />
              恢复出厂设置
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}

function Info({ icon, k, v, mono }: { icon?: ReactNode; k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {k}
      </dt>
      <dd className={mono ? "truncate font-mono text-[13px]" : "truncate"}>{v}</dd>
    </div>
  );
}
