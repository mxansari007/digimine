import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { api, ApiError, type QuizSummary } from "@/lib/api";
import { useColors } from "@/design/theme";
import { space } from "@/design/tokens";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Screen,
  ScreenHeader,
  Text,
} from "@/design/ui";

export default function QuizzesScreen() {
  const router = useRouter();
  const c = useColors();
  const [items, setItems] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [category, setCategory] = useState("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cat, enr] = await Promise.all([
        api.quizzes().catch(() => ({ items: [] as QuizSummary[] })),
        api.myEnrollments().catch(() => ({ classes: [] })),
      ]);
      const classLists = await Promise.all(
        (enr.classes || [])
          .filter((x) => !x.isArchived)
          .map((x) =>
            api
              .classQuizzes(x.classId)
              .then((r) => (r.items || []).map((q) => ({ ...q, fromClass: x.className })))
              .catch(() => [])
          )
      );
      const merged = new Map<string, QuizSummary>();
      for (const q of classLists.flat()) merged.set(q.id, q);
      for (const q of cat.items || []) if (!merged.has(q.id)) merged.set(q.id, q);
      setItems(Array.from(merged.values()).filter((q) => q.status !== "draft" && !q.isDeleted && q.totalQuestions > 0));
    } catch (e: any) {
      setError(e?.message || "Couldn't load quizzes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set(items.map((q) => q.category).filter(Boolean) as string[]);
    return ["all", ...Array.from(set)];
  }, [items]);
  const filtered = useMemo(
    () => (category === "all" ? items : items.filter((q) => q.category === category)),
    [items, category]
  );

  const start = async (quiz: QuizSummary) => {
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

  return (
    <Screen>
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(q) => q.id}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[6], paddingBottom: space[16] }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.textSubtle} />}
        ListHeaderComponent={
          <View>
            <ScreenHeader title="Quizzes" />
            {error ? <ErrorState message={error} onRetry={load} /> : null}
            {categories.length > 2 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginBottom: space[4] }}>
                {categories.map((cat) => (
                  <Chip key={cat} label={cat === "all" ? "All" : cat} selected={category === cat} onPress={() => setCategory(cat)} />
                ))}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? <ListSkeleton rows={4} /> : <EmptyState icon="check-square" title="No quizzes yet" body="Published quizzes appear here — pull to refresh." />
        }
        renderItem={({ item }) => (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: space[3], marginBottom: space[3] }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyEm" numberOfLines={2}>{item.title}</Text>
              {item.shortDescription ? (
                <Text variant="footnote" color="textMuted" numberOfLines={2} style={{ marginTop: space[1] }}>
                  {item.shortDescription}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[1], marginTop: space[3] }}>
                <Chip label={`${item.totalQuestions} Qs`} />
                {(item.timeLimitMinutes ?? item.duration ?? 0) > 0 ? <Chip label={`${item.timeLimitMinutes ?? item.duration} min`} /> : null}
                {item.fromClass ? (
                  <Chip label={item.fromClass} tone="accent" />
                ) : item.accessType === "premium" ? (
                  <Chip label="Premium" tone="warning" />
                ) : (
                  <Chip label="Free" tone="success" />
                )}
              </View>
            </View>
            <Button label="Start" size="compact" loading={startingId === item.id} onPress={() => start(item)} />
          </Card>
        )}
      />
    </Screen>
  );
}
