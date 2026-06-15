import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { api, type ProblemSummary } from "@/lib/api";
import { useColors } from "@/design/theme";
import { space } from "@/design/tokens";
import {
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  ListItem,
  ListSkeleton,
  Screen,
  ScreenHeader,
  SearchInput,
  Text,
} from "@/design/ui";

const DIFFICULTIES = ["all", "easy", "medium", "hard"] as const;

type Tone = React.ComponentProps<typeof Chip>["tone"];
function diffTone(d: string): Tone {
  return d === "easy" ? "success" : d === "medium" ? "warning" : d === "hard" ? "danger" : "neutral";
}

export default function PracticeScreen() {
  const router = useRouter();
  const c = useColors();
  const [items, setItems] = useState<ProblemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.problems({ pageSize: 100 });
      setItems(res.items || []);
    } catch (e: any) {
      setError(e?.message || "Couldn't load problems.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let out = items;
    if (difficulty !== "all") out = out.filter((p) => p.difficulty === difficulty);
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((p) => p.title.toLowerCase().includes(q));
    return out;
  }, [items, difficulty, search]);

  return (
    <Screen>
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[6], paddingBottom: space[16] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.textSubtle} />}
        ListHeaderComponent={
          <View style={{ marginBottom: space[2] }}>
            <ScreenHeader title="Practice" />
            <SearchInput value={search} onChangeText={setSearch} placeholder="Search problems…" />
            <View style={{ flexDirection: "row", gap: space[2], marginTop: space[4], marginBottom: space[3] }}>
              {DIFFICULTIES.map((d) => (
                <Chip key={d} label={d === "all" ? "All" : d[0].toUpperCase() + d.slice(1)} selected={difficulty === d} onPress={() => setDifficulty(d)} />
              ))}
            </View>
            {error ? <ErrorState message={error} onRetry={load} /> : null}
            {!loading ? (
              <Text variant="caption" color="textSubtle" style={{ marginBottom: space[1] }}>
                {filtered.length} PROBLEM{filtered.length === 1 ? "" : "S"} · SOLVE ON WEB · REVIEW HERE
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? <ListSkeleton rows={6} /> : <EmptyState icon="search" title="No problems match" body="Try a different difficulty or search term." />
        }
        renderItem={({ item }) => (
          <ListItem
            title={`${item.problemNumber != null ? `${item.problemNumber}. ` : ""}${item.title}`}
            subtitle={`${item.kind.toUpperCase()} · ${item.primaryPattern.replace(/-/g, " ")}${item.totalSolved ? ` · ${item.totalSolved} solved` : ""}`}
            onPress={() => router.push(`/problem/${item.slug}`)}
            trailing={
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                {item.access === "premium" ? <Icon name="lock" size={14} color="warning" /> : null}
                <Chip label={item.difficulty} tone={diffTone(item.difficulty)} />
              </View>
            }
          />
        )}
      />
    </Screen>
  );
}
