import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api, type InterviewSessionDetail } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space, type ColorKey } from "@/design/tokens";
import { Card, EmptyState, ErrorState, Icon, ListSkeleton, Screen, ScreenScroll, SectionHeader, Text } from "@/design/ui";
import { Gauge, GradientHero } from "@/design/bold";

const DIMENSION_LABELS: Record<string, string> = {
  communication: "Communication",
  structure: "Structure",
  technical: "Technical articulation",
  pace: "Pace & composure",
  problemSolving: "Problem solving",
};

function readinessWord(v: number): string {
  if (v >= 80) return "Interview-ready";
  if (v >= 65) return "Strong";
  if (v >= 50) return "On track";
  if (v >= 30) return "Building";
  return "Early days";
}

function scoreColor(v: number): ColorKey {
  return v >= 75 ? "success" : v >= 50 ? "warning" : "danger";
}

export default function InterviewScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const [session, setSession] = useState<InterviewSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.interviewSession(String(id));
        setSession(res.session);
      } catch (e: any) {
        setError(e?.message || "Couldn't load this interview.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const card = session?.scorecard;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: "Interview debrief" }} />
      <ScreenScroll>
        {error ? <ErrorState message={error} /> : null}
        {loading ? <ListSkeleton rows={5} /> : null}
        {!loading && session && !card ? (
          <EmptyState icon="file-text" title="No scorecard for this session" body="A scorecard is produced when an interview is completed. This one wasn't finished." />
        ) : null}

        {session && card ? (
          <>
            {/* Debrief hero */}
            <GradientHero variant="signal" style={{ marginBottom: space[4] }}>
              <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>
                Interview debrief
              </Text>
              <Text variant="title3" numberOfLines={2} style={{ color: "#ffffff", marginTop: space[1] }}>
                {session.problemTitle}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], marginTop: space[3] }}>
                <Gauge value={card.readiness} size={116} label="READINESS" tone="onHero" />
                <View style={{ flex: 1 }}>
                  <Text variant="subhead" style={{ color: "#ffffff" }}>{readinessWord(card.readiness)}</Text>
                  <Text
                    variant="footnote"
                    style={{ color: "rgba(255,255,255,0.8)", marginTop: 2, textTransform: "capitalize" }}
                  >
                    {session.interviewType.replace(/_/g, " ")} · {session.difficulty}
                    {session.completedAt ? ` · ${new Date(session.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                  </Text>
                </View>
              </View>
            </GradientHero>

            {/* Correctness + fillers */}
            <Card style={{ marginBottom: space[6], flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Text variant="footnote" color="textMuted">{card.totalCount > 0 ? "Code correctness" : "Answer accuracy"}</Text>
                <Text variant="title2">{card.correctness}%</Text>
                {card.totalCount > 0 ? (
                  <Text variant="caption" color="textSubtle" style={{ marginTop: 2, textTransform: "capitalize" }}>
                    {card.passedCount}/{card.totalCount} tests passed{card.verdict ? ` · ${card.verdict.replace(/_/g, " ")}` : ""}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text variant="footnote" color="textMuted">Filler words</Text>
                <Text variant="title2">{card.fillerWords}</Text>
              </View>
            </Card>

            {/* Dimensions */}
            <SectionHeader title="Skill profile" />
            <Card style={{ gap: space[4], marginBottom: space[6] }}>
              {Object.entries(card.dimensions).map(([key, v]) => (
                <View key={key}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space[1] }}>
                    <Text variant="footnote">{DIMENSION_LABELS[key] ?? key}</Text>
                    <Text variant="footnote" color={v < 50 ? "danger" : "text"} style={{ fontWeight: "700" }}>{v}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: "hidden" }}>
                    <View style={{ height: "100%", borderRadius: radius.full, width: `${Math.max(0, Math.min(100, v))}%`, backgroundColor: c[scoreColor(v)] }} />
                  </View>
                </View>
              ))}
            </Card>

            {/* Coach note */}
            {card.notes ? (
              <Card style={{ marginBottom: space[6], backgroundColor: c.accentSubtle, borderColor: c.accent }}>
                <Text variant="subhead" color="accentText">Coach's note</Text>
                <Text variant="callout" color="textMuted" style={{ marginTop: space[2] }}>{card.notes}</Text>
              </Card>
            ) : null}

            {/* Strengths / improvements */}
            <SectionHeader title="What went well" />
            <Card style={{ gap: space[3], marginBottom: space[6] }}>
              {card.strengths.length ? (
                card.strengths.map((s, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: space[2] }}>
                    <Icon name="check-circle" size={16} color="success" />
                    <Text variant="footnote" color="textMuted" style={{ flex: 1 }}>{s}</Text>
                  </View>
                ))
              ) : (
                <Text variant="footnote" color="textSubtle">—</Text>
              )}
            </Card>
            <SectionHeader title="Work on this next" />
            <Card style={{ gap: space[3] }}>
              {card.improvements.length ? (
                card.improvements.map((s, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: space[2] }}>
                    <Icon name="trending-up" size={16} color="warning" />
                    <Text variant="footnote" color="textMuted" style={{ flex: 1 }}>{s}</Text>
                  </View>
                ))
              ) : (
                <Text variant="footnote" color="textSubtle">—</Text>
              )}
            </Card>
          </>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}
