import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const THEME_KEY = "moneyos.theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function resolveSystem(): ResolvedTheme {
  return typeof window !== "undefined" && window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function readStored(): ThemeMode {
  const value = localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = mode === "system" ? resolveSystem() : mode;
  document.documentElement.setAttribute("data-theme", resolved);
  return resolved;
}

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStored);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => applyTheme(readStored()));

  useEffect(() => {
    localStorage.setItem(THEME_KEY, mode);
    setResolved(applyTheme(mode));
  }, [mode]);

  useEffect(() => {
    if (mode !== "system") {
      return;
    }
    const media = window.matchMedia(MEDIA_QUERY);
    const onChange = () => setResolved(applyTheme("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
