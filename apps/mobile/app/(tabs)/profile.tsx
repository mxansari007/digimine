import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { api, type UsageResponse, type WalletResponse } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Button,
  Card,
  Chip,
  ErrorState,
  Icon,
  ListItem,
  ListSkeleton,
  Screen,
  ScreenScroll,
  ScreenHeader,
  SectionHeader,
  Text,
} from "@/design/ui";
import { GradientHero } from "@/design/bold";

const QUOTA_LABELS: Record<string, string> = {
  practiceSubmissionsPerDay: "Practice submissions / day",
  premiumProblemUnlocksPerMonth: "Premium unlocks / month",
  mockTestsPerMonth: "Mock tests / month",
  premiumQuizzesPerMonth: "Premium quizzes / month",
  courseEnrollmentsActive: "Active premium courses",
  aiInterviewsPerWeek: "AI interviews / week",
};

function QuotaBar({ used, limit }: { used: number; limit: number }) {
  const c = useColors();
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <View style={{ height: 6, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: "hidden", marginTop: space[2] }}>
      <View
        style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: radius.full,
          backgroundColor: pct >= 100 ? c.danger : c.accent,
        }}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const c = useColors();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [creditsOn, setCreditsOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, cfg] = await Promise.all([
        api.usage().catch(() => null),
        api.creditsConfig().catch(() => ({ enabled: false })),
      ]);
      setUsage(u);
      setCreditsOn(Boolean(cfg.enabled));
      if (cfg.enabled) setWallet(await api.wallet().catch(() => null));
    } catch (e: any) {
      setError(e?.message || "Couldn't load your plan.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const initial = (user?.displayName || user?.email || "U")[0].toUpperCase();

  return (
    <Screen>
      <ScreenScroll
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
        <ScreenHeader title="Profile" />

        {/* Identity */}
        <GradientHero
          variant="signal"
          style={{ flexDirection: "row", alignItems: "center", gap: space[4], marginBottom: space[8] }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "rgba(255,255,255,0.2)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text variant="title2" style={{ color: "#ffffff" }}>
              {initial}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title3" numberOfLines={1} style={{ color: "#ffffff" }}>
              {user?.displayName || "Student"}
            </Text>
            <Text variant="footnote" numberOfLines={1} style={{ color: "rgba(255,255,255,0.85)" }}>
              {user?.email}
            </Text>
          </View>
        </GradientHero>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <ListSkeleton rows={3} />
        ) : (
          <>
            {/* Plan */}
            <SectionHeader title="Plan" />
            <Card style={{ marginBottom: space[8] }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text variant="title3">{usage?.entitlements.planName ?? "—"}</Text>
                <Chip label={usage?.entitlements.isPaid ? "Paid" : "Free"} tone={usage?.entitlements.isPaid ? "accent" : "neutral"} />
              </View>
              {usage && usage.usage.length > 0 ? (
                <View style={{ marginTop: space[5], gap: space[4] }}>
                  {usage.usage.map((q) => (
                    <View key={q.key}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text variant="footnote" color="textMuted">
                          {QUOTA_LABELS[q.key] ?? q.key}
                        </Text>
                        <Text variant="footnote" style={{ fontWeight: "600" }}>
                          {q.limit < 0 ? "Unlimited" : `${q.used} / ${q.limit}`}
                        </Text>
                      </View>
                      {q.limit >= 0 ? <QuotaBar used={q.used} limit={q.limit} /> : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>

            {/* AI credits */}
            {creditsOn && wallet ? (
              <>
                <SectionHeader title="AI credits" />
                <Card style={{ marginBottom: space[4] }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
                    <Icon name="zap" size={20} color="accentText" />
                    <Text variant="title2">{wallet.balance}</Text>
                  </View>
                  <Text variant="footnote" color="textMuted" style={{ marginTop: space[1] }}>
                    {wallet.lifetimeSpent} spent · {wallet.lifetimePurchased} purchased all-time
                  </Text>
                </Card>
                {wallet.transactions.length > 0 ? (
                  <Card padded={false} style={{ paddingHorizontal: space[4], marginBottom: space[8] }}>
                    {wallet.transactions.slice(0, 5).map((t, i, arr) => (
                      <ListItem
                        key={t.id}
                        title={(t.note || t.task?.replace(/_/g, " ") || t.type) ?? "Transaction"}
                        subtitle={
                          t.createdAt
                            ? new Date(t.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                            : undefined
                        }
                        divider={i < Math.min(arr.length, 5) - 1}
                        trailing={
                          <Text variant="callout" style={{ fontWeight: "700" }} color={t.amount >= 0 ? "success" : "danger"}>
                            {t.amount >= 0 ? "+" : ""}
                            {t.amount}
                          </Text>
                        }
                      />
                    ))}
                  </Card>
                ) : null}
              </>
            ) : null}

            <View style={{ height: space[8] }} />
            <SectionHeader title="Career" />
            <Card padded={false} style={{ paddingHorizontal: space[4] }}>
              <ListItem
                title="My Résumés"
                subtitle="Preview and download your resumes"
                left={
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="file-text" size={20} color="textMuted" />
                  </View>
                }
                showChevron
                divider={false}
                onPress={() => router.push("/resume" as Href)}
              />
            </Card>

            <View style={{ height: space[8] }} />
            <SectionHeader title="Settings" />
            <Card padded={false} style={{ paddingHorizontal: space[4] }}>
              <ListItem
                title="Notifications"
                subtitle="Choose what you get notified about"
                left={
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="bell" size={20} color="textMuted" />
                  </View>
                }
                showChevron
                divider={false}
                onPress={() => router.push("/notification-settings")}
              />
            </Card>

            <Button label="Sign out" variant="ghost" onPress={() => signOut()} style={{ marginTop: space[6] }} />
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
