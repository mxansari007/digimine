import type { Config } from "tailwindcss";

/**
 * Shared Tailwind CSS configuration
 *
 * Apps extend this config for consistent styling. The palette is named after
 * intent (primary / accent / success / warning / danger / info), so pages can
 * keep using `text-primary-700` etc. — only the underlying hex values change
 * when we rebrand.
 *
 * Primary = teal (educational, confident, growth). Accent = amber (energy,
 * call to action).
 *
 * ── Theming (light / Tokyo-Night dark) ───────────────────────────────────
 * The neutral ramps (`slate`, `gray`) and the semantic surface tokens
 * (`background` / `surface` / `popover` / `border` / `ring` / `foreground`)
 * are backed by CSS custom properties rather than fixed hex values. The web
 * app defines those properties twice — once on `:root` (the exact current
 * light values, so light mode is pixel-identical) and once on `.dark` (a
 * curated Tokyo Night palette). Toggling the `.dark` class on <html> then
 * flips ~every slate/gray/surface utility across the whole app at once,
 * with no per-component edits. Brand colours (white / black / primary /
 * accent / success / warning / danger / info) stay literal so `text-white`
 * on a teal button never inverts. See apps/web/src/app/globals.css.
 */

/** A CSS-variable-backed colour ramp. `<alpha-value>` keeps opacity
 *  modifiers (e.g. `bg-slate-200/40`) working. */
const varRamp = (name: string): Record<string, string> =>
    Object.fromEntries(
        [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [
            s,
            `rgb(var(--c-${name}-${s}) / <alpha-value>)`,
        ])
    );
/** A single CSS-variable-backed semantic colour token. */
const varToken = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

