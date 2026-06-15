/**
 * PlacementRanker brand tokens — mirrors the web app's Tailwind palette
 * (teal primary, slate neutrals, amber for credits/currency, the dark
 * "room" navy used by heroes and the interview environment).
 */
export const colors = {
  primary: "#0d9488", // teal-600 — brand
  primaryLight: "#14b8a6", // teal-500
  primaryDark: "#0f766e", // teal-700
  primaryTint: "#ccfbf1", // teal-100

  ink: "#0f172a", // slate-900
  inkSoft: "#475569", // slate-600
  inkFaint: "#94a3b8", // slate-400

  bg: "#f8fafc", // slate-50
  surface: "#ffffff",
  border: "#e2e8f0", // slate-200

  heroBg: "#070b14", // the interview-room blue-black
  heroPanel: "#0c1424",

  amber: "#f59e0b",
  amberTint: "#fef3c7",
  emerald: "#10b981",
  emeraldTint: "#d1fae5",
  rose: "#e11d48",
  roseTint: "#ffe4e6",
  indigo: "#6366f1",
  indigoTint: "#e0e7ff",
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

export const spacing = (n: number) => n * 4;

export const difficultyColor: Record<string, { fg: string; bg: string }> = {
  easy: { fg: "#047857", bg: colors.emeraldTint },
  medium: { fg: "#b45309", bg: colors.amberTint },
  hard: { fg: "#be123c", bg: colors.roseTint },
};
