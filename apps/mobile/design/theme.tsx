/**
 * Theme context. Resolves the active colour set from the system colour
 * scheme (dark mode is first-class, not bolted on). Components read colours
 * via `useTheme()` and apply them inline; static layout (spacing, radius,
 * type metrics) stays in StyleSheet so only colour is dynamic.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { colors, colorsDark, type ThemeColors } from "./tokens";

interface ThemeValue {
  colors: ThemeColors;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeValue>({ colors, isDark: false });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const value = useMemo<ThemeValue>(
    () => ({ colors: isDark ? colorsDark : colors, isDark }),
    [isDark]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** Shortcut when a component only needs colours. */
export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}
