import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { api, type ClassOverview } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Card,
  ErrorState,
  Icon,
  type IconName,
  ListSkeleton,
  PressableScale,
  Screen,
  ScreenScroll,
  SectionHeader,
  Text,
} from "@/design/ui";
import { GradientHero } from "@/design/bold";

const NAV: { key: string; icon: IconName; label: string; sub: string; path: string }[] = [
  { key: "students", icon: "users", label: "Students", sub: "Roster, progress & at-risk", path: "students" },
  { key: "analytics", icon: "bar-chart-2", label: "Analytics", sub: "Scores, mastery & trends", path: "analytics" },
  { key: "announce", icon: "volume-2", label: "Announce", sub: "Post & moderate the class", path: "announce" },
  { key: "content", icon: "layers", label: "Content", sub: "What's assigned to this class", path: "content" },
];

export default function TeacherClassHub() {
  const c = useColors();
  const router = useRouter();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const [ov, setOv] = useState<ClassOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) return;
    setError(null);
    try {
      setOv(await api.classOverview(String(classId)));
    } catch (e: any) {
      setError(e?.message || "Couldn't load this class.");
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
        <ListSkeleton rows={5} />
      </Screen>
    );
  }
  if (error || !ov) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorState message={error || "Class not found."} onRetry={load} />
      </Screen>
    );
  }

  const ins = ov.insights;
  const needs = ov.needsAttention || [];

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
        <GradientHero variant="signal" style={{ marginBottom: space[6], paddingVertical: space[5] }}>
          <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>
            Section
          </Text>
          <Text variant="title2" style={{ color: "#fff", marginTop: 2 }} numberOfLines={2}>
            {ov.class.name}
          </Text>
          <View style={{ flexDirection: "row", gap: space[2], marginTop: space[4] }}>
            {[
              [`${ins.activeStudents}`, "ACTIVE"],
              [`${Math.round(ins.classAverage)}%`, "AVG"],
              [`${Math.round(ins.passRate)}%`, "PASS"],
              [`${ins.atRiskCount}`, "AT RISK"],
            ].map(([n, l]) => (
              <View
                key={l}
                style={{
                  flex: 1,
                  backgroundColor: "rgba(255,255,255,0.16)",
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

        <View style={{ gap: space[2], marginBottom: space[6] }}>
          {NAV.map((n) => (
            <PressableScale key={n.key} onPress={() => router.push(`/teacher/class/${classId}/${n.path}` as Href)} scaleTo={0.99}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: c.surfaceAlt,
                  }}
                >
                  <Icon name={n.icon} size={20} color="accentText" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="subhead">{n.label}</Text>
                  <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                    {n.sub}
                  </Text>
                </View>
                <Icon name="chevron-right" size={20} color="textSubtle" />
              </Card>
            </PressableScale>
          ))}
        </View>

        {needs.length ? (
          <>
            <SectionHeader
              title="Needs attention"
              action={
                <Text variant="footnote" color="accentText" onPress={() => router.push(`/teacher/class/${classId}/students` as Href)}>
                  All students
                </Text>
              }
            />
            <View style={{ gap: space[2] }}>
              {needs.slice(0, 4).map((s) => (
                <PressableScale
                  key={s.studentId}
                  onPress={() => router.push(`/teacher/student/${s.studentId}?classId=${classId}` as Href)}
                  scaleTo={0.99}
                >
                  <Card style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: radius.md,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: c.dangerSubtle,
                      }}
                    >
                      <Text variant="caption" style={{ color: c.danger, fontWeight: "700" }}>
                        {(s.studentName || "?").trim()[0]?.toUpperCase() || "?"}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="subhead" numberOfLines={1}>
                        {s.studentName}
                      </Text>
                      <Text variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
                        {s.risk.reasons?.[0] || "At risk"}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={18} color="textSubtle" />
                  </Card>
                </PressableScale>
              ))}
            </View>
          </>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}
