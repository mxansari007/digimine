import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, type TestAttempt, type TestSectionResult } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Button,
  Card,
  ErrorState,
  ListSkeleton,
  Screen,
  ScreenScroll,
  SectionHeader,
  Text,
} from "@/design/ui";
import { Gauge } from "@/design/bold";

const fmtDuration = (a: TestAttempt) => {
  const start = a.startedAt ? new Date(a.startedAt).getTime() : null;
  const end = a.completedAt ? new Date(a.completedAt).getTime() : null;
  if (start == null || end == null || end < start) return "—";
  const secs = Math.round((end - start) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const bandLabel = (pct: number) =>
  pct >= 80 ? "READY" : pct >= 60 ? "STRONG" : pct >= 40 ? "ON TRACK" : "BUILDING";

export default function TestScorecardScreen() {
  const c = useColors();
  const router = useRouter();
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!attemptId) return;
    setError(null);
    try {
      const res = await api.testAttempt(String(attemptId));
      setAttempt(res.attempt);
    } catch (e: any) {
      setError(e?.message || "Couldn't load this result.");
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

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
  if (error || !attempt) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorState message={error || "Result not found."} onRetry={load} />
      </Screen>
    );
  }

  const max = attempt.maxPossibleScore ?? 0;
  const score = attempt.totalScore ?? 0;
  const pct = attempt.percentage ?? (max > 0 ? (score / max) * 100 : 0);
  const correct = attempt.correctAnswers ?? 0;
  const wrong = attempt.wrongAnswers ?? 0;
  const skipped = attempt.unattempted ?? 0;
  const accuracy = correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
  const passed = attempt.passed;
  const sections = attempt.sectionResults || [];
  const answers = attempt.answers || [];

  const stats: { n: string; l: string; tone?: "good" | "bad" }[] = [
    { n: String(correct), l: "Correct", tone: "good" },
    { n: String(wrong), l: "Wrong", tone: "bad" },
    { n: String(skipped), l: "Skipped" },
    { n: fmtDuration(attempt), l: "Time" },
  ];

  return (
    <Screen edges={["bottom"]}>
      <ScreenScroll>
        {attempt.title ? (
          <Text variant="footnote" color="textSubtle" style={{ marginBottom: space[4] }}>
            {attempt.title}
          </Text>
        ) : null}

        {/* Gauge + verdict */}
        <View style={{ alignItems: "center", marginBottom: space[2] }}>
          <Gauge value={pct} size={200} label={`/100 · ${bandLabel(pct)}`} />
        </View>
        <View style={{ alignItems: "center", gap: space[2], marginBottom: space[6] }}>
          <View
            style={{
              alignSelf: "center",
              paddingHorizontal: space[4],
              paddingVertical: space[1],
              borderRadius: radius.full,
              backgroundColor: passed ? c.successSubtle : c.dangerSubtle,
            }}
          >
            <Text variant="subhead" style={{ color: passed ? c.success : c.danger, fontWeight: "700" }}>
              {passed ? "Passed" : "Not passed"}
            </Text>
          </View>
          <Text variant="footnote" color="textMuted">
            Scored {score} / {max} marks
          </Text>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: "row", gap: space[2], marginBottom: space[3] }}>
          {stats.map((s) => (
            <Card key={s.l} style={{ flex: 1, alignItems: "center", paddingVertical: space[3] }}>
              <Text
                variant="title3"
                style={{ color: s.tone === "good" ? c.success : s.tone === "bad" ? c.danger : c.text }}
              >
                {s.n}
              </Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                {s.l}
              </Text>
            </Card>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: space[2], marginBottom: space[6] }}>
          <Pill label={`Accuracy ${accuracy}%`} />
          {typeof passed === "boolean" ? <Pill label={passed ? "Cleared cutoffs" : "Below cutoff"} /> : null}
        </View>

        {/* Sections */}
        {sections.length ? (
          <View style={{ marginBottom: space[6] }}>
            <SectionHeader title="Sections" />
            {sections.map((s, i) => (
              <SectionBar key={`${s.title}-${i}`} s={s} />
            ))}
          </View>
        ) : null}

        {/* Question review grid */}
        {answers.length ? (
          <View style={{ marginBottom: space[6] }}>
            <SectionHeader title={`Question review · ${answers.length}`} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
              {answers.map((a, i) => {
                const status = a.isCorrect
                  ? "ok"
                  : a.selectedOptionId && a.selectedOptionId.trim()
                    ? "no"
                    : "skip";
                const bg = status === "ok" ? c.successSubtle : status === "no" ? c.dangerSubtle : c.surfaceAlt;
                const fg = status === "ok" ? c.success : status === "no" ? c.danger : c.textSubtle;
                return (
                  <View
                    key={a.questionId || i}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radius.sm,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: bg,
                    }}
                  >
                    <Text variant="caption" style={{ color: fg, fontWeight: "700" }}>
                      {i + 1}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <Button label="Done" variant="secondary" fullWidth onPress={() => router.back()} />
      </ScreenScroll>
    </Screen>
  );
}

function Pill({ label }: { label: string }) {
  const c = useColors();
  return (
    <View
      style={{
        paddingHorizontal: space[3],
        paddingVertical: space[1],
        borderRadius: radius.full,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <Text variant="caption" color="textMuted" style={{ fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
}

function SectionBar({ s }: { s: TestSectionResult }) {
  const c = useColors();
  const pct = s.maxScore > 0 ? Math.min(100, (s.score / s.maxScore) * 100) : 0;
  const cut = s.cutoffMarks != null && s.maxScore > 0 ? Math.min(100, (s.cutoffMarks / s.maxScore) * 100) : null;
  const miss = s.passed === false;
  return (
    <View style={{ marginBottom: space[4] }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space[1] }}>
        <Text variant="subhead">{s.title}</Text>
        <Text variant="subhead" style={{ fontWeight: "700", color: miss ? c.danger : c.text }}>
          {Math.round(pct)}%
        </Text>
      </View>
      <View style={{ position: "relative" }}>
        <View style={{ height: 8, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: "hidden" }}>
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${pct}%`,
              borderRadius: radius.full,
              backgroundColor: miss ? c.danger : c.accent,
            }}
          />
        </View>
        {cut != null ? (
          <View
            style={{ position: "absolute", top: -2, bottom: -2, left: `${cut}%`, width: 2, backgroundColor: c.text }}
          />
        ) : null}
      </View>
    </View>
  );
}
