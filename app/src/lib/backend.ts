// The one door to the keyboard. Inside the desktop app every call goes to
// the Rust backend (sharkfin's commands, plus the A75 additions marked
// below). In a plain browser the demo backend answers instead, so the
// interface can be tried without a keyboard.
import { invoke } from "@tauri-apps/api/core";
import { mockBackend } from "./mock";
import { t } from "@/lib/i18n";

export interface ConnectedDevice {
  path: string;
  deviceId: number;
  name: string;
  /** Cable, or the 2.4 GHz receiver's relay. */
  link: "usb" | "receiver";
  /** Percent, receiver link only. The keyboard has no battery command. */
  battery: number | null;
  /** Firmware revision, e.g. 0x0105. */
  revision: number | null;
}

export interface ScanInfo {
  device: ConnectedDevice | null;
  /** Firmware stopped answering; it needs a replug. */
  stalled: boolean;
  /** Receiver present, keyboard asleep or off. */
  offline: boolean;
  /** Found but could not be opened (another program has it). */
  openFailed: boolean;
}

export interface LedParam {
  mode: number;
  speed: number;
  brightness: number;
  option: number;
  dazzle: boolean;
  r: number;
  g: number;
  b: number;
}

export interface SleepTimes {
  sleepBt: number;
  sleep24: number;
  deepBt: number;
  deep24: number;
}

export interface KbOptions {
  winLock: boolean;
  wasdSwap: boolean;
  ledOff: boolean;
  sideLedOff: boolean;
  macMode: boolean;
}

export interface DeviceSettings {
  debounce: number;
  sleep: SleepTimes;
  options: KbOptions | null;
  revision: string;
}

export type MacroEvent =
  | { kind: "key"; usage: number; pressed: boolean; delayMs: number }
  | { kind: "mouseButton"; button: number; pressed: boolean; delayMs: number }
  | { kind: "mouseMove"; dx: number; dy: number; delayMs: number };

export interface Macro {
  repeat: number;
  events: MacroEvent[];
}

/** A75 addition: host-side music analysis that streams SET_AUDIO frames. */
export interface MusicParams {
  /** LEDPARAM mode: 22 律动 2, 20 律动 3. */
  mode: number;
  /** 0 竖立 / 1 分离 / 2 交叉: the firmware's three music layouts. */
  style: number;
  /** 0 this app's analyser (tunable), 1 the vendor's (auto gain). */
  algo: number;
  /** What drives the board. */
  source: LiveSource;
  /** During music, turning the knob shows a volume bar for a moment. */
  volumeOverlay: boolean;
  /** Countdown length for the timer source. */
  timerSecs: number;
  /** Screen colour boost, 0..100. */
  boost: number;
  gain: number;
  gate: number;
  decay: number;
  bass: number;
  spread: number;
}

export type LiveSource = "music" | "cpu" | "ram" | "volume" | "timer" | "screen";

export interface MusicStatus {
  /** Last screen colour sent. */
  color?: [number, number, number] | null;
  running: boolean;
  /** Why the stream stopped on its own. */
  error?: string | null;
  /** Where the sound comes from, as the system names the output. */
  source: string | null;
  /** 32 bands, 0..6, exactly what was last sent. */
  levels: number[];
}

export type ReportRate = 125 | 250 | 500 | 1000;

export interface AppRule {
  /** Program file name, e.g. "valorant.exe". */
  exe: string;
  led: LedParam;
  winLock: boolean;
}

export interface Prefs {
  rulesEnabled: boolean;
  rules: AppRule[];
  statsEnabled: boolean;
  /** Notify under this percent over 2.4G; 0 is off. */
  batteryAlert: number;
  closeToTray: boolean;
}

export interface Stats {
  enabled: boolean;
  active: boolean;
  /** HID usage -> presses. */
  counts: Record<string, number>;
  total: number;
  perMinute: number;
  /** Unix seconds. */
  since: string;
}

