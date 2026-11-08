import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type ConnectedDevice, type LedParam, type ScanInfo } from "./backend";

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

  const setLed = useCallback(async (p: LedParam) => {
    setLedState(p);
    await api.setLedParam(p);
  }, []);

  const value = useMemo(
    () => ({ device, scanning, scanNote, rescan, led, setLed, theme, setTheme: setThemeState, dark }),
    [device, scanning, scanNote, rescan, led, setLed, theme, dark],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}
