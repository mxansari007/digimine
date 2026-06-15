/**
 * Core UI primitives. Every screen composes these — they encode the design
 * system (tokens, type scale, 8pt grid, press feedback, dark mode) so screen
 * code stays small and can't drift. No screen should reach past these into
 * raw hex / px values.
 */
import { useEffect, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text as RNText,
  type TextProps as RNTextProps,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "./theme";
import { radius, size, space, type, type ColorKey, type TypeVariant } from "./tokens";

// ── Text ───────────────────────────────────────────────────────────────────

interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  color?: ColorKey;
  align?: "left" | "center" | "right";
  children?: ReactNode;
}

export function Text({ variant = "body", color = "text", align, style, ...rest }: TextProps) {
  const c = useColors();
  const t = type[variant];
  return (
    <RNText
      {...rest}
      style={[
        {
          color: c[color],
          fontSize: t.fontSize,
          lineHeight: t.lineHeight,
          fontWeight: t.fontWeight as any,
          letterSpacing: (t as any).letterSpacing,
          textAlign: align,
        },
        style,
      ]}
    />
  );
}

// ── Icon ─────────────────────────────────────────────────────────────────────

export type IconName = keyof typeof Feather.glyphMap;

export function Icon({
  name,
  size: s = size.icon,
  color = "text",
  tint,
}: {
  name: IconName;
  size?: number;
  color?: ColorKey;
  /** Raw colour override (rare — prefer a token via `color`). */
  tint?: string;
}) {
  const c = useColors();
  return <Feather name={name} size={s} color={tint ?? c[color]} />;
}

// ── Press feedback ──────────────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends PressableProps {
  haptic?: boolean;
  children?: ReactNode;
  scaleTo?: number;
}

/** Pressable with a 100ms scale-down + optional light haptic (skill §4.1, §6). */
export function PressableScale({
  haptic = false,
  scaleTo = 0.98,
  onPress,
  style,
  children,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.value = withTiming(scaleTo, { duration: 100 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: 100 });
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
      style={[aStyle, typeof style === "function" ? undefined : style]}
    >
      {children}
    </AnimatedPressable>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export function Screen({
  children,
  edges = ["top"],
  style,
}: {
  children: ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
}) {
  const c = useColors();
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: c.bg }, style]}>
      {children}
    </SafeAreaView>
  );
}

