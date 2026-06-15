import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { colors } from "@/lib/theme";

/**
 * Home header actions: a bell (notifications) and an envelope (messages),
 * each with an unread badge. Counts refresh whenever Home regains focus and
 * every 20s while it's open — cheap polling that keeps the badges honest
 * without a global store.
 */
export function HeaderInbox() {
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
    <View style={styles.row}>
      <IconButton
        ios="envelope.fill"
        android="mail"
        count={msgs}
        onPress={() => router.push("/messages")}
      />
      <IconButton
        ios="bell.fill"
        android="notifications"
        count={notifs}
        onPress={() => router.push("/notifications")}
      />
    </View>
  );
}

function IconButton({
  ios,
  android,
  count,
  onPress,
}: {
  ios: string;
  android: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}>
      <SymbolView
        name={{ ios, android, web: android } as any}
        tintColor={colors.ink as any}
        size={23}
      />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingRight: 14 },
  btn: { padding: 2 },
  badge: {
    position: "absolute",
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.rose,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9.5, fontWeight: "900" },
});
