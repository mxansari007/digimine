/**
 * Bold redesign primitives — the signature pieces from the canvas mockups,
 * ported to React Native:
 *   - <Gauge/>         the 270° "readiness" instrument (SVG arc + value)
 *   - <GradientHero/>  a gradient panel for identity / score zones
 *   - <LivePill/>      the warm "LIVE" flare badge (live / urgent only)
 *
 * These layer ON TOP of the existing minimal design system (tokens + ui.tsx);
 * screens adopt them wave-by-wave. Colours come from the bold tokens.
 */
import { useId, type ReactNode } from "react";
import { StyleSheet, Text as RNText, View, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "./theme";
import { colors, gradients, radius, space } from "./tokens";

// ── Readiness gauge ──────────────────────────────────────────────────────
// 270° arc (gap at the bottom), gradient value stroke. The same instrument is
// reused everywhere a score/standing/pulse appears (home, scorecards, debrief).

const R = 84;
const CIRC = 2 * Math.PI * R; // ≈ 527.79
const TRACK_LEN = CIRC * 0.75; // 270° visible arc ≈ 395.84
const GAP_LEN = CIRC * 0.25;

export function Gauge({
  value,
  size = 160,
  label,
  /** `onHero` = sits on the signal gradient (dark number, translucent track). */
  tone = "default",
}: {
  value: number;
  size?: number;
  label?: string;
  tone?: "default" | "onHero";
}) {
  const c = useColors();
  const gid = "g" + useId().replace(/[^a-zA-Z0-9]/g, ""); // RN-svg ids can't contain ':'
  const v = Math.max(0, Math.min(100, value));
  const valLen = (v / 100) * TRACK_LEN;

  const onHero = tone === "onHero";
  const trackColor = onHero ? "rgba(255,255,255,0.22)" : c.border;
  const numberColor = onHero ? "#ffffff" : c.tealDeep;
  const labelColor = onHero ? "rgba(255,255,255,0.85)" : c.textSubtle;
  const gradFrom = onHero ? "#E9FFFB" : c.tealDeep;
  const gradTo = onHero ? "#9CFFEF" : c.aqua;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={gradFrom} />
            <Stop offset="1" stopColor={gradTo} />
          </SvgGradient>
        </Defs>
        <Circle
          cx={100}
          cy={100}
          r={R}
          fill="none"
          stroke={trackColor}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={`${TRACK_LEN} ${GAP_LEN}`}
          originX={100}
          originY={100}
          rotation={135}
        />
        <Circle
          cx={100}
          cy={100}
          r={R}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={`${valLen} ${CIRC}`}
          originX={100}
          originY={100}
          rotation={135}
        />
      </Svg>
      <View style={{ alignItems: "center" }}>
        <RNText
          style={{
            fontSize: size * 0.3,
            lineHeight: size * 0.33,
            fontWeight: "800",
            letterSpacing: -0.5,
            color: numberColor,
          }}
        >
          {Math.round(v)}
        </RNText>
        {label ? (
          <RNText style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.6, color: labelColor, marginTop: 2 }}>
            {label}
          </RNText>
        ) : null}
      </View>
    </View>
  );
}

// ── Gradient hero panel ────────────────────────────────────────────────────

export function GradientHero({
  variant = "signal",
  style,
  children,
}: {
  variant?: keyof typeof gradients;
  style?: ViewStyle;
  children?: ReactNode;
}) {
  return (
    <LinearGradient
      colors={gradients[variant]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius.xl, padding: space[4], overflow: "hidden" }, style]}
    >
      {children}
    </LinearGradient>
  );
}

// ── Live / urgent flare badge ──────────────────────────────────────────────

export function LivePill({ label = "LIVE" }: { label?: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        alignSelf: "flex-start",
        backgroundColor: colors.flare,
        borderRadius: radius.full,
        paddingHorizontal: 9,
        paddingVertical: 4,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
      <RNText style={{ color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 }}>{label}</RNText>
    </View>
  );
}
