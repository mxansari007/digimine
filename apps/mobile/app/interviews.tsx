import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { api, type InterviewSessionSummary } from "@/lib/api";
import { useColors } from "@/design/theme";
import { space, type ColorKey } from "@/design/tokens";
import { Card, Chip, EmptyState, ErrorState, ListItem, ListSkeleton, Screen, Text } from "@/design/ui";
import { Gauge, GradientHero } from "@/design/bold";

type Tone = React.ComponentProps<typeof Chip>["tone"];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  completed: { label: "Completed", tone: "success" },
  scheduled: { label: "Scheduled", tone: "accent" },
  in_progress: { label: "Live", tone: "warning" },
  abandoned: { label: "Abandoned", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Missed", tone: "neutral" },
};

function readinessColor(v: number): ColorKey {
  return v >= 75 ? "success" : v >= 50 ? "warning" : "danger";
}

export default function InterviewsScreen() {
  const router = useRouter();
  const c = useColors();
  const [items, setItems] = useState<InterviewSessionSummary[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.interviewSessions();
      setItems(res.items || []);
      setAvg(typeof res.readiness?.avgReadiness === "number" ? res.readiness.avgReadiness : null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your interviews.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen edges={[]}>
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[16] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.textSubtle} />}
        ListHeaderComponent={
          <View style={{ gap: space[4], marginBottom: space[5] }}>
            <GradientHero variant="signal" style={{ alignItems: "center", paddingVertical: space[6] }}>
              <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>
                Interview readiness
              </Text>
              <View style={{ marginTop: space[2] }}>
                <Gauge value={avg ?? 0} size={150} label={avg != null ? "AVG / 100" : "NO DATA"} tone="onHero" />
              </View>
              <Text
                variant="footnote"
                align="center"
                style={{ color: "rgba(255,255,255,0.85)", marginTop: space[1], maxWidth: 260 }}
              >
                Average across your completed AI mock interviews
              </Text>
            </GradientHero>
            <Card>
              <Text variant="subhead">Live interviews run on the web</Text>
              <Text variant="footnote" color="textMuted" style={{ marginTop: space[1] }}>
                The interview room needs your mic and the code editor — open PlacementRanker in a browser to schedule or join. Your scorecards show up here.
              </Text>
            </Card>
            {error ? <ErrorState message={error} onRetry={load} /> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? <ListSkeleton rows={3} /> : <EmptyState icon="mic" title="No interviews yet" body="Run your first AI mock interview on the website — every attempt and scorecard appears here." />
        }
        renderItem={({ item }) => {
          const st = STATUS[item.status] ?? STATUS.expired;
          const when = item.completedAt || item.scheduledAt || item.startedAt;
          return (
            <ListItem
              title={item.problemTitle}
              subtitle={`${item.interviewType.replace(/_/g, " ")} · ${item.difficulty}${when ? ` · ${new Date(when).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}`}
              onPress={item.status === "completed" ? () => router.push(`/interview/${item.id}`) : undefined}
              trailing={
                item.readiness != null ? (
                  <View style={{ alignItems: "center" }}>
                    <Text variant="title3" color={readinessColor(item.readiness)}>{item.readiness}</Text>
                    <Text variant="caption" color="textSubtle">readiness</Text>
                  </View>
                ) : (
                  <Chip label={st.label} tone={st.tone} />
                )
              }
            />
          );
        }}
      />
    </Screen>
  );
}
