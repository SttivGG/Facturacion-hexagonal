import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { readLocal, writeLocal } from "./hooks";

export interface Appearance {
  theme: "dark" | "light";
  background: "aurora" | "bosque" | "horizonte";
  frost: number;
  opacity: number;
}
export const appearanceDefaults: Appearance = {
  theme: "light",
  background: "aurora",
  frost: 26,
  opacity: 68,
};
const defaults = appearanceDefaults;
const appearanceKey = "nexo.appearance.v2";
const AppearanceContext = createContext({
  preferences: defaults,
  update: (_value: Partial<Appearance>) => {},
});
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Appearance>(() => {
    const saved =
      readLocal<Partial<Appearance> | null>(appearanceKey, defaults) ||
      defaults;
    return {
      theme: saved.theme === "dark" ? "dark" : "light",
      background: ["aurora", "bosque", "horizonte"].includes(
        saved.background || "",
      )
        ? saved.background!
        : "aurora",
      frost:
        typeof saved.frost === "number" && Number.isFinite(saved.frost)
          ? Math.min(32, Math.max(8, saved.frost))
          : defaults.frost,
      opacity:
        typeof saved.opacity === "number" && Number.isFinite(saved.opacity)
          ? Math.min(90, Math.max(55, saved.opacity))
          : defaults.opacity,
    };
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.background = preferences.background;
    document.documentElement.style.setProperty(
      "--glass-blur",
      `${preferences.frost}px`,
    );
    document.documentElement.style.setProperty(
      "--surface-opacity",
      String(preferences.opacity / 100),
    );
    writeLocal(appearanceKey, preferences);
  }, [preferences]);
  return (
    <AppearanceContext.Provider
      value={{
        preferences,
        update: (value) => setPreferences((p) => ({ ...p, ...value })),
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}
export const useAppearance = () => useContext(AppearanceContext);
