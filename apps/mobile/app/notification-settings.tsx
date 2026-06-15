import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, Switch, View } from "react-native";
import { api, type NotificationPrefKey, type NotificationPrefs } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import { ErrorState, ListSkeleton, Screen, Text } from "@/design/ui";

const ROWS: { key: NotificationPrefKey; title: string; subtitle: string }[] = [
  { key: "dm", title: "Direct messages", subtitle: "New messages from teachers & classmates" },
  { key: "announcement", title: "Class announcements", subtitle: "When a teacher posts an announcement" },
  { key: "thread_reply", title: "Replies to your posts", subtitle: "When someone replies in a discussion" },
  { key: "answer_marked", title: "Answer accepted", subtitle: "When your reply is marked the answer" },
  { key: "resource_shared", title: "New class resources", subtitle: "When a teacher shares a file or link" },
];

export default function NotificationSettingsScreen() {
  const c = useColors();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.notificationPrefs();
      setPrefs(res.prefs);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (key: NotificationPrefKey, value: boolean) => {
    if (!prefs) return;
    const prev = prefs;
    setPrefs({ ...prefs, [key]: value }); // optimistic
    try {
      const res = await api.setNotificationPref(key, value);
      setPrefs(res.prefs);
    } catch {
      setPrefs(prev); // revert on failure
    }
  };

  return (
    <Screen edges={[]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[16] }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="body" color="textMuted" style={{ marginBottom: space[5] }}>
          Choose what you get notified about. This applies to push notifications and the in-app
          inbox.
        </Text>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading || !prefs ? (
          <ListSkeleton rows={5} />
        ) : (
          <View
            style={{
              borderRadius: radius.lg,
              borderWidth: 0.5,
              borderColor: c.border,
              backgroundColor: c.surface,
              overflow: "hidden",
            }}
          >
            {ROWS.map((row, i) => (
              <View
                key={row.key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space[3],
                  paddingHorizontal: space[4],
                  paddingVertical: space[3],
                  borderTopWidth: i > 0 ? 0.5 : 0,
                  borderTopColor: c.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="callout" style={{ fontWeight: "500" }}>{row.title}</Text>
                  <Text variant="footnote" color="textMuted" style={{ marginTop: 2 }}>
                    {row.subtitle}
                  </Text>
                </View>
                <Switch
                  value={prefs[row.key]}
                  onValueChange={(v) => toggle(row.key, v)}
                  trackColor={{ false: c.surfaceAlt, true: c.accent }}
                  thumbColor={Platform.OS === "android" ? (prefs[row.key] ? "#fff" : "#f4f4f5") : undefined}
                  ios_backgroundColor={c.surfaceAlt}
                />
              </View>
            ))}
          </View>
        )}

        <Text variant="caption" color="textSubtle" style={{ marginTop: space[4], lineHeight: 17 }}>
          Push notifications also require allowing notifications for PlacementRanker in your phone
          settings.
        </Text>
      </ScrollView>
    </Screen>
  );
}
