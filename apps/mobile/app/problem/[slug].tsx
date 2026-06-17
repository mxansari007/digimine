import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api, type ProblemDetail, type ProblemProgress } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import { Button, Card, Chip, ErrorState, ListSkeleton, Screen, ScreenScroll, SectionHeader, Text } from "@/design/ui";
import { HtmlView } from "@/components/HtmlView";

type Tone = React.ComponentProps<typeof Chip>["tone"];
function diffTone(d: string): Tone {
  return d === "easy" ? "success" : d === "medium" ? "warning" : d === "hard" ? "danger" : "neutral";
}
const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export default function ProblemScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const c = useColors();
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [progress, setProgress] = useState<ProblemProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shownHints, setShownHints] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.problemDetail(String(slug));
      setProblem(res.problem);
      setProgress(res.progress);
    } catch (e: any) {
      setError(e?.message || "Couldn't load this problem.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: problem?.title || "Problem" }} />
      <ScreenScroll>
        {error ? <ErrorState message={error} onRetry={load} /> : null}
        {loading ? <ListSkeleton rows={6} /> : null}
        {problem ? (
          <>
            <Text variant="title2">
              {problem.problemNumber != null ? `${problem.problemNumber}. ` : ""}
              {problem.title}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[3] }}>
              <Chip label={problem.difficulty} tone={diffTone(problem.difficulty)} />
              <Chip label={problem.primaryPattern.replace(/-/g, " ")} tone="accent" />
              <Chip label={problem.kind.toUpperCase()} />
              {progress?.status === "solved" ? <Chip label="Solved ✓" tone="success" /> : progress?.status === "attempted" ? <Chip label="Attempted" tone="warning" /> : null}
            </View>

            {problem.locked ? (
              <Card style={{ marginTop: space[4], backgroundColor: c.warningSubtle, borderColor: c.warning }}>
                <Text variant="subhead" color="warning">Premium problem</Text>
                <Text variant="footnote" color="textMuted" style={{ marginTop: space[1] }}>
                  Upgrade your plan on the website to read the full statement and solve it.
                </Text>
              </Card>
            ) : null}

            <View style={{ marginTop: space[5] }}>
              <HtmlView html={problem.statementHtml} />
            </View>

            {problem.samples && problem.samples.length > 0 ? (
              <>
                <SectionHeader title="Examples" />
                {problem.samples.map((s, i) => (
                  <Card key={i} style={{ marginBottom: space[3], gap: space[2] }}>
                    <Text variant="caption" color="textSubtle" style={{ textTransform: "uppercase" }}>Input</Text>
                    <Text style={{ fontFamily: mono, fontSize: 13, color: c.text, backgroundColor: c.surfaceAlt, borderRadius: radius.sm, padding: space[3] }}>{s.input}</Text>
                    <Text variant="caption" color="textSubtle" style={{ textTransform: "uppercase" }}>Output</Text>
                    <Text style={{ fontFamily: mono, fontSize: 13, color: c.text, backgroundColor: c.surfaceAlt, borderRadius: radius.sm, padding: space[3] }}>{s.expectedOutput}</Text>
                    {s.explanation ? <Text variant="footnote" color="textMuted">{s.explanation}</Text> : null}
                  </Card>
                ))}
              </>
            ) : null}

            {problem.constraintsHtml ? (
              <>
                <SectionHeader title="Constraints" />
                <HtmlView html={problem.constraintsHtml} />
              </>
            ) : null}

            {problem.sql?.schemaSql ? (
              <>
                <SectionHeader title="Schema" />
                <View style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space[3] }}>
                  <Text style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 18, color: c.textMuted }}>{problem.sql.schemaSql}</Text>
                </View>
              </>
            ) : null}

            {problem.hints && problem.hints.length > 0 ? (
              <>
                <SectionHeader title="Hints" />
                {problem.hints.slice(0, shownHints).map((h, i) => (
                  <Card key={i} style={{ marginBottom: space[3] }}>
                    <Text variant="footnote" color="textMuted">
                      <Text style={{ fontWeight: "700", color: c.text }}>Hint {i + 1}: </Text>
                      {h}
                    </Text>
                  </Card>
                ))}
                {shownHints < problem.hints.length ? (
                  <Button label={`Reveal hint ${shownHints + 1} of ${problem.hints.length}`} variant="secondary" onPress={() => setShownHints((n) => n + 1)} />
                ) : null}
              </>
            ) : null}

            {problem.editorialLocked ? (
              <>
                <SectionHeader title="Solution" />
                <Card style={{ backgroundColor: c.warningSubtle, borderColor: c.warning }}>
                  <Text variant="subhead" color="warning">Premium solution</Text>
                  <Text variant="footnote" color="textMuted" style={{ marginTop: space[1] }}>
                    Upgrade your plan on the website to read the full editorial solution.
                  </Text>
                </Card>
              </>
            ) : problem.editorialHtml ? (
              <>
                <SectionHeader title="Solution" />
                {showSolution ? (
                  <Card>
                    <HtmlView html={problem.editorialHtml} />
                  </Card>
                ) : (
                  <Card style={{ gap: space[2] }}>
                    <Text variant="footnote" color="textMuted">
                      Hidden so you can try it yourself first — reveal the full solution when you&apos;re ready to review.
                    </Text>
                    <Button label="Reveal solution" variant="secondary" onPress={() => setShowSolution(true)} />
                  </Card>
                )}
              </>
            ) : null}

            <Card style={{ marginTop: space[6] }}>
              <Text variant="subhead">Ready to solve it?</Text>
              <Text variant="footnote" color="textMuted" style={{ marginTop: space[1] }}>
                Open PlacementRanker on your computer for the full code editor and judge — this page is your revision companion.
              </Text>
            </Card>
          </>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}
