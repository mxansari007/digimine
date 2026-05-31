"use client";

/**
 * Lightweight theme provider (next-themes-style, but dependency-free).
 *
 *  - Three modes: "light" | "dark" | "system". "system" follows the OS via
 *    `prefers-color-scheme` and reacts live when the OS flips.
 *  - The choice is persisted to localStorage and applied by toggling the
 *    `.dark` class + `color-scheme` on <html>. The no-flash script in the
 *    document head (see themeScript.ts) applies the same logic before paint,
 *    so this provider only has to *sync* React state with the DOM on mount —
 *    there is no theme flash and no hydration mismatch.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { THEME_STORAGE_KEY } from "./themeScript";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
    /** The user's chosen mode (may be "system"). */
    theme: Theme;
    /** The concrete theme actually in effect ("light" | "dark"). */
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
    return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    );
}

/** Apply a theme to <html> and return the concrete resolved theme. */
function applyTheme(theme: Theme): ResolvedTheme {
    const isDark = theme === "dark" || (theme === "system" && systemPrefersDark());
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    return isDark ? "dark" : "light";
}

function readStoredTheme(): Theme {
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "light" || stored === "dark" || stored === "system") {
            return stored;
        }
    } catch {
        /* localStorage blocked — fall back to system */
    }
    return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    // Start with the SSR-safe default. The mount effect immediately reconciles
    // this with the persisted value + the class the no-flash script already set.
    const [theme, setThemeState] = useState<Theme>("system");
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

    useEffect(() => {
        const initial = readStoredTheme();
        setThemeState(initial);
        setResolvedTheme(applyTheme(initial));
    }, []);

    // Live-react to OS theme changes while in "system" mode.
    useEffect(() => {
        if (theme !== "system") return;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => setResolvedTheme(applyTheme("system"));
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, [theme]);

    const setTheme = useCallback((next: Theme) => {
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            /* ignore persistence failure */
        }
        setThemeState(next);
        setResolvedTheme(applyTheme(next));
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

/**
 * Read/control the theme. Returns an inert no-op shape when used outside a
 * ThemeProvider so shared chrome can render in apps that don't mount one.
 */
export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        return {
            theme: "light",
            resolvedTheme: "light",
            setTheme: () => {},
        };
    }
    return ctx;
}
