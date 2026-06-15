import { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { api, type AppNotification } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  EmptyState,
  ErrorState,
  Icon,
  type IconName,
  ListSkeleton,
  PressableScale,
  Screen,
  Text,
} from "@/design/ui";
import { timeAgo } from "@/lib/format";

const TYPE_ICON: Record<string, IconName> = {
  dm: "message-circle",
  announcement: "volume-2",
  thread_reply: "corner-up-left",
  answer_marked: "check-circle",
  report: "flag",
  resource_shared: "folder",
};

export default function NotificationsScreen() {
  const router = useRouter();
  const c = useColors();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.notifications();
      setItems(res.notifications || []);
    } catch (e: any) {
      setError(e?.message || "Couldn't load notifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.markNotificationsRead();
    } catch {
      load();
    }
  };

  const open = async (n: AppNotification) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      api.markNotificationsRead([n.id]).catch(() => {});
    }
    const d = n.data || {};
    if (n.type === "dm" && d.threadId) router.push(`/messages/${d.threadId}`);
    else if (n.type === "resource_shared" && d.classId) router.push(`/class/${d.classId}/resources`);
    else if ((n.type === "announcement" || n.type === "thread_reply") && d.classId && d.threadId)
      router.push(`/class/${d.classId}/thread/${d.threadId}`);
  };

  const hasUnread = items.some((n) => !n.read);

  return (
    <Screen edges={[]}>
      <Stack.Screen
        options={{
          title: "Notifications",
          headerRight: () =>
            hasUnread ? (
              <PressableScale onPress={markAllRead} scaleTo={0.95} style={{ paddingHorizontal: space[2] }}>
                <Text variant="footnote" color="accentText" style={{ fontWeight: "600" }}>
                  Mark all read
                </Text>
              </PressableScale>
            ) : null,
        }}
      />
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingHorizontal: space[3], paddingTop: space[3], paddingBottom: space[16] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.textSubtle} />}
        ListHeaderComponent={error ? <ErrorState message={error} onRetry={load} /> : null}
        ListEmptyComponent={
          loading ? <ListSkeleton rows={5} /> : <EmptyState icon="bell" title="You're all caught up" body="Messages, class announcements and replies to your posts show up here." />
        }
        renderItem={({ item }) => (
          <PressableScale
            onPress={() => open(item)}
            scaleTo={0.99}
            style={{
              flexDirection: "row",
              gap: space[3],
              padding: space[3],
              borderRadius: radius.lg,
              alignItems: "flex-start",
              backgroundColor: item.read ? "transparent" : c.surface,
              borderWidth: item.read ? 0 : 0.5,
              borderColor: c.border,
              marginBottom: space[1],
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
              <Icon name={TYPE_ICON[item.type] ?? "bell"} size={18} color="textMuted" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="subhead" style={{ fontWeight: item.read ? "500" : "700" }} numberOfLines={2}>
                {item.title}
              </Text>
              {item.body ? (
                <Text variant="footnote" color="textMuted" numberOfLines={2} style={{ marginTop: 2 }}>
                  {item.body}
                </Text>
              ) : null}
              <Text variant="caption" color="textSubtle" style={{ marginTop: space[1] }}>
                {timeAgo(item.createdAt)}
              </Text>
            </View>
            {!item.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent, marginTop: 6 }} /> : null}
          </PressableScale>
        )}
      />
    </Screen>
  );
}
