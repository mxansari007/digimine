import { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { api, type DmConversation } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/design/theme";
import { space } from "@/design/tokens";
import {
  Avatar,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  ListSkeleton,
  PressableScale,
  Screen,
  Text,
} from "@/design/ui";
import { timeAgo } from "@/lib/format";

export default function ConversationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const c = useColors();
  const [items, setItems] = useState<DmConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.conversations();
      setItems(res.conversations || []);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your messages.");
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

  return (
    <Screen edges={[]}>
      <Stack.Screen
        options={{
          title: "Messages",
          headerRight: () => (
            <PressableScale onPress={() => router.push("/messages/new")} scaleTo={0.9} style={{ padding: space[2] }}>
              <Icon name="edit" size={20} color="accentText" />
            </PressableScale>
          ),
        }}
      />
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[16] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.textSubtle} />}
        ListHeaderComponent={error ? <ErrorState message={error} onRetry={load} /> : null}
        ListEmptyComponent={
          loading ? <ListSkeleton rows={5} /> : <EmptyState icon="message-circle" title="No conversations yet" body="Tap the compose button to message a classmate or teacher from one of your classes." />
        }
        renderItem={({ item }) => {
          const mineLast = item.lastMessage?.senderId === user?.uid;
          const preview = item.lastMessage ? `${mineLast ? "You: " : ""}${item.lastMessage.text}` : item.isBlocked ? "Blocked" : "Say hello";
          return (
            <PressableScale
              onPress={() => router.push(`/messages/${item.id}`)}
              scaleTo={0.99}
              style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3] }}
            >
              <Avatar name={item.otherName} role={item.otherRole} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                  <Text variant="callout" style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
                    {item.otherName}
                  </Text>
                  {item.otherRole !== "student" ? <Chip label="Teacher" tone="accent" /> : null}
                </View>
                <Text
                  variant="footnote"
                  color={item.unread > 0 ? "text" : "textMuted"}
                  numberOfLines={1}
                  style={{ marginTop: 2, fontWeight: item.unread > 0 ? "600" : "400" }}
                >
                  {preview}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: space[1] }}>
                <Text variant="caption" color="textSubtle">
                  {timeAgo(item.lastMessage?.at ?? item.updatedAt)}
                </Text>
                {item.unread > 0 ? (
                  <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
                    <Text variant="caption" style={{ color: "#fff", fontWeight: "800" }}>
                      {item.unread}
                    </Text>
                  </View>
                ) : null}
              </View>
            </PressableScale>
          );
        }}
      />
    </Screen>
  );
}
