import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { api, type ClassOverview, type OverviewStudent } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Screen,
  ScreenScroll,
  SearchInput,
  Text,
} from "@/design/ui";
import { GradientHero } from "@/design/bold";

type FilterKey = "all" | "risk" | "notStarted";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "risk", label: "At risk" },
  { key: "notStarted", label: "Not started" },
];

/** Risk band → badge label + token names (subtle bg + readable text). */
const RISK_META: Record<string, { label: string; bg: "successSubtle" | "warningSubtle" | "dangerSubtle"; fg: "success" | "warning" | "danger" }> = {
  low: { label: "LOW", bg: "successSubtle", fg: "success" },
  medium: { label: "MED", bg: "warningSubtle", fg: "warning" },
  high: { label: "HIGH", bg: "dangerSubtle", fg: "danger" },
};

const bandRank = (band: string) => (band === "high" ? 0 : band === "medium" ? 1 : 2);

export default function TeacherClassStudents() {
  const c = useColors();
  const router = useRouter();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const [ov, setOv] = useState<ClassOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!classId) return;
    setError(null);
    try {
      setOv(await api.classOverview(String(classId)));
    } catch (e: any) {
      setError(e?.message || "Couldn't load this roster.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  // IDs in the "not started" subset (active but 0 attempts), for the filter.
  const notStartedIds = useMemo(
    () => new Set((ov?.notStarted || []).map((s) => s.studentId)),
    [ov],
  );

  const roster = useMemo(() => {
    const all = ov?.students || [];
    const q = query.trim().toLowerCase();
    const filtered = all.filter((s) => {
      if (filter === "risk" && s.risk.band !== "high") return false;
      if (filter === "notStarted" && !(notStartedIds.has(s.studentId) || s.stats.totalAttempts === 0)) return false;
      if (q && !s.studentName.toLowerCase().includes(q)) return false;
      return true;
    });
    // At-risk (high) first, then by average percentage desc.
    return [...filtered].sort((a, b) => {
      const r = bandRank(a.risk.band) - bandRank(b.risk.band);
      if (r !== 0) return r;
      return (b.stats.averagePercentage ?? -1) - (a.stats.averagePercentage ?? -1);
    });
  }, [ov, filter, query, notStartedIds]);

  if (loading) {
    return (
      <Screen edges={["bottom"]}>
        <ListSkeleton rows={6} />
      </Screen>
    );
  }
  if (error || !ov) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorState message={error || "Roster not found."} onRetry={load} />
      </Screen>
    );
  }

  const ins = ov.insights;
  const total = ov.students.length;

  return (
    <Screen edges={["bottom"]}>
      <ScreenScroll
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={c.textSubtle}
          />
        }
      >
        {/* Summary strip — real insights for this section */}
        <GradientHero variant="signal" style={{ marginBottom: space[5], paddingVertical: space[5] }}>
          <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>
            Roster
          </Text>
          <Text variant="title2" style={{ color: "#fff", marginTop: 2 }} numberOfLines={2}>
            {ov.class.name}
          </Text>
          <View style={{ flexDirection: "row", gap: space[2], marginTop: space[4] }}>
            {[
              [`${ins.activeStudents}`, "ACTIVE"],
              [`${Math.round(ins.classAverage)}%`, "CLASS AVG"],
              [`${ins.atRiskCount}`, "AT RISK"],
            ].map(([n, l], i) => (
              <View
                key={l}
                style={{
                  flex: 1,
                  backgroundColor: i === 2 && ins.atRiskCount > 0 ? "rgba(255,107,61,0.9)" : "rgba(255,255,255,0.16)",
                  borderRadius: radius.md,
                  paddingVertical: space[2],
                  alignItems: "center",
                }}
              >
                <Text variant="bodyEm" style={{ color: "#fff" }}>
                  {n}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 9, fontWeight: "700", marginTop: 1 }}>{l}</Text>
              </View>
            ))}
          </View>
        </GradientHero>

        <SearchInput
          placeholder="Search by name…"
          value={query}
          onChangeText={setQuery}
          trailing={query ? <Text variant="caption" color="accentText" onPress={() => setQuery("")}>Clear</Text> : undefined}
        />

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[3], marginBottom: space[4] }}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space[3] }}>
          <Text variant="caption" color="textSubtle" style={{ textTransform: "uppercase" }}>
            {roster.length === total ? `Roster · ${total}` : `${roster.length} of ${total}`}
          </Text>
          <Text variant="caption" color="textSubtle">
            Sorted by risk
          </Text>
        </View>

        {roster.length === 0 ? (
          <EmptyState
            icon={query || filter !== "all" ? "search" : "users"}
            title={query || filter !== "all" ? "No matches" : "No students yet"}
            body={
              query || filter !== "all"
                ? "Try a different name or filter."
                : "Students enrolled in this section show up here."
            }
          />
        ) : (
          <View style={{ gap: space[2] }}>
            {roster.map((s) => (
              <StudentRow
                key={s.studentId}
                student={s}
                onPress={() => router.push(`/teacher/student/${s.studentId}?classId=${classId}` as Href)}
              />
            ))}
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function StudentRow({ student, onPress }: { student: OverviewStudent; onPress: () => void }) {
  const c = useColors();
  const isHigh = student.risk.band === "high";
  const meta = RISK_META[student.risk.band] ?? RISK_META.low;
  const letter = (student.studentName || "?").trim()[0]?.toUpperCase() || "?";
  // Progress fill: prefer coverage, fall back to average; clamp 0–100.
  const pctRaw = student.stats.coveragePercent ?? student.stats.averagePercentage ?? 0;
  const pct = Math.max(0, Math.min(100, Math.round(pctRaw)));
  const subline = student.rollNumber ? `Roll ${student.rollNumber}` : student.studentEmail;

  return (
    <Card onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: radius.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isHigh ? c.dangerSubtle : c.accentSubtle,
        }}
      >
        <Text variant="bodyEm" style={{ color: isHigh ? c.danger : c.accentText }}>
          {letter}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="subhead" numberOfLines={1}>
          {student.studentName}
        </Text>
        {subline ? (
          <Text variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 1 }}>
            {subline}
          </Text>
        ) : null}
        <View style={{ height: 5, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: "hidden", marginTop: space[2] }}>
          <View style={{ height: 5, width: `${pct}%`, borderRadius: radius.full, backgroundColor: c.accent }} />
        </View>
      </View>

      <View style={{ alignItems: "flex-end", gap: space[1] }}>
        <View
          style={{
            paddingHorizontal: space[2],
            paddingVertical: 2,
            borderRadius: radius.full,
            backgroundColor: c[meta.bg],
          }}
        >
          <Text variant="caption" style={{ color: c[meta.fg], fontWeight: "700" }}>
            {meta.label}
          </Text>
        </View>
        <Text variant="subhead" color={isHigh ? "danger" : "textMuted"} style={{ fontWeight: "700" }}>
          {pct}%
        </Text>
      </View>
    </Card>
  );
}
