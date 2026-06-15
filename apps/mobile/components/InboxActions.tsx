import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { IconButton } from "@/design/ui";

/**
 * Home header actions — messages + notifications, each with an unread badge.
 * Counts refresh on focus and every 20s while Home is open.
 */
export function InboxActions() {
  const router = useRouter();
  const [notifs, setNotifs] = useState(0);
  const [msgs, setMsgs] = useState(0);

  const refresh = useCallback(async () => {
    const [n, c] = await Promise.all([
      api.notifications().catch(() => null),
      api.conversations().catch(() => null),
    ]);
    if (n) setNotifs(n.unreadCount || 0);
    if (c) setMsgs((c.conversations || []).reduce((sum, x) => sum + (x.unread || 0), 0));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const timer = setInterval(refresh, 20000);
      return () => clearInterval(timer);
    }, [refresh])
  );

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <IconButton icon="mail" badge={msgs} onPress={() => router.push("/messages")} />
      <IconButton icon="bell" badge={notifs} onPress={() => router.push("/notifications")} />
    </View>
  );
}
