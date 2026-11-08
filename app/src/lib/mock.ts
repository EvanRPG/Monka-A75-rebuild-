// Demo backend: a pretend A75 on a cable, so every page can be tried in a
// browser. Nothing here reaches hardware.
import type { Backend, LedParam, Macro, MusicParams, ReportRate, DeviceSettings, Prefs } from "./backend";
import { defaultFnMatrix, defaultMatrix } from "./a75";

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const state = {
  led: { mode: 4, speed: 2, brightness: 4, option: 0, dazzle: true, r: 77, g: 141, b: 255 } as LedParam,
  base: defaultMatrix(),
  fn: defaultFnMatrix(),
  macros: new Map<number, Macro>([
    [
      0,
      {
        repeat: 1,
        events: [
          { kind: "key", usage: 224, pressed: true, delayMs: 20 },
          { kind: "key", usage: 6, pressed: true, delayMs: 30 },
          { kind: "key", usage: 6, pressed: false, delayMs: 20 },
          { kind: "key", usage: 224, pressed: false, delayMs: 40 },
          { kind: "key", usage: 224, pressed: true, delayMs: 20 },
          { kind: "key", usage: 25, pressed: true, delayMs: 30 },
          { kind: "key", usage: 25, pressed: false, delayMs: 20 },
          { kind: "key", usage: 224, pressed: false, delayMs: 10 },
        ],
      },
    ],
  ]),
  settings: {
    debounce: 5,
    sleep: { sleepBt: 300, sleep24: 300, deepBt: 1800, deep24: 1800 },
    options: { winLock: false, wasdSwap: false, ledOff: false, sideLedOff: false, macMode: false },
    revision: "1.05",
  } as DeviceSettings,
  rate: 1000 as ReportRate,
  profile: 0,
  prefs: {
    rulesEnabled: true,
    rules: [
      {
        exe: "valorant.exe",
        led: { mode: 1, speed: 0, brightness: 4, option: 0, dazzle: false, r: 255, g: 59, b: 48 },
        winLock: true,
      },
    ],
    statsEnabled: true,
    batteryAlert: 20,
    closeToTray: true,
  } as Prefs,
  stats: (() => {
    // Plausible typing: home row and vowels heavy.
    const w: Record<number, number> = { 4: 820, 8: 1240, 12: 690, 18: 760, 22: 610, 23: 900, 17: 650, 21: 600, 44: 2100, 42: 540, 40: 300, 7: 410, 9: 260, 15: 380, 16: 300, 6: 300, 25: 120, 11: 420, 26: 240, 225: 380, 224: 290, 19: 180, 24: 330, 10: 220, 28: 210, 14: 100, 5: 160, 29: 30, 27: 40, 20: 20, 13: 30, 54: 140, 55: 190 };
    return w;
  })(),
  t0: Date.now(),
  music: { running: false, params: null as MusicParams | null, t0: 0, levels: new Array(32).fill(0) },
};

function fakeSpectrum(t: number, p: MusicParams): number[] {
  // A beat at ~120 bpm with a bass bias, shaped by the same knobs the real
  // analyser takes, so the sliders visibly do something in the demo.
  const beat = Math.pow(Math.max(0, Math.cos((t / 500) * Math.PI)), 6);
  const out: number[] = [];
  for (let i = 0; i < 32; i++) {
    const f = i / 31;
    const bassW = 1 + (p.bass / 100) * 1.5 * (1 - f);
    const noise = 0.35 + 0.35 * Math.sin(t / 170 + i * 1.7) * Math.sin(t / 260 + i * 0.6);
    let v = (beat * (1 - f) * 0.9 + noise * (0.6 + 0.4 * f)) * bassW * (p.gain / 50);
    v = v * 6 - (p.gate / 100) * 3;
    out.push(Math.max(0, Math.min(6, v)));
  }
  return out;
}

// Demo: Insert already remapped to the calculator, so the Keys page shows a change.
state.base.splice(78 * 4, 4, 3, 0, 146, 1);

