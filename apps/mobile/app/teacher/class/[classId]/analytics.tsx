import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { api, type ClassAnalytics, type LeaderEntry } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Card,
  EmptyState,
  ErrorState,
  Icon,
  ListSkeleton,
  PressableScale,
  Screen,
  ScreenScroll,
  SectionHeader,
  Text,
} from "@/design/ui";
import { Gauge, GradientHero } from "@/design/bold";

const BAND_LABELS = ["0", "20", "40", "60", "80", "100"];

/** Mastery fill colour: weak → danger, mid → warning, strong → accent. */
const masteryTone = (c: ReturnType<typeof useColors>, pct: number) =>
  pct < 40 ? c.danger : pct < 70 ? c.warning : c.accent;

const riskTone = (c: ReturnType<typeof useColors>, band: string) =>
  band === "high" ? c.danger : band === "medium" ? c.warning : c.success;

const riskSubtle = (c: ReturnType<typeof useColors>, band: string) =>
  band === "high" ? c.dangerSubtle : band === "medium" ? c.warningSubtle : c.successSubtle;

const initial = (name: string) => (name || "?").trim()[0]?.toUpperCase() || "?";

export default function ClassAnalyticsScreen() {
  const c = useColors();
  const router = useRouter();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const [data, setData] = useState<ClassAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) return;
    setError(null);
    try {
      setData(await api.classAnalytics(String(classId)));
    } catch (e: any) {
      setError(e?.message || "Couldn't load analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen edges={["bottom"]}>
        <ListSkeleton rows={6} />
      </Screen>
    );
  }
  if (error || !data) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorState message={error || "Analytics not found."} onRetry={load} />
      </Screen>
    );
  }

  const t = data.totals;
  const histTotal = data.histogram.reduce((a, n) => a + n, 0);
  const noData = t.activeStudents === 0 || histTotal === 0;

  if (noData) {
    return (
      <Screen edges={["bottom"]}>
        <ScreenScroll
          contentContainerStyle={{ flexGrow: 1 }}
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
          <EmptyState
            icon="bar-chart-2"
            title="No analytics yet"
            body="Once students attempt content, class trends appear here."
          />
        </ScreenScroll>
      </Screen>
    );
  }

  const histMax = Math.max(...data.histogram, 1);
  const topPerformers = data.topPerformers || [];
  const bottomPerformers = data.bottomPerformers || [];
  const atRisk = data.atRisk || [];
  const topicMastery = (data.topicMastery || []).slice(0, 6);

  const kpis: { n: number; l: string }[] = [
    { n: t.activeStudents, l: "Active" },
    { n: t.totalAttempts, l: "Attempts" },
    { n: t.completedAttempts, l: "Completed" },
    { n: t.totalAssignedContent, l: "Assigned" },
  ];

  return (
    <Screen edges={["bottom"]}>
      <ScreenScroll
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
        {/* Hero — class average gauge + glass stats */}
        <GradientHero variant="ink" style={{ marginBottom: space[6] }}>
          <Text variant="caption" style={{ color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>
            Class performance
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], marginTop: space[2] }}>
            <Gauge value={t.classAverage} size={116} label="CLASS AVG" tone="onHero" />
            <View style={{ flex: 1, gap: space[2] }}>
              <GlassStat label="Median" value={String(Math.round(t.classMedian))} />
              <GlassStat label="Top" value={String(Math.round(t.classTop))} />
              <GlassStat label="Pass rate" value={`${Math.round(t.passRate)}%`} />
            </View>
          </View>
        </GradientHero>

        {/* KPI row */}
        <View style={{ flexDirection: "row", gap: space[2], marginBottom: space[6] }}>
          {kpis.map((k) => (
            <Card key={k.l} style={{ flex: 1, alignItems: "center", paddingVertical: space[3] }}>
              <Text variant="title3">{k.n}</Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                {k.l}
              </Text>
            </Card>
          ))}
        </View>

        {/* Score distribution histogram */}
        <SectionHeader title="Score distribution" />
        <Card style={{ marginBottom: space[6] }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[1], height: 96 }}>
            {data.histogram.map((n, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: Math.max(4, (n / histMax) * 96),
                  backgroundColor: c.accent,
                  borderTopLeftRadius: radius.sm,
                  borderTopRightRadius: radius.sm,
                  opacity: n === 0 ? 0.25 : 1,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space[2] }}>
            {BAND_LABELS.map((l) => (
              <Text key={l} variant="caption" color="textSubtle">
                {l}
              </Text>
            ))}
          </View>
        </Card>

        {/* Topic mastery — weakest first */}
        {topicMastery.length ? (
          <View style={{ marginBottom: space[6] }}>
            <SectionHeader title="Topic mastery" />
            <Card>
              {topicMastery.map((tm, i) => {
                const pct = Math.max(0, Math.min(100, tm.averagePercentage));
                const fill = masteryTone(c, pct);
                return (
                  <View key={`${tm.category}-${i}`} style={{ marginBottom: i === topicMastery.length - 1 ? 0 : space[4] }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space[1] }}>
                      <Text variant="subhead" numberOfLines={1} style={{ flex: 1, marginRight: space[2] }}>
                        {tm.category}
                      </Text>
                      <Text variant="subhead" style={{ fontWeight: "700", color: fill }}>
                        {Math.round(pct)}%
                      </Text>
                    </View>
                    <View style={{ height: 8, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: "hidden" }}>
                      <View
                        style={{ height: 8, width: `${pct}%`, borderRadius: radius.full, backgroundColor: fill }}
                      />
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        ) : null}

        {/* Top performers */}
        {topPerformers.length ? (
          <View style={{ marginBottom: space[6] }}>
            <SectionHeader title="Top performers" />
            <Card padded={false} style={{ paddingHorizontal: space[4] }}>
              {topPerformers.map((p, i) => (
                <PerformerRow
                  key={p.studentId}
                  entry={p}
                  rank={i + 1}
                  first={i === 0}
                  onPress={() => router.push(`/teacher/student/${p.studentId}?classId=${classId}` as Href)}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {/* Needs support — at-risk if present, else bottom performers */}
        {atRisk.length ? (
          <View style={{ marginBottom: space[6] }}>
            <SectionHeader title="Needs support" />
            <Card padded={false} style={{ paddingHorizontal: space[4] }}>
              {atRisk.map((s, i) => {
                const band = s.risk?.band || "low";
                return (
                  <PressableScale
                    key={s.studentId}
                    onPress={() => router.push(`/teacher/student/${s.studentId}?classId=${classId}` as Href)}
                    scaleTo={0.99}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space[3],
                        paddingVertical: space[3],
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: c.border,
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: radius.md,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: riskSubtle(c, band),
                        }}
                      >
                        <Text variant="caption" style={{ fontWeight: "700", color: riskTone(c, band) }}>
                          {initial(s.studentName)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="subhead" numberOfLines={1}>
                          {s.studentName}
                        </Text>
                        <Text variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
                          {s.risk?.reasons?.[0] || "At risk"}
                        </Text>
                      </View>
                      <View
                        style={{
                          paddingHorizontal: space[2],
                          paddingVertical: 2,
                          borderRadius: radius.full,
                          backgroundColor: riskSubtle(c, band),
                        }}
                      >
                        <Text variant="caption" style={{ fontWeight: "700", color: riskTone(c, band), textTransform: "uppercase" }}>
                          {band}
                        </Text>
                      </View>
                    </View>
                  </PressableScale>
                );
              })}
            </Card>
          </View>
        ) : bottomPerformers.length ? (
          <View style={{ marginBottom: space[6] }}>
            <SectionHeader title="Needs support" />
            <Card padded={false} style={{ paddingHorizontal: space[4] }}>
              {bottomPerformers.map((p, i) => (
                <PerformerRow
                  key={p.studentId}
                  entry={p}
                  first={i === 0}
                  low
                  onPress={() => router.push(`/teacher/student/${p.studentId}?classId=${classId}` as Href)}
                />
              ))}
            </Card>
          </View>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

function GlassStat({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "rgba(255,255,255,0.12)",
        borderRadius: radius.md,
        paddingHorizontal: space[3],
        paddingVertical: space[2],
      }}
    >
      <Text variant="caption" style={{ color: "rgba(255,255,255,0.8)" }}>
        {label}
      </Text>
      <Text variant="bodyEm" style={{ color: "#fff" }}>
        {value}
      </Text>
    </View>
  );
}

function PerformerRow({
  entry,
  rank,
  first,
  low,
  onPress,
}: {
  entry: LeaderEntry;
  rank?: number;
  first: boolean;
  low?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const pct = entry.averagePercentage;
  const pctColor = pct == null ? c.textSubtle : low ? c.danger : c.success;
  return (
    <PressableScale onPress={onPress} scaleTo={0.99}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space[3],
          paddingVertical: space[3],
          borderTopWidth: first ? 0 : 1,
          borderTopColor: c.border,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.md,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.surfaceAlt,
          }}
        >
          <Text variant="caption" style={{ fontWeight: "700", color: c.textMuted }}>
            {rank != null ? rank : initial(entry.studentName)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="subhead" numberOfLines={1}>
            {entry.studentName}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
            {entry.completedAttempts} completed
          </Text>
        </View>
        <Text variant="bodyEm" style={{ color: pctColor }}>
          {pct == null ? "—" : `${Math.round(pct)}%`}
        </Text>
        <Icon name="chevron-right" size={18} color="textSubtle" />
      </View>
    </PressableScale>
  );
}
