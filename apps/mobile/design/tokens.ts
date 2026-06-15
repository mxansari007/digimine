/**
 * Design tokens — the ONLY allowed source of colour, type, spacing, radius
 * and elevation values in the app. Hardcoded hex / px / font sizes in a
 * component file are a violation (see ~/.claude/skills mobile-design §3).
 *
 * System: stone-neutral backbone (warm greys, not cold slate) + a single
 * committed accent — teal, the PlacementRanker brand. One accent only.
 * Dark mode is a first-class mirror, built from day one.
 */

export const colors = {
  // Neutrals — the backbone; ~90% of the UI is built from these.
  bg: "#FFFFFF",
  surface: "#FAFAF9",
  surfaceAlt: "#F4F4F2",
  border: "#E7E5E4",
  borderStrong: "#D6D3D1",

  text: "#0C0A09",
  textMuted: "#57534E",
  textSubtle: "#A8A29E",
  textInverse: "#FAFAF9",

  // Single accent — teal. Used sparingly: primary action, active state,
  // selection. Never as decoration or to flood a surface.
  accent: "#0D9488",
  accentMuted: "#0F766E",
  accentSubtle: "#F0FDFA",
  accentText: "#0F766E", // accent-coloured text that must stay legible on light bg

  // Semantic — meaning only, never decoration.
  success: "#15803D",
  warning: "#B45309",
  danger: "#B91C1C",
  info: "#1D4ED8",
  successSubtle: "#F0FDF4",
  warningSubtle: "#FFFBEB",
  dangerSubtle: "#FEF2F2",

  // ── Bold redesign palette ──────────────────────────────────────────────
  // Powers the gradient hero zones, the readiness gauge, and the warm
  // "live/urgent" flare. Light content surfaces stay above; these are the
  // bold accents. Kept identical in light + dark — they're the gradient
  // palette, not theme surfaces.
  ink: "#07201C",
  ink2: "#0B2E28",
  tealDeep: "#0B7C72",
  aqua: "#34E7CE",
  flare: "#FF6B3D",
  flareDeep: "#E8491B",
} as const;

export const colorsDark: Record<keyof typeof colors, string> = {
  bg: "#0C0A09",
  surface: "#1C1917",
  surfaceAlt: "#292524",
  border: "#292524",
  borderStrong: "#44403C",

  text: "#FAFAF9",
  textMuted: "#A8A29E",
  textSubtle: "#78716C",
  textInverse: "#0C0A09",

  accent: "#2DD4BF",
  accentMuted: "#5EEAD4",
  accentSubtle: "#134E4A",
  accentText: "#5EEAD4",

  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#3B82F6",
  successSubtle: "#14271B",
  warningSubtle: "#2A2113",
  dangerSubtle: "#2A1514",

  // Bold palette — same stops in dark mode (gradient/accent, not surfaces).
  ink: "#07201C",
  ink2: "#0B2E28",
  tealDeep: "#0B7C72",
  aqua: "#34E7CE",
  flare: "#FF6B3D",
  flareDeep: "#E8491B",
};

export type ColorKey = keyof typeof colors;
export type ThemeColors = Record<keyof typeof colors, string>;

/**
 * Type scale. One family (system: SF Pro on iOS, Roboto on Android — no
 * custom font loading). Two weights per screen, three with justification.
 */
export const type = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: "700", letterSpacing: -0.4 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -0.3 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.2 },
  title3: { fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.1 },
  body: { fontSize: 17, lineHeight: 24, fontWeight: "400" },
  bodyEm: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0.2 },
} as const;

export type TypeVariant = keyof typeof type;

/** 8pt grid. Every margin / padding / gap snaps to one of these. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const shadow = {
  none: {},
  sm: {
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

/** Standard control heights (skill §4). */
export const size = {
  buttonCompact: 40,
  button: 48,
  buttonHero: 56,
  input: 48,
  listItemMin: 64,
  tabBar: 56,
  tapTarget: 44,
  icon: 24,
  iconSm: 20,
  avatar: 40,
} as const;

/**
 * Gradient color stops for the bold hero zones + the readiness gauge. Use with
 * expo-linear-gradient (`<LinearGradient colors={gradients.signal} …/>`). The
 * `as const` keeps each as a ≥2-length tuple, which the `colors` prop requires.
 */
export const gradients = {
  signal: ["#0B7C72", "#0E9C8E", "#34E7CE"],
  ink: ["#0E3A33", "#07201C"],
  flare: ["#FF8A3D", "#FF6B3D", "#E8491B"],
} as const;
