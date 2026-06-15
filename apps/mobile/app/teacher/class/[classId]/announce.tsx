import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api, type ClassThread } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  ListSkeleton,
  Screen,
  ScreenScroll,
  SectionHeader,
  Text,
} from "@/design/ui";

/** Relative time — "just now" · "5m ago" · "3h ago" · "2d ago" · "12 Jun".
 *  Local helper (no Intl.RelativeTimeFormat dependency). */
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function TeacherAnnounceScreen() {
  const c = useColors();
  const { classId } = useLocalSearchParams<{ classId: string }>();

  const [threads, setThreads] = useState<ClassThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) return;
    setError(null);
    try {
      const res = await api.classThreads(classId, { tag: "announcement", sort: "new" });
      setThreads(res.threads || []);
    } catch (e: any) {
      setError(e?.message || "Couldn't load announcements.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async () => {
    if (!classId || posting) return;
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setPostError("Add a title and a message.");
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      const res = await api.createThread(classId, { title: t, body: b, tag: "announcement" });
      setThreads((prev) => [res.thread, ...prev]);
      setTitle("");
      setBody("");
    } catch (e: any) {
      setPostError(e?.message || "Couldn't post your announcement.");
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <Screen edges={["bottom"]}>
        <ListSkeleton rows={4} />
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

  return (
    <Screen edges={["bottom"]}>
      <ScreenScroll
        keyboardShouldPersistTaps="handled"
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
        {/* Compose */}
        <Card style={{ gap: space[3], marginBottom: space[6] }}>
          <Input
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              if (postError) setPostError(null);
            }}
            placeholder="Announcement title"
            maxLength={160}
            style={{ fontWeight: "600" }}
            returnKeyType="next"
          />
          <Input
            value={body}
            onChangeText={(v) => {
              setBody(v);
              if (postError) setPostError(null);
            }}
            placeholder="Share an update with the class…"
            multiline
            style={{ minHeight: 88 }}
          />
          {postError ? (
            <Text variant="footnote" style={{ color: c.danger }}>
              {postError}
            </Text>
          ) : null}
          <Button
            label="Post announcement"
            leftIcon="volume-2"
            loading={posting}
            disabled={!title.trim() || !body.trim()}
            onPress={post}
            fullWidth
          />
        </Card>

        <SectionHeader title="Posted" />

        {threads.length === 0 ? (
          <EmptyState
            icon="volume-2"
            title="No announcements yet"
            body="Post your first update above — your class will see it here."
          />
        ) : (
          <View style={{ gap: space[2] }}>
            {threads.map((t) => (
              <Card
                key={t.id}
                style={{ gap: space[2], borderLeftWidth: 3, borderLeftColor: c.accent }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  <View
                    style={{
                      backgroundColor: c.accentSubtle,
                      borderRadius: radius.full,
                      paddingHorizontal: space[2],
                      paddingVertical: space[1],
                    }}
                  >
                    <Text
                      variant="caption"
                      style={{ color: c.accentText, fontWeight: "700", letterSpacing: 0.4 }}
                    >
                      ANNOUNCEMENT
                    </Text>
                  </View>
                  {t.isPinned ? <Icon name="bookmark" size={14} color="accentText" /> : null}
                </View>
                <Text variant="bodyEm" numberOfLines={2}>
                  {t.title}
                </Text>
                {t.body ? (
                  <Text variant="footnote" color="textMuted" numberOfLines={3}>
                    {t.body}
                  </Text>
                ) : null}
                <Text variant="caption" color="textSubtle" numberOfLines={1} style={{ marginTop: space[1] }}>
                  {t.authorName} · {relativeTime(t.createdAt)} · {t.replyCount}{" "}
                  {t.replyCount === 1 ? "reply" : "replies"}
                </Text>
              </Card>
            ))}
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}
