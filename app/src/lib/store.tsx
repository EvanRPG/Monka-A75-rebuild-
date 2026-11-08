import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type ConnectedDevice, type LedParam } from "./backend";

export type ThemeChoice = "dark" | "light" | "system";
export type Skin = "white" | "photo";

interface AppState {
  device: ConnectedDevice | null;
  scanning: boolean;
  rescan: () => void;
  led: LedParam | null;
  setLed: (p: LedParam) => Promise<void>;
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  skin: Skin;
  setSkin: (s: Skin) => void;
}

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

function readSkin(): Skin {
  try {
    if (localStorage.getItem("a75.skin") === "photo") return "photo";
  } catch {
    /* storage unavailable */
  }
  return "white";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<ConnectedDevice | null>(null);
  const [scanning, setScanning] = useState(true);
  const [led, setLedState] = useState<LedParam | null>(null);
  const [theme, setThemeState] = useState<ThemeChoice>(readTheme);
  const [skin, setSkinState] = useState<Skin>(readSkin);
  const setSkin = useCallback((v: Skin) => {
    setSkinState(v);
    try {
      localStorage.setItem("a75.skin", v);
    } catch {
      /* storage unavailable */
    }
  }, []);

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

  const rescan = useCallback(() => {
    setScanning(true);
    api
      .scan()
      .then(async (d) => {
        setDevice(d);
        if (d) setLedState(await api.getLedParam());
      })
      .catch(() => setDevice(null))
      .finally(() => setScanning(false));
  }, []);

  useEffect(() => {
    rescan();
  }, [rescan]);

  // Battery only changes slowly and only exists over 2.4G: a quiet poll.
  useEffect(() => {
    if (!device || device.link !== "receiver") return;
    const t = setInterval(() => {
      api.scan().then((d) => d && setDevice(d)).catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, [device]);

  const setLed = useCallback(async (p: LedParam) => {
    setLedState(p);
    await api.setLedParam(p);
  }, []);

  const value = useMemo(
    () => ({ device, scanning, rescan, led, setLed, theme, setTheme: setThemeState, skin, setSkin }),
    [device, scanning, rescan, led, setLed, theme, skin, setSkin],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}
