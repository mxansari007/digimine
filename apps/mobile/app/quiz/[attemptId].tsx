import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, type QuestionResult, type QuizAttempt, type QuizQuestion, type QuizSubmitResult } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space, type as typeScale } from "@/design/tokens";
import { Button, Card, Chip, Icon, PressableScale, Text } from "@/design/ui";
import { Gauge, GradientHero } from "@/design/bold";

type Phase = "loading" | "attempt" | "result" | "error";

export default function QuizAttemptScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const router = useRouter();
  const c = useColors();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [, setAttempt] = useState<QuizAttempt | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const answersRef = useRef(answers);
  const submittingRef = useRef(false);
  const phaseRef = useRef<Phase>("loading");
  useEffect(() => {
    answersRef.current = answers;
    phaseRef.current = phase;
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getQuizAttempt(String(attemptId));
        setAttempt(res.attempt);
        setQuestions(res.questions || []);
        if (res.attempt.status === "in_progress") {
          const initial: Record<string, string> = {};
          for (const a of res.attempt.answers || []) if (a.answer) initial[a.questionId] = a.answer;
          setAnswers(initial);
          setIndex(Math.min(res.attempt.currentQuestionIndex || 0, Math.max(0, (res.questions || []).length - 1)));
          const rem = typeof res.attempt.remainingTime === "number" ? res.attempt.remainingTime : res.attempt.endTime ? Math.floor((Date.parse(res.attempt.endTime) - Date.now()) / 1000) : null;
          setRemaining(rem != null ? Math.max(0, rem) : null);
          setPhase("attempt");
        } else {
          setResult({
            score: res.attempt.totalScore,
            maxScore: res.attempt.maxPossibleScore,
            percentage: res.attempt.percentage,
            correct: res.attempt.correctAnswers,
            wrong: res.attempt.wrongAnswers,
            skipped: res.attempt.skipped,
            totalQuestions: (res.attempt.questionResults || []).length,
            passed: res.attempt.passed ?? null,
            passingPercentage: res.attempt.passingPercentage ?? 0,
            questionResults: res.attempt.questionResults || [],
          });
          setPhase("result");
        }
      } catch (e: any) {
        setErrorMsg(e?.message || "Couldn't load this attempt.");
        setPhase("error");
      }
    })();
  }, [attemptId]);

  const toAnswerArray = useCallback((map: Record<string, string>) => Object.entries(map).map(([questionId, answer]) => ({ questionId, answer })), []);

  const submit = useCallback(
    async (finalStatus: "completed" | "timed_out" = "completed") => {
      if (submittingRef.current || phaseRef.current !== "attempt") return;
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const res = await api.submitQuizAttempt(String(attemptId), { finalStatus, answers: toAnswerArray(answersRef.current) });
        setAttempt(res.attempt);
        setResult(res.result);
        setPhase("result");
      } catch (e: any) {
        submittingRef.current = false;
        setSubmitting(false);
        Alert.alert("Submit failed", e?.message || "Check your connection and try again.");
      }
    },
    [attemptId, toAnswerArray]
  );

  useEffect(() => {
    if (phase !== "attempt" || remaining == null) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r == null) return r;
        if (r <= 1) {
          clearInterval(id);
          submit("timed_out");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const select = (questionId: string, answer: string) => {
    setAnswers((m) => ({ ...m, [questionId]: answer }));
    api.saveQuizProgress(String(attemptId), { answers: [{ questionId, answer }], currentQuestionIndex: index, ...(remaining != null ? { remainingTime: remaining } : {}) }).catch(() => {});
  };

  const confirmSubmit = () => {
    const unanswered = questions.filter((q) => !answers[q.id]?.trim()).length;
    Alert.alert("Submit quiz?", unanswered > 0 ? `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered.` : "All questions answered.", [
      { text: "Keep going", style: "cancel" },
      { text: "Submit", style: "destructive", onPress: () => submit("completed") },
    ]);
  };

  if (phase === "loading") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.accent} />
      </SafeAreaView>
    );
  }

  if (phase === "error") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: space[5], justifyContent: "center", gap: space[4] }}>
        <Text variant="body" color="danger" align="center">{errorMsg}</Text>
        <Button label="Go back" variant="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  if (phase === "result" && result) {
    return <ResultView result={result} questions={questions} onDone={() => router.back()} />;
  }

  const q = questions[index];
  if (!q) return null;
  const total = questions.length;
  const answered = questions.filter((x) => answers[x.id]?.trim()).length;
  const mm = remaining != null ? Math.floor(remaining / 60) : null;
  const ss = remaining != null ? remaining % 60 : null;
  const low = remaining != null && remaining < 60;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "bottom"]}>
      {/* Header: progress + timer */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderBottomWidth: 0.5, borderBottomColor: c.border }}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="textMuted">Question {index + 1} of {total}</Text>
          <View style={{ height: 5, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: "hidden", marginTop: space[1] }}>
            <View style={{ height: "100%", borderRadius: radius.full, width: `${((index + 1) / total) * 100}%`, backgroundColor: c.accent }} />
          </View>
        </View>
        {remaining != null ? (
          <View style={{ borderRadius: radius.full, backgroundColor: low ? c.dangerSubtle : c.surfaceAlt, paddingHorizontal: space[3], paddingVertical: space[1] }}>
            <Text style={{ fontWeight: "700", fontSize: 14, color: low ? c.danger : c.text, fontVariant: ["tabular-nums"] }}>
              {mm}:{String(ss).padStart(2, "0")}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], paddingBottom: space[8] }}>
        {q.passage ? (
          <Card style={{ marginBottom: space[3] }}>
            <Text variant="footnote" color="textMuted">{q.passage}</Text>
          </Card>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[3] }}>
          <Text variant="title3" style={{ flex: 1 }}>{q.questionText}</Text>
          <Chip label={`${q.marks} mark${q.marks === 1 ? "" : "s"}`} />
        </View>

        {q.type === "mcq" && q.options ? (
          <View style={{ gap: space[3], marginTop: space[5] }}>
            {q.options.map((o, i) => {
              const selected = answers[q.id] === o.id;
              return (
                <PressableScale
                  key={o.id}
                  onPress={() => select(q.id, o.id)}
                  scaleTo={0.99}
                  style={{ flexDirection: "row", alignItems: "center", gap: space[3], backgroundColor: selected ? c.accentSubtle : c.surface, borderWidth: 1.5, borderColor: selected ? c.accent : c.border, borderRadius: radius.lg, padding: space[4] }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? c.accent : c.borderStrong, alignItems: "center", justifyContent: "center" }}>
                    {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /> : null}
                  </View>
                  <Text variant="callout" style={{ flex: 1, fontWeight: selected ? "600" : "400", color: selected ? c.text : c.textMuted }}>
                    {String.fromCharCode(65 + i)}.  {o.text}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        ) : (
          <TextInput
            value={answers[q.id] ?? ""}
            onChangeText={(t) => setAnswers((m) => ({ ...m, [q.id]: t }))}
            onEndEditing={() => {
              const v = answers[q.id];
              if (v != null) select(q.id, v);
            }}
            placeholder="Type your answer…"
            placeholderTextColor={c.textSubtle}
            multiline
            style={{ marginTop: space[5], minHeight: 100, textAlignVertical: "top", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: space[4], fontSize: typeScale.callout.fontSize, color: c.text }}
          />
        )}
      </ScrollView>

      {/* Footer */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3], padding: space[4], borderTopWidth: 0.5, borderTopColor: c.border }}>
        <Button label="Previous" variant="secondary" size="compact" disabled={index === 0} onPress={() => setIndex((i) => Math.max(0, i - 1))} />
        <Text variant="caption" color="textSubtle">{answered}/{total} answered</Text>
        {index < total - 1 ? (
          <Button label="Next" size="compact" onPress={() => setIndex((i) => Math.min(total - 1, i + 1))} />
        ) : (
          <Button label={submitting ? "Submitting…" : "Submit"} size="compact" loading={submitting} onPress={confirmSubmit} />
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Result view ──────────────────────────────────────────────────────────────

function ResultView({ result, questions, onDone }: { result: QuizSubmitResult; questions: QuizQuestion[]; onDone: () => void }) {
  const c = useColors();
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const optionText = (qid: string, optId?: string | null) => (!optId ? null : byId.get(qid)?.options?.find((o) => o.id === optId)?.text ?? null);
  const pct = Math.round(result.percentage);
  type Tone = React.ComponentProps<typeof Chip>["tone"];
  const statusTone: Record<QuestionResult["status"], { label: string; tone: Tone }> = {
    correct: { label: "Correct", tone: "success" },
    wrong: { label: "Wrong", tone: "danger" },
    skipped: { label: "Skipped", tone: "neutral" },
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: space[8] }}>
        {/* Score hero */}
        <GradientHero variant="signal" style={{ alignItems: "center", gap: space[2], paddingVertical: space[6], marginBottom: space[4] }}>
          <Gauge
            value={pct}
            size={150}
            label={result.passed == null ? "SCORE" : result.passed ? "PASSED" : "BELOW PASS"}
            tone="onHero"
          />
          {result.passed != null ? (
            <Chip label={result.passed ? "Passed" : `Below ${result.passingPercentage}% to pass`} tone={result.passed ? "success" : "danger"} />
          ) : null}
          <Text variant="callout" style={{ color: "rgba(255,255,255,0.9)" }}>{result.score} / {result.maxScore} marks</Text>
          <View style={{ flexDirection: "row", gap: space[2], marginTop: space[1] }}>
            <Chip label={`${result.correct} correct`} tone="success" />
            <Chip label={`${result.wrong} wrong`} tone="danger" />
            <Chip label={`${result.skipped} skipped`} tone="neutral" />
          </View>
        </GradientHero>

        <Text variant="title3" style={{ marginBottom: space[3] }}>Review</Text>
        {result.questionResults.map((r, i) => {
          const q = byId.get(r.questionId);
          const st = statusTone[r.status] ?? statusTone.skipped;
          const yours = optionText(r.questionId, r.selectedAnswer) ?? (r.selectedAnswer || null);
          const correct = r.correctAnswer ?? (r.correctOptionIds && r.correctOptionIds.length ? optionText(r.questionId, r.correctOptionIds[0]) : null);
          return (
            <Card key={r.questionId} style={{ marginBottom: space[3], gap: space[2] }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                <Text variant="footnote" style={{ fontWeight: "700" }}>Q{i + 1}</Text>
                <Chip label={st.label} tone={st.tone} />
                <Text variant="footnote" color="textMuted" style={{ marginLeft: "auto", fontWeight: "700" }}>
                  {r.earnedMarks >= 0 ? "+" : ""}{r.earnedMarks}
                </Text>
              </View>
              {q?.questionText ? <Text variant="callout" style={{ fontWeight: "600" }}>{q.questionText}</Text> : null}
              {r.status !== "skipped" && yours ? (
                <Text variant="footnote" color="textMuted">
                  Your answer: <Text variant="footnote" color={st.tone === "success" ? "success" : st.tone === "danger" ? "danger" : "textMuted"} style={{ fontWeight: "700" }}>{yours}</Text>
                </Text>
              ) : null}
              {r.status !== "correct" && correct ? (
                <Text variant="footnote" color="textMuted">
                  Correct answer: <Text variant="footnote" color="success" style={{ fontWeight: "700" }}>{correct}</Text>
                </Text>
              ) : null}
              {r.explanation ? (
                <View style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space[3] }}>
                  <Text variant="footnote" color="textMuted">{r.explanation}</Text>
                </View>
              ) : null}
            </Card>
          );
        })}

        <Button label="Done" onPress={onDone} style={{ marginTop: space[3] }} />
      </ScrollView>
    </SafeAreaView>
  );
}
