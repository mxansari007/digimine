import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { api, type ClassThread, type ThreadReply } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space, type as typeScale } from "@/design/tokens";
import { Avatar, Chip, EmptyState, ErrorState, Icon, ListSkeleton, PressableScale, Text } from "@/design/ui";
import { timeAgo } from "@/lib/format";
import { TAG_META } from "../threads";

function Vote({ count, voted, onPress }: { count: number; voted?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        borderRadius: radius.full,
        borderWidth: 0.5,
        borderColor: voted ? c.accent : c.border,
        backgroundColor: voted ? c.accentSubtle : "transparent",
        paddingHorizontal: space[3],
        paddingVertical: space[1],
      }}
    >
      <Icon name="arrow-up" size={14} tint={voted ? c.accentText : c.textMuted} />
      <Text variant="footnote" style={{ fontWeight: "600", color: voted ? c.accentText : c.textMuted }}>
        {count}
      </Text>
    </PressableScale>
  );
}

export default function ThreadDetailScreen() {
  const { classId, threadId } = useLocalSearchParams<{ classId: string; threadId: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [thread, setThread] = useState<ClassThread | null>(null);
  const [replies, setReplies] = useState<ThreadReply[]>([]);
  const [role, setRole] = useState("student");
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!classId || !threadId) return;
    setError(null);
    try {
      const res = await api.classThread(classId, threadId);
      setThread(res.thread);
      setReplies(res.replies || []);
      setRole(res.role || "student");
      setMuted(Boolean(res.block?.threads));
    } catch (e: any) {
      setError(e?.message || "Couldn't load this post.");
    } finally {
      setLoading(false);
    }
  }, [classId, threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const voteOnThread = async () => {
    if (!classId || !threadId || !thread) return;
    const prev = thread;
    setThread({ ...thread, myVote: !thread.myVote, upvoteCount: thread.upvoteCount + (thread.myVote ? -1 : 1) });
    try {
      const res = await api.voteThread(classId, threadId);
      setThread((t) => (t ? { ...t, myVote: res.voted, upvoteCount: res.upvoteCount } : t));
    } catch {
      setThread(prev);
    }
  };

  const voteOnReply = async (r: ThreadReply) => {
    if (!classId || !threadId) return;
    const apply = (voted: boolean, count: number) =>
      setReplies((list) => list.map((x) => (x.id === r.id ? { ...x, myVote: voted, upvoteCount: count } : x)));
    apply(!r.myVote, r.upvoteCount + (r.myVote ? -1 : 1));
    try {
      const res = await api.voteReply(classId, threadId, r.id);
      apply(res.voted, res.upvoteCount);
    } catch {
      apply(Boolean(r.myVote), r.upvoteCount);
    }
  };

  const send = async () => {
    if (!classId || !threadId || !reply.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.replyToThread(classId, threadId, reply.trim());
      setReplies((list) => [...list, res.reply]);
      setThread((t) => (t ? { ...t, replyCount: t.replyCount + 1 } : t));
      setReply("");
    } catch (e: any) {
      setError(e?.message || "Couldn't send your reply.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: "Post" }} />
        <ListSkeleton rows={5} />
      </View>
    );
  }
  if (!thread) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: "Post" }} />
        <EmptyState icon="alert-circle" title="Post not found" body={error || "It may have been deleted."} />
      </View>
    );
  }

  const meta = TAG_META[thread.tag] ?? TAG_META.discussion;
  const locked = thread.isLocked && role === "student";
  const canReply = !locked && !muted;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
      <Stack.Screen options={{ title: meta.label }} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: space[6] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* The post */}
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Chip label={meta.label} tone={meta.tone} />
            {thread.isPinned ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
                <Icon name="bookmark" size={14} color="warning" />
                <Text variant="caption" color="warning">Pinned</Text>
              </View>
            ) : null}
          </View>
          <Text variant="title2">{thread.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
            <Avatar name={thread.authorName} role={thread.authorRole} />
            <View style={{ flex: 1 }}>
              <Text variant="subhead">{thread.authorName}{thread.authorRole !== "student" ? "  ·  Teacher" : ""}</Text>
              <Text variant="caption" color="textSubtle">{timeAgo(thread.createdAt)}</Text>
            </View>
          </View>
          {thread.body ? <Text variant="body" color="textMuted">{thread.body}</Text> : null}
          {thread.attachments?.length ? (
            <Text variant="footnote" color="textSubtle">📎 {thread.attachments.length} attachment{thread.attachments.length === 1 ? "" : "s"} — view on the web</Text>
          ) : null}
          <View style={{ alignSelf: "flex-start" }}>
            <Vote count={thread.upvoteCount} voted={thread.myVote} onPress={voteOnThread} />
          </View>
        </View>

        {error ? <View style={{ marginTop: space[4] }}><ErrorState message={error} /></View> : null}

        {/* Replies */}
        <Text variant="subhead" style={{ marginTop: space[6], marginBottom: space[3] }}>
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </Text>
        {replies.length === 0 ? (
          <EmptyState icon="message-circle" title="No replies yet" body="Be the first to help out or weigh in." />
        ) : (
          replies.map((r) => (
            <View
              key={r.id}
              style={{
                backgroundColor: r.isAnswer ? c.successSubtle : c.surface,
                borderWidth: 0.5,
                borderColor: r.isAnswer ? c.success : c.border,
                borderRadius: radius.lg,
                padding: space[3],
                marginBottom: space[3],
                gap: space[2],
              }}
            >
              {r.isAnswer ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
                  <Icon name="check-circle" size={14} color="success" />
                  <Text variant="caption" color="success" style={{ fontWeight: "700" }}>Marked as the answer</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
                <Avatar name={r.authorName} role={r.authorRole} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="footnote" style={{ fontWeight: "600" }} numberOfLines={1}>
                    {r.authorName}{r.authorRole !== "student" ? "  ·  Teacher" : ""}
                  </Text>
                  <Text variant="caption" color="textSubtle">{timeAgo(r.createdAt)}</Text>
                </View>
                <Vote count={r.upvoteCount} voted={r.myVote} onPress={() => voteOnReply(r)} />
              </View>
              <Text variant="callout" color="textMuted">{r.body}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Reply composer */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[2], padding: space[3], paddingBottom: space[3] + insets.bottom, backgroundColor: c.surface, borderTopWidth: 0.5, borderTopColor: c.border }}>
        {canReply ? (
          <>
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder="Write a reply…"
              placeholderTextColor={c.textSubtle}
              multiline
              style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: radius.lg, paddingHorizontal: space[4], paddingVertical: space[3], fontSize: typeScale.callout.fontSize, color: c.text, maxHeight: 110 }}
            />
            <PressableScale
              onPress={send}
              disabled={!reply.trim() || sending}
              scaleTo={0.9}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", opacity: !reply.trim() || sending ? 0.4 : 1 }}
            >
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="arrow-up" size={20} tint="#fff" />}
            </PressableScale>
          </>
        ) : (
          <Text variant="footnote" color="textMuted" align="center" style={{ flex: 1 }}>
            {muted ? "Your teacher has muted you in this class's discussions." : "🔒 This post is locked — no new replies."}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
