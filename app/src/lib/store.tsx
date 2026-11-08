import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type ConnectedDevice, type LedParam, type MusicParams, type MusicStatus, type ScanInfo } from "./backend";

export type ThemeChoice = "dark" | "light" | "system";

interface AppState {
  device: ConnectedDevice | null;
  scanning: boolean;
  /** Why there is no device, when the backend knows. */
  scanNote: Omit<ScanInfo, "device"> | null;
  rescan: () => void;
  led: LedParam | null;
  setLed: (p: LedParam) => Promise<void>;
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  /** The theme actually showing, after following the system. */
  dark: boolean;
  /** Active profile slot (0-based). */
  profile: number;
  setProfile: (p: number) => Promise<void>;
  /** Live lighting (music, meters, screen): one stream at a time. */
  live: MusicStatus;
  liveParams: MusicParams | null;
  startLive: (p: MusicParams) => Promise<void>;
  updateLive: (p: MusicParams) => void;
  stopLive: () => Promise<void>;
  /** Features beyond the vendor driver's are shown only when this is on. */
  experimental: boolean;
  setExperimental: (on: boolean) => void;
}

const IDLE: MusicStatus = { running: false, source: null, levels: new Array(32).fill(0) };

const Ctx = createContext<AppState | null>(null);

function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem("a75.theme");
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "dark";
}

function readExperimental(): boolean {
  try {
    return localStorage.getItem("a75.experimental") === "1";
  } catch {
    return false;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<ConnectedDevice | null>(null);
  const [scanning, setScanning] = useState(true);
  const [led, setLedState] = useState<LedParam | null>(null);
  const [theme, setThemeState] = useState<ThemeChoice>(readTheme);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const dark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("a75.theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const [scanNote, setScanNote] = useState<Omit<ScanInfo, "device"> | null>(null);
  const deviceRef = useRef<ConnectedDevice | null>(null);

  const rescan = useCallback(() => {
    api
      .scan()
      .then(async ({ device: d, ...note }) => {
        const was = deviceRef.current;
        deviceRef.current = d;
        setDevice(d);
        setScanNote(note);
        // A (re)connect: read the lighting the board is actually showing.
        if (d && (!was || was.path !== d.path)) setLedState(await api.getLedParam());
      })
      .catch(() => {
        deviceRef.current = null;
        setDevice(null);
      })
      .finally(() => setScanning(false));
  }, []);

  // Look for the keyboard every 3 s until it shows up, then check on it
  // every 30 s (the backend answers from cache, so this costs the board
  // nothing). Battery comes along with it over 2.4G.
  useEffect(() => {
    rescan();
    const t = setInterval(rescan, device ? 30_000 : 3_000);
    return () => clearInterval(t);
  }, [rescan, device === null]);

  const [profile, setProfileState] = useState(0);
  useEffect(() => {
    if (device) api.getProfile().then(setProfileState).catch(() => {});
  }, [device?.path]);
  const setProfile = useCallback(async (p: number) => {
    await api.setProfile(p);
    setProfileState(p);
    setLedState(await api.getLedParam());
  }, []);

  const [live, setLive] = useState<MusicStatus>(IDLE);
  const [liveParams, setLiveParams] = useState<MusicParams | null>(null);
  // Pick up a stream that kept running while the window was hidden.
  useEffect(() => {
    if (device) api.musicStatus().then(setLive).catch(() => {});
  }, [device?.path]);
  // Read back what is actually sent, ~30 times a second while streaming.
  useEffect(() => {
    if (!live.running) return;
    let alive = true;
    const t = setInterval(() => {
      api
        .musicStatus()
        .then((s) => alive && setLive(s))
        .catch(() => {});
    }, 33);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [live.running]);
  const startLive = useCallback(async (p: MusicParams) => {
    await api.musicStart(p);
    setLiveParams(p);
    setLive(await api.musicStatus());
  }, []);
  const updateLive = useCallback((p: MusicParams) => {
    setLiveParams(p);
    api.musicParams(p).catch(() => {});
  }, []);
  const stopLive = useCallback(async () => {
    await api.musicStop();
    setLive(IDLE);
    setLedState(await api.getLedParam().catch(() => null));
  }, []);

  const [experimental, setExperimentalState] = useState(readExperimental);
  const setExperimental = useCallback(
    (on: boolean) => {
      setExperimentalState(on);
      try {
        localStorage.setItem("a75.experimental", on ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      if (on) return;
      // Hidden features stop too, so nothing runs that the window no longer shows.
      if (live.running && liveParams && !["music", "screen"].includes(liveParams.source)) stopLive().catch(() => {});
      api
        .getPrefs()
        .then((p) => (p.rulesEnabled || p.statsEnabled ? api.setPrefs({ ...p, rulesEnabled: false, statsEnabled: false }) : undefined))
        .catch(() => {});
    },
    [live.running, liveParams, stopLive],
  );

  const setLed = useCallback(async (p: LedParam) => {
    setLedState(p);
    await api.setLedParam(p);
  }, []);

  const value = useMemo(
    () => ({
      device,
      scanning,
      scanNote,
      rescan,
      led,
      setLed,
      theme,
      setTheme: setThemeState,
      dark,
      profile,
      setProfile,
      live,
      liveParams,
      startLive,
      updateLive,
      stopLive,
      experimental,
      setExperimental,
    }),
    [device, scanning, scanNote, rescan, led, setLed, theme, dark, profile, setProfile, live, liveParams, startLive, updateLive, stopLive, experimental, setExperimental],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}
