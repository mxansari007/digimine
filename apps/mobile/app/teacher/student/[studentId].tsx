import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api, type OverviewStudent, type WeakTopic } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Card,
  ErrorState,
  Icon,
  ListSkeleton,
  Screen,
  ScreenScroll,
  SectionHeader,
  Text,
} from "@/design/ui";
import { Gauge } from "@/design/bold";

/** Relative "Nd ago" / "Nh ago" from an ISO timestamp. */
const relTime = (iso: string | null): string => {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

type Band = "low" | "medium" | "high";
const normBand = (b: string): Band => (b === "low" || b === "high" ? b : "medium");

export default function TeacherStudentDetail() {
  const c = useColors();
  const { studentId, classId } = useLocalSearchParams<{ studentId: string; classId: string }>();
  const [student, setStudent] = useState<OverviewStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!classId || !studentId) return;
    setError(null);
    try {
      const ov = await api.classOverview(String(classId));
      const found = ov.students.find((s) => s.studentId === studentId) ?? null;
      setStudent(found);
      setNotFound(found == null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load this student.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [classId, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!classId || !studentId) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorState message="Missing student or class reference." />
      </Screen>
    );
  }
  if (loading) {
    return (
      <Screen edges={["bottom"]}>
        <ListSkeleton rows={6} />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }
  if (notFound || !student) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorState message="Student not found in this class." onRetry={load} />
      </Screen>
    );
  }

  const { stats, risk } = student;
  const band = normBand(risk.band);
  const bandBg = band === "low" ? c.successSubtle : band === "high" ? c.dangerSubtle : c.warningSubtle;
  const bandFg = band === "low" ? c.success : band === "high" ? c.danger : c.warning;
  const bandLabel = band === "low" ? "LOW RISK" : band === "high" ? "HIGH RISK" : "MEDIUM RISK";

  const initial = (student.studentName || "?").trim()[0]?.toUpperCase() || "?";
  const isActive = !student.isPending && student.status !== "pending";
  const avg = stats.averagePercentage;
  const best = stats.bestPercentage;

  const metaParts = [student.studentEmail, student.rollNumber ? `Roll ${student.rollNumber}` : null].filter(
    Boolean,
  ) as string[];

  const statCells: { n: string; l: string }[] = [
    { n: String(stats.totalAttempts), l: "Attempts" },
    { n: String(stats.completedAttempts), l: "Completed" },
    { n: `${Math.round(stats.coveragePercent)}%`, l: "Coverage" },
    { n: best != null ? `${Math.round(best)}%` : "—", l: "Best" },
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
        {/* Identity */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[3], marginBottom: space[6] }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: radius.lg,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.accentSubtle,
            }}
          >
            <Text variant="title3" style={{ color: c.accentText, fontWeight: "700" }}>
              {initial}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title3" numberOfLines={2}>
              {student.studentName}
            </Text>
            {metaParts.length ? (
              <Text variant="footnote" color="textMuted" style={{ marginTop: 2 }}>
                {metaParts.join(" · ")}
              </Text>
            ) : null}
            <View
              style={{
                alignSelf: "flex-start",
                marginTop: space[2],
                paddingHorizontal: space[2],
                paddingVertical: space[1],
                borderRadius: radius.full,
                backgroundColor: isActive ? c.successSubtle : c.warningSubtle,
              }}
            >
              <Text variant="caption" style={{ color: isActive ? c.success : c.warning, fontWeight: "700" }}>
                {isActive ? "Active" : "Pending"}
              </Text>
            </View>
          </View>
        </View>

        {/* Focal score */}
        {avg != null ? (
          <View style={{ alignItems: "center", marginBottom: space[6] }}>
            <Gauge value={avg} size={200} label="CLASS AVG SCORE" />
          </View>
        ) : (
          <Card style={{ alignItems: "center", paddingVertical: space[6], marginBottom: space[6] }}>
            <Icon name="bar-chart-2" size={28} color="textSubtle" />
            <Text variant="title3" align="center" style={{ marginTop: space[3] }}>
              No graded work yet
            </Text>
            <Text variant="footnote" color="textMuted" align="center" style={{ marginTop: space[1] }}>
              This student has no completed attempts to score.
            </Text>
          </Card>
        )}

        {/* Risk */}
        <Card style={{ backgroundColor: bandBg, borderColor: bandBg, marginBottom: space[6] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <Icon name={band === "low" ? "check" : "alert-triangle"} size={18} tint={bandFg} />
            <Text variant="subhead" style={{ color: bandFg, fontWeight: "700" }}>
              {bandLabel} · {Math.round(risk.score)}
            </Text>
          </View>
          {risk.reasons.length ? (
            <View style={{ marginTop: space[3], gap: space[2] }}>
              {risk.reasons.map((reason, i) => (
                <View key={`${i}-${reason}`} style={{ flexDirection: "row", gap: space[2] }}>
                  <View
                    style={{ width: 5, height: 5, borderRadius: radius.full, backgroundColor: bandFg, marginTop: 7 }}
                  />
                  <Text variant="footnote" color="text" style={{ flex: 1 }}>
                    {reason}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        {/* Stats grid */}
        <View style={{ flexDirection: "row", gap: space[2], marginBottom: space[6] }}>
          {statCells.map((s) => (
            <Card key={s.l} style={{ flex: 1, alignItems: "center", paddingVertical: space[3] }}>
              <Text variant="title3">{s.n}</Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: 2 }} numberOfLines={1}>
                {s.l}
              </Text>
            </Card>
          ))}
        </View>

        {/* Recent activity */}
        <SectionHeader title="Recent activity" />
        <Card style={{ marginBottom: space[6] }}>
          <Text variant="footnote" color="textMuted">
            Last active {relTime(stats.lastActiveAt)}
          </Text>
          <Sparkbars data={student.sparkline} />
        </Card>

        {/* Weak topics */}
        {student.weakTopics.length ? (
          <View style={{ marginBottom: space[6] }}>
            <SectionHeader title="Weak topics" />
            {student.weakTopics.map((t, i) => (
              <TopicBar key={`${t.category}-${i}`} topic={t} />
            ))}
          </View>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

/** Inline bar chart of recent daily activity counts. */
function Sparkbars({ data }: { data: number[] }) {
  const c = useColors();
  if (!data.length) {
    return (
      <Text variant="footnote" color="textSubtle" style={{ marginTop: space[3] }}>
        No recent activity.
      </Text>
    );
  }
  const max = Math.max(...data, 1);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 56, marginTop: space[3] }}>
      {data.map((v, i) => {
        const ratio = Math.max(0, v) / max;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: Math.max(3, ratio * 56),
              borderRadius: radius.sm,
              backgroundColor: v > 0 ? c.accent : c.surfaceAlt,
            }}
          />
        );
      })}
    </View>
  );
}

/** Labeled mastery bar for a weak topic (danger when low, accent otherwise). */
function TopicBar({ topic }: { topic: WeakTopic }) {
  const c = useColors();
  const pct = Math.max(0, Math.min(100, topic.avgPercentage));
  const low = pct < 40;
  const fill = low ? c.danger : c.accent;
  return (
    <View style={{ marginBottom: space[4] }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space[1] }}>
        <Text variant="subhead" numberOfLines={1} style={{ flex: 1, marginRight: space[2] }}>
          {topic.category}
        </Text>
        <Text variant="subhead" style={{ fontWeight: "700", color: low ? c.danger : c.text }}>
          {Math.round(pct)}%
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: "hidden" }}>
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            borderRadius: radius.full,
            backgroundColor: fill,
          }}
        />
      </View>
    </View>
  );
}