export const mockBackend: Backend = {
  async scan() {
    await wait(300);
    return {
      device: { path: "demo", deviceId: 1549, name: "A75", link: "usb", battery: null, revision: 0x0105 },
      stalled: false,
      offline: false,
      openFailed: false,
    };
  },
  async getLedParam() {
    await wait();
    return { ...state.led };
  },
  async setLedParam(p) {
    await wait(40);
    state.led = { ...p };
  },
  async readKeymap() {
    await wait(120);
    return [...state.base];
  },
  async readFnKeymap() {
    await wait(120);
    return [...state.fn];
  },
  async setKey(_profile, slot, value, fnLayer) {
    await wait(50);
    const m = fnLayer ? state.fn : state.base;
    for (let i = 0; i < 4; i++) m[slot * 4 + i] = value[i];
    return true;
  },
  async writePerKey() {
    await wait(400);
  },
  async readMacro(slot) {
    await wait(80);
    return state.macros.get(slot) ?? { repeat: 1, events: [] };
  },
  async writeMacro(slot, data) {
    await wait(300);
    state.macros.set(slot, data);
  },
  async getSettings() {
    await wait();
    return structuredClone(state.settings);
  },
  async setDebounce(v) {
    await wait();
    state.settings.debounce = v;
  },
  async setSleep(s) {
    await wait();
    state.settings.sleep = s;
  },
  async setOptions(o) {
    await wait();
    state.settings.options = o;
  },
  async factoryReset() {
    await wait(1200);
    state.base = defaultMatrix();
    state.fn = defaultFnMatrix();
    state.led = { mode: 1, speed: 0, brightness: 4, option: 0, dazzle: false, r: 255, g: 255, b: 255 };
  },
  async getReportRate() {
    await wait();
    return state.rate;
  },
  async setReportRate(r) {
    await wait(80);
    state.rate = r;
    return r;
  },
  async musicStart(p) {
    await wait(200);
    state.music.running = true;
    state.music.params = p;
    state.music.t0 = performance.now();
  },
  async musicStop() {
    await wait(60);
    state.music.running = false;
    state.music.levels = new Array(32).fill(0);
  },
  async musicParams(p) {
    state.music.params = p;
  },
  async getProfile() {
    return state.profile;
  },
  async setProfile(p) {
    await wait(1000);
    state.profile = p;
  },
  async exportConfig() {
    await wait(400);
    return "演示模式：没有真的写文件";
  },
  async importConfig() {
    await wait(400);
    return "演示模式：没有真的读文件";
  },
  async getPrefs() {
    return structuredClone(state.prefs);
  },
  async setPrefs(p) {
    state.prefs = structuredClone(p);
  },
  async recentApps() {
    return ["valorant.exe", "chrome.exe", "code.exe", "wechat.exe", "steam.exe"];
  },
  async getStats() {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const [k, v] of Object.entries(state.stats)) {
      counts[k] = v;
      total += v;
    }
    return {
      enabled: state.prefs.statsEnabled,
      active: state.prefs.statsEnabled,
      counts,
      total,
      perMinute: 180 + Math.round(40 * Math.sin(Date.now() / 4000)),
      since: String(Math.floor(state.t0 / 1000) - 86400 * 3),
    };
  },
  async resetStats() {
    state.stats = {};
  },
  async getAutostart() {
    return false;
  },
  async setAutostart() {},
  async notify() {},
  async musicStatus() {
    const m = state.music;
    if (m.running && m.params && m.params.source !== "music") {
      const t = (performance.now() - m.t0) / 1000;
      const src = m.params.source;
      const frac =
        src === "ram" ? 0.62 : src === "volume" ? 0.45 : src === "timer" ? Math.max(0, 1 - t / Math.max(1, m.params.timerSecs)) : 0;
      m.levels =
        src === "cpu"
          ? Array.from({ length: 32 }, (_, i) => 3 + 2.5 * Math.sin((t * 4 + i) / 3) * Math.sin((t + i) / 5))
          : Array.from({ length: 32 }, (_, i) => Math.max(0, Math.min(1, frac * 32 - i)) * 6);
      return {
        running: true,
        source: null,
        levels: m.levels.map((v) => Math.round(Math.max(0, Math.min(6, v)))),
        color: src === "screen" ? ([Math.round(120 + 100 * Math.sin(t)), 80, Math.round(160 + 80 * Math.cos(t / 1.3))] as [number, number, number]) : null,
      };
    }
    if (m.running && m.params) {
      const raw = fakeSpectrum(performance.now() - m.t0, m.params);
      const decay = 0.15 + (m.params.decay / 100) * 0.8;
      m.levels = raw.map((v, i) => Math.max(v, m.levels[i] * decay));
      if (m.params.spread > 0) {
        const s = m.params.spread / 100;
        m.levels = m.levels.map((v, i, a) => {
          const l = a[i - 1] ?? v;
          const r = a[i + 1] ?? v;
          return v * (1 - s * 0.5) + ((l + r) / 2) * s * 0.5;
        });
      }
    }
    return {
      running: m.running,
      source: m.running ? "扬声器 (Realtek High Definition Audio)" : null,
      levels: m.levels.map((v) => Math.round(v)),
    };
  },
};
