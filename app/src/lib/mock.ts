// Demo backend: a pretend A75 on a cable, so every page can be tried in a
// browser. Nothing here reaches hardware.
import type { Backend, LedParam, Macro, MusicParams, ReportRate, DeviceSettings } from "./backend";
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
    debounce: 3,
    sleep: { sleepBt: 300, sleep24: 300, deepBt: 1800, deep24: 1800 },
    options: { winLock: false, wasdSwap: false, ledOff: false, sideLedOff: false, macMode: false },
    revision: "1.05",
  } as DeviceSettings,
  rate: 1000 as ReportRate,
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
    return { path: "demo", deviceId: 1549, name: "A75", link: "usb", battery: null, revision: 0x0105 };
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
  async musicStatus() {
    const m = state.music;
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
