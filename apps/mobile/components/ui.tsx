/**
 * Tiny shared UI kit — cards, chips, stat tiles, section headers, empty and
 * loading states. Keeps the tab screens lean and the look consistent.
 */
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, radius, spacing } from "@/lib/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label,
  fg = colors.inkSoft,
  bg = colors.bg,
}: {
  label: string;
  fg?: string;
  bg?: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const AVATAR_TINTS = [
  { bg: colors.primaryTint, fg: colors.primaryDark },
  { bg: colors.indigoTint, fg: "#3730a3" },
  { bg: colors.amberTint, fg: "#92400e" },
  { bg: colors.emeraldTint, fg: "#047857" },
  { bg: colors.roseTint, fg: "#be123c" },
];

/** Initial-letter avatar; teacher accounts get the amber tint. */
export function Avatar({
  name,
  size = 42,
  teacher = false,
}: {
  name: string;
  size?: number;
  teacher?: boolean;
}) {
  const letter = (name || "M").trim()[0]?.toUpperCase() || "M";
  // Stable tint from the name so the same person keeps the same colour.
  const idx = teacher
    ? 2
    : letter.charCodeAt(0) % AVATAR_TINTS.length;
  const tint = AVATAR_TINTS[idx];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tint.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: tint.fg, fontWeight: "800", fontSize: size * 0.4 }}>{letter}</Text>
    </View>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

export function StatTile({ label, value, tint }: { label: string; value: string | number; tint?: string }) {
  return (
    <Card style={styles.stat}>
      <Text style={[styles.statValue, tint ? { color: tint } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <Card style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </Card>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <Card style={{ borderColor: "#fecdd3", backgroundColor: "#fff1f2" }}>
      <Text style={{ color: colors.rose, fontWeight: "600", fontSize: 13 }}>{message}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
  },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    alignSelf: "flex-start",
  },
  chipText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  sectionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: spacing(5),
    marginBottom: spacing(2.5),
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.ink },
  sectionHint: { fontSize: 12, color: colors.inkFaint },
  stat: { flex: 1, paddingVertical: spacing(3.5), alignItems: "flex-start", gap: 2 },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.ink },
  statLabel: { fontSize: 11, color: colors.inkSoft },
  empty: { alignItems: "center", paddingVertical: spacing(8), borderStyle: "dashed" },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  emptyBody: { fontSize: 13, color: colors.inkSoft, marginTop: 4, textAlign: "center" },
  loading: { alignItems: "center", justifyContent: "center", paddingVertical: spacing(16), gap: spacing(3) },
  loadingText: { color: colors.inkFaint, fontSize: 13 },
});