const config: Partial<Config> = {
    darkMode: ["class"],
    theme: {
        extend: {
            colors: {
                // Neutral ramps — backed by CSS variables so they flip
                // between the light palette and Tokyo Night on `.dark`.
                slate: varRamp("slate"),
                gray: varRamp("gray"),
                // Semantic surface tokens (shadcn / lovable pattern). Reach
                // for these in new code so theming stays automatic:
                //   bg-background  — the page canvas
                //   bg-surface     — a card / panel (the dark-mode `bg-white`)
                //   bg-popover     — elevated menus & dropdowns
                //   border-border  — hairline dividers
                //   text-foreground / text-muted-foreground — body / secondary
                background: varToken("background"),
                surface: {
                    DEFAULT: varToken("surface"),
                    muted: varToken("surface-muted"),
                },
                card: varToken("surface"),
                popover: varToken("popover"),
                overlay: varToken("overlay"),
                foreground: varToken("foreground"),
                "muted-foreground": varToken("muted-foreground"),
                border: varToken("border-token"),
                input: varToken("input-token"),
                ring: varToken("ring-token"),
                // Primary — teal. Replaces the muted sage. Same class names
                // as before so existing markup continues to work.
                primary: {
                    50: "#f0fdfa",
                    100: "#ccfbf1",
                    200: "#99f6e4",
                    300: "#5eead4",
                    400: "#2dd4bf",
                    500: "#14b8a6",
                    600: "#0d9488",
                    700: "#0f766e",
                    800: "#115e59",
                    900: "#134e4a",
                    950: "#042f2e",
                },
                // Accent — warm amber. Used for high-emphasis CTAs and
                // status pops (TEST IN PROGRESS, "Live", etc.).
                accent: {
                    50: "#fffbeb",
                    100: "#fef3c7",
                    200: "#fde68a",
                    300: "#fcd34d",
                    400: "#fbbf24",
                    500: "#f59e0b",
                    600: "#d97706",
                    700: "#b45309",
                    800: "#92400e",
                    900: "#78350f",
                    950: "#451a03",
                },
                // Semantic aliases — components reach for these rather than
                // raw Tailwind colours so the meaning stays explicit.
                success: {
                    50: "#ecfdf5",
                    100: "#d1fae5",
                    200: "#a7f3d0",
                    300: "#6ee7b7",
                    400: "#34d399",
                    500: "#10b981",
                    600: "#059669",
                    700: "#047857",
                    800: "#065f46",
                    900: "#064e3b",
                    950: "#022c22",
                },
                warning: {
                    50: "#fffbeb",
                    100: "#fef3c7",
                    200: "#fde68a",
                    300: "#fcd34d",
                    400: "#fbbf24",
                    500: "#f59e0b",
                    600: "#d97706",
                    700: "#b45309",
                    800: "#92400e",
                    900: "#78350f",
                    950: "#451a03",
                },
                danger: {
                    50: "#fff1f2",
                    100: "#ffe4e6",
                    200: "#fecdd3",
                    300: "#fda4af",
                    400: "#fb7185",
                    500: "#f43f5e",
                    600: "#e11d48",
                    700: "#be123c",
                    800: "#9f1239",
                    900: "#881337",
                    950: "#4c0519",
                },
                info: {
                    50: "#eff6ff",
                    100: "#dbeafe",
                    200: "#bfdbfe",
                    300: "#93c5fd",
                    400: "#60a5fa",
                    500: "#3b82f6",
                    600: "#2563eb",
                    700: "#1d4ed8",
                    800: "#1e40af",
                    900: "#1e3a8a",
                    950: "#172554",
                },
            },
            fontFamily: {
                // Use the next/font CSS variables (set on <html> in the web app's
                // layout). Bare "Inter"/"Outfit" aren't real loaded families —
                // next/font only exposes them via these variables — so using the
                // names directly silently falls back to system-ui.
                sans: ["var(--font-inter)", "system-ui", "sans-serif"],
                display: ["var(--font-outfit)", "system-ui", "sans-serif"],
                mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
            },
            borderRadius: {
                "4xl": "2rem",
            },
            boxShadow: {
                // Soft, layered shadows that feel "lifted off the page"
                // without the hard drop-shadow look.
                "soft-sm": "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
                soft: "0 4px 12px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04)",
                "soft-lg": "0 12px 24px rgba(15, 23, 42, 0.08), 0 4px 8px rgba(15, 23, 42, 0.04)",
                "soft-xl": "0 24px 48px rgba(15, 23, 42, 0.10), 0 8px 16px rgba(15, 23, 42, 0.05)",
                // Brand-coloured glows for emphasis.
                "glow-primary": "0 0 0 1px rgba(20, 184, 166, 0.25), 0 10px 24px rgba(20, 184, 166, 0.20)",
                "glow-accent": "0 0 0 1px rgba(245, 158, 11, 0.25), 0 10px 24px rgba(245, 158, 11, 0.22)",
                "glow-success": "0 0 0 1px rgba(16, 185, 129, 0.25), 0 10px 24px rgba(16, 185, 129, 0.22)",
                "glow-danger": "0 0 0 1px rgba(244, 63, 94, 0.25), 0 10px 24px rgba(244, 63, 94, 0.22)",
            },
            animation: {
                "fade-in": "fadeIn 0.5s ease-in-out",
                "slide-up": "slideUp 0.3s ease-out",
                "slide-down": "slideDown 0.3s ease-out",
                "slide-in-right": "slideInRight 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                "slide-in-left": "slideInLeft 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
                "shimmer": "shimmer 2.5s infinite linear",
                "spin-slow": "spin 4s linear infinite",
            },
            keyframes: {
                fadeIn: {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                slideUp: {
                    "0%": { transform: "translateY(10px)", opacity: "0" },
                    "100%": { transform: "translateY(0)", opacity: "1" },
                },
                slideDown: {
                    "0%": { transform: "translateY(-10px)", opacity: "0" },
                    "100%": { transform: "translateY(0)", opacity: "1" },
                },
                slideInRight: {
                    "0%": { transform: "translateX(16px)", opacity: "0" },
                    "100%": { transform: "translateX(0)", opacity: "1" },
                },
                slideInLeft: {
                    "0%": { transform: "translateX(-16px)", opacity: "0" },
                    "100%": { transform: "translateX(0)", opacity: "1" },
                },
                pulseSoft: {
                    "0%, 100%": { opacity: "1" },
                    "50%": { opacity: "0.55" },
                },
                shimmer: {
                    "0%": { transform: "translateX(-100%)" },
                    "100%": { transform: "translateX(100%)" },
                },
            },
        },
    },
    plugins: [],
};

export default config;