export interface Backend {
  scan(): Promise<ScanInfo>;
  getLedParam(): Promise<LedParam>;
  setLedParam(p: LedParam): Promise<void>;
  readKeymap(profile: number): Promise<number[]>;
  readFnKeymap(layer: number): Promise<number[]>;
  /** Resolves when written. The boolean is true when the whole layer was uploaded. */
  setKey(profile: number, slot: number, value: number[], fnLayer: boolean): Promise<boolean>;
  writePerKey(colors: number[], activate: boolean): Promise<void>;
  readMacro(slot: number): Promise<Macro>;
  writeMacro(slot: number, data: Macro): Promise<void>;
  getSettings(): Promise<DeviceSettings>;
  setDebounce(v: number): Promise<void>;
  setSleep(s: SleepTimes): Promise<void>;
  setOptions(o: KbOptions): Promise<void>;
  factoryReset(): Promise<void>;
  // A75 additions
  getReportRate(): Promise<ReportRate | null>;
  setReportRate(r: ReportRate): Promise<ReportRate | null>;
  musicStart(p: MusicParams): Promise<void>;
  musicStop(): Promise<void>;
  musicParams(p: MusicParams): Promise<void>;
  musicStatus(): Promise<MusicStatus>;
  getProfile(): Promise<number>;
  setProfile(p: number): Promise<void>;
  /** Ask where to save, then write the keyboard's settings there. Null when cancelled. */
  exportConfig(): Promise<string | null>;
  importConfig(): Promise<string | null>;
  getPrefs(): Promise<Prefs>;
  setPrefs(p: Prefs): Promise<void>;
  recentApps(): Promise<string[]>;
  getStats(): Promise<Stats>;
  resetStats(): Promise<void>;
  getAutostart(): Promise<boolean>;
  setAutostart(on: boolean): Promise<void>;
  notify(title: string, body: string): Promise<void>;
}

const tauriBackend: Backend = {
  async scan() {
    const r = await invoke<{
      connected: {
        path: string;
        deviceId: number;
        spec: { displayName?: string; name: string };
        link: "usb" | "receiver";
        battery: number | null;
        revision: number | null;
      } | null;
      stalled: boolean;
      keyboardOffline: boolean;
      openFailed: boolean;
    }>("scan");
    const c = r.connected;
    return {
      device: c
        ? {
            path: c.path,
            deviceId: c.deviceId,
            name: c.spec.displayName ?? c.spec.name,
            link: c.link,
            battery: c.battery,
            revision: c.revision,
          }
        : null,
      stalled: r.stalled,
      offline: r.keyboardOffline,
      openFailed: r.openFailed,
    };
  },
  getLedParam: () => invoke("get_led_param"),
  setLedParam: (param) => invoke("set_led_param", { param }),
  readKeymap: (profile) => invoke("read_keymap", { profile }),
  readFnKeymap: (layer) => invoke("read_fn_keymap", { layer }),
  setKey: (profile, slot, value, fnLayer) => invoke("set_key", { profile, slot, value, fnLayer }),
  writePerKey: (colors, activate) => invoke("write_per_key", { colors, activate }),
  readMacro: (slot) => invoke("read_macro", { slot }),
  writeMacro: (slot, data) => invoke("write_macro", { slot, data }),
  getSettings: () => invoke("get_settings"),
  setDebounce: (value) => invoke("set_debounce", { value }),
  setSleep: (sleep) => invoke("set_sleep", { sleep }),
  setOptions: (options) => invoke("set_options", { options }),
  factoryReset: () => invoke("factory_reset"),
  getReportRate: () => invoke("a75_get_report_rate"),
  setReportRate: (rate) => invoke("a75_set_report_rate", { rate }),
  musicStart: (params) => invoke("a75_music_start", { params }),
  musicStop: () => invoke("a75_music_stop"),
  musicParams: (params) => invoke("a75_music_params", { params }),
  musicStatus: () => invoke("a75_music_status"),
  getProfile: () => invoke("get_profile"),
  setProfile: (profile) => invoke("set_profile", { profile }),
  async exportConfig() {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: t("A75-备份.json"), filters: [{ name: t("A75 配置"), extensions: ["json"] }] });
    if (!path) return null;
    return invoke<string>("export_config", { path });
  },
  async importConfig() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: [{ name: t("A75 配置"), extensions: ["json"] }] });
    if (!path || Array.isArray(path)) return null;
    return invoke<string>("import_config", { path });
  },
  getPrefs: () => invoke("a75_prefs_get"),
  setPrefs: (prefs) => invoke("a75_prefs_set", { prefs }),
  recentApps: () => invoke("a75_recent_apps"),
  getStats: () => invoke("a75_stats_get"),
  resetStats: () => invoke("a75_stats_reset"),
  getAutostart: () => invoke("a75_autostart_get"),
  setAutostart: (on) => invoke("a75_autostart_set", { on }),
  notify: (title, body) => invoke("a75_notify", { title, body }),
};

export const IS_DESKTOP = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api: Backend = IS_DESKTOP ? tauriBackend : mockBackend;
