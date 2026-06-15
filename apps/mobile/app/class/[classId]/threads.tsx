import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api, type ClassThread, type ThreadTag } from "@/lib/api";
import { useColors } from "@/design/theme";
import { space } from "@/design/tokens";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  ListSkeleton,
  PressableScale,
  Screen,
  Text,
} from "@/design/ui";
import { timeAgo } from "@/lib/format";

type Tone = React.ComponentProps<typeof Chip>["tone"];
export const TAG_META: Record<string, { label: string; tone: Tone }> = {
  announcement: { label: "Announcement", tone: "warning" },
  question: { label: "Question", tone: "accent" },
  discussion: { label: "Discussion", tone: "neutral" },
  resource: { label: "Resource", tone: "success" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "announcement", label: "Announcements" },
  { key: "question", label: "Questions" },
  { key: "discussion", label: "Discussions" },
  { key: "resource", label: "Resources" },
];

export default function ClassThreadsScreen() {
  const router = useRouter();
  const c = useColors();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const [threads, setThreads] = useState<ClassThread[]>([]);
  const [role, setRole] = useState<string>("student");
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<ThreadTag>("question");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!classId) return;
    setError(null);
    try {
      const res = await api.classThreads(classId);
      setThreads(res.threads || []);
      setRole(res.role || "student");
      setMuted(Boolean(res.block?.threads));
    } catch (e: any) {
      setError(e?.message || "Couldn't load the community.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => (filter === "all" ? threads : threads.filter((t) => t.tag === filter)), [threads, filter]);
  const tagChoices: ThreadTag[] = role === "student" ? ["question", "discussion", "resource"] : ["question", "discussion", "resource", "announcement"];

  const post = async () => {
    if (!classId || posting || !title.trim() || !body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await api.createThread(classId, { title: title.trim(), body: body.trim(), tag });
      setThreads((prev) => [res.thread, ...prev]);
      setTitle("");
      setBody("");
      setComposing(false);
    } catch (e: any) {
      setError(e?.message || "Couldn't publish your post.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: "Community" }} />
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[16] }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.textSubtle} />}
        ListHeaderComponent={
          <View style={{ gap: space[3], marginBottom: space[3] }}>
            {muted ? (
              <Card style={{ backgroundColor: c.warningSubtle, borderColor: c.warning }}>
                <Text variant="footnote" color="warning" style={{ fontWeight: "600" }}>
                  Your teacher has muted you in this class's discussions.
                </Text>
              </Card>
            ) : composing ? (
              <Card style={{ gap: space[3] }}>
                <Input value={title} onChangeText={setTitle} placeholder="Title — what's this about?" maxLength={160} style={{ fontWeight: "600" }} />
                <Input value={body} onChangeText={setBody} placeholder="Ask your question or share the details…" multiline style={{ minHeight: 72 }} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
                  {tagChoices.map((t) => (
                    <Chip key={t} label={TAG_META[t].label} selected={tag === t} onPress={() => setTag(t)} />
                  ))}
                </View>
                <View style={{ flexDirection: "row", gap: space[2] }}>
                  <Button label="Cancel" variant="secondary" onPress={() => setComposing(false)} style={{ flex: 1 }} />
                  <Button label="Post" loading={posting} disabled={!title.trim() || !body.trim()} onPress={post} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : (
              <PressableScale onPress={() => setComposing(true)} scaleTo={0.99}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], backgroundColor: c.surface, borderWidth: 0.5, borderColor: c.border, borderRadius: 999, paddingHorizontal: space[4], paddingVertical: space[3] }}>
                  <Icon name="edit-3" size={18} color="textSubtle" />
                  <Text variant="callout" color="textSubtle">Ask a question or start a post…</Text>
                </View>
              </PressableScale>
            )}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
              {FILTERS.map((f) => (
                <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
              ))}
            </View>

            {error ? <ErrorState message={error} onRetry={load} /> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? <ListSkeleton rows={4} /> : (
            <EmptyState
              icon="message-square"
              title={filter === "all" ? "No posts yet" : "Nothing here yet"}
              body={filter === "all" ? "Be the first — ask a question or share something with your class." : "Try another filter, or start the first post."}
            />
          )
        }
        renderItem={({ item }) => {
          const meta = TAG_META[item.tag] ?? TAG_META.discussion;
          const fromTeacher = item.authorRole !== "student";
          return (
            <Card onPress={() => router.push(`/class/${classId}/thread/${item.id}`)} style={{ marginBottom: space[3], gap: space[2] }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Chip label={meta.label} tone={meta.tone} />
                {item.isPinned ? <Icon name="bookmark" size={14} color="warning" /> : null}
              </View>
              <Text variant="bodyEm" numberOfLines={2}>{item.title}</Text>
              {item.body ? (
                <Text variant="footnote" color="textMuted" numberOfLines={2}>{item.body}</Text>
              ) : null}
              <Text variant="caption" color="textSubtle" numberOfLines={1} style={{ marginTop: space[1] }}>
                {item.authorName}{fromTeacher ? " · Teacher" : ""} · {timeAgo(item.lastActivityAt || item.createdAt)}   ▲ {item.upvoteCount} · {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}
              </Text>
            </Card>
          );
        }}
      />
    </Screen>
  );
}
