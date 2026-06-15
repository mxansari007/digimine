import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  api,
  ApiError,
  type ClassContentRow,
  type ClassPageData,
  type ClassProjectEvalRow,
} from "@/lib/api";
import { useColors } from "@/design/theme";
import { space } from "@/design/tokens";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListItem,
  ListSkeleton,
  Screen,
  ScreenScroll,
  Text,
} from "@/design/ui";
import { formatWhen, startsIn } from "@/lib/format";

const TITLES: Record<string, string> = {
  quizzes: "Quizzes",
  courses: "Courses",
  tests: "Mock tests",
  contests: "Contests",
  projectEvals: "Project evaluations",
};

type Tone = React.ComponentProps<typeof Chip>["tone"];
function submissionTone(sub: ClassProjectEvalRow["mySubmission"]): { label: string; tone: Tone } {
  if (!sub) return { label: "Not submitted", tone: "neutral" };
  const s = (sub.status || "").toLowerCase();
  if (s === "evaluated" || s === "completed") return { label: "Evaluated", tone: "success" };
  if (s === "failed") return { label: "Eval failed", tone: "danger" };
  return { label: "Submitted", tone: "accent" };
}

export default function ClassContentListScreen() {
  const router = useRouter();
  const c = useColors();
  const { classId, type } = useLocalSearchParams<{ classId: string; type: string }>();
  const [data, setData] = useState<ClassPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) return;
    setError(null);
    try {
      setData(await api.classPageData(classId));
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

  const startQuiz = async (quiz: ClassContentRow) => {
    if (startingId) return;
    setStartingId(quiz.id);
    setError(null);
    try {
      const { attempt } = await api.startQuizAttempt(quiz.id);
      router.push(`/quiz/${attempt.id}`);
    } catch (e: any) {
      if (e instanceof ApiError && (e.status === 402 || e.status === 403)) {
        setError(e.body?.error || "This quiz isn't available on your plan.");
      } else {
        setError(e?.message || "Couldn't start the quiz.");
      }
    } finally {
      setStartingId(null);
    }
  };

  const title = TITLES[String(type)] || "Content";
  const content = data?.content as
    | (Record<string, ClassContentRow[]> & { projectEvals: ClassProjectEvalRow[] })
    | undefined;
  const rows: ClassContentRow[] = (content?.[String(type)] as ClassContentRow[]) || [];
  const evals: ClassProjectEvalRow[] = content?.projectEvals || [];
  const isEmpty = type === "projectEvals" ? evals.length === 0 : rows.length === 0;
  const note = type === "tests" ? "Take full mock tests on the web." : type === "projectEvals" ? "Submit your repo on the web." : null;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title }} />
      <ScreenScroll
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.textSubtle} />
        }
      >
        {error ? <ErrorState message={error} onRetry={load} /> : null}
        {loading ? (
          <ListSkeleton rows={4} />
        ) : isEmpty ? (
          <EmptyState icon="inbox" title={`No ${title.toLowerCase()} yet`} body="Your teacher hasn't added any here yet." />
        ) : (
          <>
            {note ? (
              <Text variant="footnote" color="textSubtle" style={{ marginBottom: space[3] }}>
                {note}
              </Text>
            ) : null}

            {type === "quizzes" ? (
              <Card padded={false} style={{ paddingHorizontal: space[4] }}>
                {rows.map((q, i) => (
                  <ListItem
                    key={q.id}
                    title={q.title}
                    subtitle={`${q.totalQuestions} Qs${q.timeLimitMinutes || q.duration ? ` · ${q.timeLimitMinutes || q.duration} min` : ""}${q.category ? ` · ${q.category}` : ""}`}
                    divider={i < rows.length - 1}
                    onPress={() => startQuiz(q)}
                    trailing={
                      startingId === q.id ? (
                        <ActivityIndicator size="small" color={c.accent} />
                      ) : (
                        <Text variant="subhead" color="accentText">
                          Start
                        </Text>
                      )
                    }
                  />
                ))}
              </Card>
            ) : null}

            {type === "courses" ? (
              <Card padded={false} style={{ paddingHorizontal: space[4] }}>
                {rows.map((cr, i) => (
                  <ListItem
                    key={cr.id}
                    title={cr.title}
                    subtitle={`${cr.totalModules} modules · ${cr.totalLessons} lessons${cr.estimatedHours ? ` · ~${cr.estimatedHours}h` : ""}`}
                    showChevron
                    divider={i < rows.length - 1}
                    onPress={() =>
                      router.push({
                        pathname: "/course/[courseId]",
                        params: { courseId: cr.id, classId: String(classId), title: cr.title },
                      })
                    }
                  />
                ))}
              </Card>
            ) : null}

            {type === "tests" ? (
              <Card padded={false} style={{ paddingHorizontal: space[4] }}>
                {rows.map((t, i) => (
                  <ListItem
                    key={t.id}
                    title={t.title}
                    subtitle={`${t.totalTests ? `${t.totalTests} tests · ` : ""}${t.totalQuestions} Qs${t.duration ? ` · ${t.duration} min` : ""}${t.totalMarks ? ` · ${t.totalMarks} marks` : ""}`}
                    divider={i < rows.length - 1}
                    trailing={<Chip label="On web" tone="neutral" />}
                  />
                ))}
              </Card>
            ) : null}

            {type === "contests" ? (
              <Card padded={false} style={{ paddingHorizontal: space[4] }}>
                {rows.map((ct, i) => (
                  <ListItem
                    key={ct.id}
                    title={ct.title}
                    subtitle={`${ct.startTime ? `${formatWhen(ct.startTime)} · ` : ""}${ct.totalQuestions} Qs${ct.duration ? ` · ${ct.duration} min` : ""}`}
                    divider={i < rows.length - 1}
                    trailing={<Chip label={startsIn(ct.startTime) || "scheduled"} tone="accent" />}
                  />
                ))}
              </Card>
            ) : null}

            {type === "projectEvals" ? (
              <Card padded={false} style={{ paddingHorizontal: space[4] }}>
                {evals.map((ev, i) => {
                  const t = submissionTone(ev.mySubmission);
                  return (
                    <ListItem
                      key={ev.id}
                      title={ev.title}
                      subtitle={`${ev.dueAt ? `Due ${formatWhen(ev.dueAt)}` : "No deadline"}${ev.mySubmission?.totalScore != null && ev.maxTotalScore ? ` · ${ev.mySubmission.totalScore}/${ev.maxTotalScore}` : ""}`}
                      divider={i < evals.length - 1}
                      trailing={<Chip label={t.label} tone={t.tone} />}
                    />
                  );
                })}
              </Card>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