/** Scroll container with the standard screen padding + bottom breathing room. */
export function ScreenScroll({ children, contentContainerStyle, ...rest }: ScrollViewProps & { children: ReactNode }) {
  const c = useColors();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "compact" | "default" | "hero";

export function Button({
  label,
  onPress,
  variant = "primary",
  size: bSize = "default",
  loading,
  disabled,
  leftIcon,
  fullWidth,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: IconName;
  fullWidth?: boolean;
  style?: ViewStyle;
}) {
  const c = useColors();
  const height = bSize === "hero" ? size.buttonHero : bSize === "compact" ? size.buttonCompact : size.button;
  const bg =
    variant === "primary" ? c.accent : variant === "danger" ? c.danger : variant === "secondary" ? c.surfaceAlt : "transparent";
  const fg = variant === "primary" || variant === "danger" ? c.textInverse : c.text;
  const isOff = disabled || loading;

  return (
    <PressableScale
      haptic={variant === "primary" || variant === "danger"}
      disabled={isOff}
      onPress={onPress}
      style={[
        styles.button,
        { height, backgroundColor: bg, opacity: isOff ? 0.5 : 1 },
        fullWidth && { alignSelf: "stretch" },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={styles.buttonInner}>
          {leftIcon ? <Feather name={leftIcon} size={size.iconSm} color={fg} /> : null}
          <RNText
            style={{
              color: fg,
              fontSize: type.bodyEm.fontSize,
              lineHeight: type.bodyEm.lineHeight,
              fontWeight: "600",
            }}
          >
            {label}
          </RNText>
        </View>
      )}
    </PressableScale>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────

interface InputProps extends TextInputProps {
  leftIcon?: IconName;
  trailing?: ReactNode;
  invalid?: boolean;
  pill?: boolean;
  containerStyle?: ViewStyle;
}

export function Input({ leftIcon, trailing, invalid, pill, style, multiline, containerStyle, ...rest }: InputProps) {
  const c = useColors();
  return (
    <View
      style={[
        styles.inputWrap,
        {
          backgroundColor: c.surface,
          borderColor: invalid ? c.danger : c.border,
          borderRadius: pill ? radius.full : radius.md,
          minHeight: size.input,
          alignItems: multiline ? "flex-start" : "center",
        },
        containerStyle,
      ]}
    >
      {leftIcon ? (
        <Feather name={leftIcon} size={size.iconSm} color={c.textSubtle} style={{ marginRight: space[2] }} />
      ) : null}
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={c.textSubtle}
        style={[
          {
            flex: 1,
            color: c.text,
            fontSize: type.callout.fontSize,
            lineHeight: type.callout.lineHeight,
            paddingVertical: multiline ? space[3] : 0,
          },
          style,
        ]}
      />
      {trailing ? <View style={{ marginLeft: space[2] }}>{trailing}</View> : null}
    </View>
  );
}

/** Pill-shaped search field for list headers. */
export function SearchInput(props: InputProps) {
  return <Input pill leftIcon="search" autoCapitalize="none" autoCorrect={false} returnKeyType="search" {...props} />;
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  children,
  onPress,
  style,
  padded = true,
  haptic,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padded?: boolean;
  haptic?: boolean;
}) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    ...(padded ? { padding: space[4] } : {}),
  };
  if (onPress) {
    return (
      <PressableScale haptic={haptic} onPress={onPress} style={[base, style]}>
        {children}
      </PressableScale>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

// ── List item ────────────────────────────────────────────────────────────────

export function ListItem({
  title,
  subtitle,
  left,
  trailing,
  onPress,
  showChevron,
  divider = true,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  divider?: boolean;
}) {
  const c = useColors();
  const body = (
    <View style={styles.listRow}>
      {left ? <View style={styles.listLeft}>{left}</View> : null}
      <View style={[styles.listText, divider && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={{ flex: 1 }}>
          <Text variant="callout" style={{ fontWeight: "500" }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="footnote" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing ? <View style={styles.listTrailing}>{trailing}</View> : null}
        {showChevron ? <Feather name="chevron-right" size={size.iconSm} color={c.textSubtle} /> : null}
      </View>
    </View>
  );
  return onPress ? (
    <PressableScale onPress={onPress} scaleTo={0.99}>
      {body}
    </PressableScale>
  ) : (
    body
  );
}

// ── Screen header (large title, optional eyebrow + trailing actions) ─────────

export function ScreenHeader({
  title,
  eyebrow,
  trailing,
  style,
}: {
  title: string;
  eyebrow?: string;
  trailing?: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.screenHeader, style]}>
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <Text variant="caption" color="textSubtle" style={{ textTransform: "uppercase", marginBottom: 2 }}>
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="title1" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {trailing ? <View style={styles.headerTrailing}>{trailing}</View> : null}
    </View>
  );
}

/** Circular icon button used in screen headers (back, actions). */
export function IconButton({
  icon,
  onPress,
  badge,
  tone = "neutral",
}: {
  icon: IconName;
  onPress?: () => void;
  badge?: number;
  tone?: "neutral" | "accent";
}) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} scaleTo={0.92} style={[styles.iconButton, { backgroundColor: c.surfaceAlt }]}>
      <Feather name={icon} size={size.iconSm} color={tone === "accent" ? c.accentText : c.text} />
      {badge && badge > 0 ? (
        <View style={[styles.iconBadge, { backgroundColor: c.danger, borderColor: c.bg }]}>
          <RNText style={styles.iconBadgeText}>{badge > 9 ? "9+" : badge}</RNText>
        </View>
      ) : null}
    </PressableScale>
  );
}

// ── Section header (type-led, not boxed) ─────────────────────────────────────

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="caption" color="textSubtle" style={{ textTransform: "uppercase" }}>
        {title}
      </Text>
      {action}
    </View>
  );
}

// ── Avatar (neutral by default; accent denotes a teacher/role) ───────────────

export function Avatar({ name, role, size: s = size.avatar }: { name: string; role?: "teacher" | "student" | string; size?: number }) {
  const c = useColors();
  const isTeacher = role && role !== "student";
  const letter = (name || "?").trim()[0]?.toUpperCase() || "?";
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isTeacher ? c.accentSubtle : c.surfaceAlt,
      }}
    >
      <RNText style={{ color: isTeacher ? c.accentText : c.textMuted, fontWeight: "600", fontSize: s * 0.4 }}>
        {letter}
      </RNText>
    </View>
  );
}

// ── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({
  label,
  selected,
  tone = "neutral",
  onPress,
}: {
  label: string;
  selected?: boolean;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  onPress?: () => void;
}) {
  const c = useColors();
  const toneColor =
    tone === "accent" ? c.accentText : tone === "success" ? c.success : tone === "warning" ? c.warning : tone === "danger" ? c.danger : c.textMuted;
  const bg = selected
    ? c.accent
    : tone === "neutral"
      ? c.surfaceAlt
      : tone === "accent"
        ? c.accentSubtle
        : tone === "success"
          ? c.successSubtle
          : tone === "warning"
            ? c.warningSubtle
            : c.dangerSubtle;
  const fg = selected ? c.textInverse : toneColor;
  const inner = (
    <RNText style={{ color: fg, fontSize: type.caption.fontSize, fontWeight: "500", letterSpacing: 0.2 }}>
      {label}
    </RNText>
  );
  const chipStyle = [styles.chip, { backgroundColor: bg }];
  return onPress ? (
    <PressableScale onPress={onPress} scaleTo={0.96} style={chipStyle}>
      {inner}
    </PressableScale>
  ) : (
    <View style={chipStyle}>{inner}</View>
  );
}

// ── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ inset }: { inset?: number }) {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: inset ?? 0 }} />;
}

// ── States: Empty / Loading (skeleton) / Error ───────────────────────────────

export function EmptyState({
  icon = "inbox",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.centerState}>
      <Feather name={icon} size={32} color={c.textSubtle} />
      <Text variant="title3" align="center" style={{ marginTop: space[4] }}>
        {title}
      </Text>
      {body ? (
        <Text variant="callout" color="textMuted" align="center" style={{ marginTop: space[2], maxWidth: 280 }}>
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: space[6] }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.centerState}>
      <EmptyStateInner
        icon="alert-circle"
        title="Something went wrong"
        body={message || "Couldn't load this right now."}
      />
      {onRetry ? <Button label="Try again" variant="secondary" size="compact" onPress={onRetry} style={{ marginTop: space[5] }} /> : null}
    </View>
  );
}

function EmptyStateInner({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  const c = useColors();
  return (
    <>
      <Feather name={icon} size={32} color={c.textSubtle} />
      <Text variant="title3" align="center" style={{ marginTop: space[4] }}>
        {title}
      </Text>
      {body ? (
        <Text variant="callout" color="textMuted" align="center" style={{ marginTop: space[2], maxWidth: 280 }}>
          {body}
        </Text>
      ) : null}
    </>
  );
}

/** Pulsing skeleton block for loading states (skill §5.3 — never a bare spinner). */
export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | string; style?: ViewStyle }) {
  const c = useColors();
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);
  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        { height, width: width as any, backgroundColor: c.surfaceAlt, borderRadius: radius.sm },
        aStyle,
        style,
      ]}
    />
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View style={{ paddingHorizontal: space[4], paddingTop: space[6], gap: space[5] }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <Skeleton height={size.avatar} width={size.avatar} style={{ borderRadius: radius.full }} />
          <View style={{ flex: 1, gap: space[2] }}>
            <Skeleton height={14} width="60%" />
            <Skeleton height={12} width="40%" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: space[4], paddingTop: space[6], paddingBottom: space[16] },
  button: {
    borderRadius: radius.md,
    paddingHorizontal: space[5],
    alignItems: "center",
    justifyContent: "center",
  },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: space[2] },
  inputWrap: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[4],
  },
  listRow: { flexDirection: "row", alignItems: "center", minHeight: size.listItemMin },
  listLeft: { marginRight: space[3] },
  listText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
  },
  listTrailing: { marginLeft: space[2] },
  screenHeader: { flexDirection: "row", alignItems: "flex-end", paddingBottom: space[5] },
  headerTrailing: { flexDirection: "row", alignItems: "center", gap: space[2], marginLeft: space[3] },
  iconButton: {
    width: size.tapTarget,
    height: size.tapTarget,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  iconBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[3],
  },
  avatar: {
    width: size.avatar,
    height: size.avatar,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    borderRadius: radius.sm,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    alignSelf: "flex-start",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[8],
    paddingVertical: space[16],
  },
});
