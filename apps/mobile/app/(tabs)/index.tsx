import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type DashboardData,
  type EnrolledClass,
  type TimetableEntry,
  type WalletResponse,
} from "@/lib/api";
import { useColors } from "@/design/theme";
import { space } from "@/design/tokens";
import {
  Avatar,
  Button,
  Card,
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
import { Gauge, GradientHero } from "@/design/bold";
import { InboxActions } from "@/components/InboxActions";

const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const c = useColors();
  const [data, setData] = useState<DashboardData | null>(null);
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [creditsOn, setCreditsOn] = useState(false);
  const [readiness, setReadiness] = useState<number | null>(null);
  const [completedInterviews, setCompletedInterviews] = useState<number | null>(null);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [dash, enr, cfg, iv, tt] = await Promise.all([
        api.dashboard(user.uid),
        api.myEnrollments().catch(() => ({ classes: [] as EnrolledClass[] })),
        api.creditsConfig().catch(() => ({ enabled: false })),
        api
          .interviewSessions()
          .catch(() => ({ items: [], readiness: null as { avgReadiness?: number; completed?: number } | null })),
        api.timetable().catch(() => ({ entries: [] as TimetableEntry[] })),
      ]);
      setData(dash);
      setClasses((enr.classes || []).filter((x) => !x.isArchived));
      setCreditsOn(Boolean(cfg.enabled));
      if (cfg.enabled) setWallet(await api.wallet().catch(() => null));
      setReadiness(typeof iv.readiness?.avgReadiness === "number" ? iv.readiness.avgReadiness : null);
      setCompletedInterviews(typeof iv.readiness?.completed === "number" ? iv.readiness.completed : null);
      setEntries(tt.entries || []);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your home.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const firstName =
    user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // The next upcoming class across the week (today after now, else following days).
  const nextSlot = useMemo(() => {
    if (!entries.length) return null;
    const now = new Date();
    const two = (n: number) => String(n).padStart(2, "0");
    const nowHHmm = `${two(now.getHours())}:${two(now.getMinutes())}`;
    const todayIdx = now.getDay();
    for (let off = 0; off < 7; off++) {
      const key = DAY_ORDER[(todayIdx + off) % 7];
      const slots = entries
        .filter((e) => e.day === key)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (const s of slots) {
        if (off === 0 && s.startTime <= nowHHmm) continue;
        const label = off === 0 ? "Today" : off === 1 ? "Tomorrow" : key[0].toUpperCase() + key.slice(1);
        return { slot: s, label };
      }
    }
    return null;
  }, [entries]);

  const band =
    readiness == null
      ? "NO DATA"
      : readiness >= 85
        ? "INTERVIEW-READY"
        : readiness >= 70
          ? "STRONG"
          : readiness >= 40
            ? "ON TRACK"
            : "BUILDING";
  const directive =
    readiness == null
      ? "Take an AI mock interview to start your readiness score."
      : readiness >= 85
        ? "Interview-ready — keep it sharp."
        : readiness >= 70
          ? "Strong — one more mock to push higher."
          : "Keep practicing to level up your readiness.";

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
        <ScreenHeader eyebrow={greeting} title={firstName} trailing={<InboxActions />} />

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <ListSkeleton rows={4} />
        ) : (
          <>
            {/* ── Readiness hero ─────────────────────────────────────── */}
            <GradientHero variant="signal" style={{ marginBottom: space[6] }}>
              <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>
                Your readiness
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], marginTop: space[1] }}>
                <Gauge value={readiness ?? 0} size={116} label={band} tone="onHero" />
                <View style={{ flex: 1, gap: space[3] }}>
                  <HeroStat label="AI credits" value={creditsOn && wallet ? String(wallet.balance) : "—"} />
                  <HeroStat label="Mock interviews" value={completedInterviews != null ? String(completedInterviews) : "0"} />
                  <HeroStat label="Subjects" value={String(classes.length)} />
                </View>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: space[3],
                  marginTop: space[3],
                }}
              >
                <Text variant="subhead" style={{ color: "#ffffff", flex: 1 }}>
                  {directive}
                </Text>
                <Button label="Interviews" variant="secondary" size="compact" onPress={() => router.push("/interviews")} />
              </View>
            </GradientHero>

            {/* ── Next class (from timetable) ────────────────────────── */}
            {nextSlot ? (
              <Card
                onPress={() => router.push(`/class/${nextSlot.slot.classId}`)}
                style={{ marginBottom: space[6], borderLeftWidth: 3, borderLeftColor: c.accent }}
              >
                <Text variant="caption" color="accentText" style={{ textTransform: "uppercase" }}>
                  Next · {nextSlot.label} {nextSlot.slot.startTime}
                </Text>
                <Text variant="bodyEm" numberOfLines={1} style={{ marginTop: 2 }}>
                  {nextSlot.slot.subject}
                </Text>
                <Text variant="footnote" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
                  {[nextSlot.slot.teacherName, nextSlot.slot.room, nextSlot.slot.sectionName].filter(Boolean).join(" · ")}
                </Text>
              </Card>
            ) : null}

            {/* ── Your subjects ──────────────────────────────────────── */}
            <SectionHeader
              title="Your subjects"
              action={
                <Text variant="footnote" color="accentText" onPress={() => router.push("/timetable" as Href)}>
                  Timetable
                </Text>
              }
            />
            {classes.length > 0 ? (
              <Card padded={false} style={{ paddingHorizontal: space[4], marginBottom: space[8] }}>
                {classes.slice(0, 4).map((cl, i) => {
                  const title = cl.subject || cl.className;
                  const subtitle = [
                    cl.teacherName,
                    cl.sectionName || cl.teacherInstitute,
                    cl.groupName ? `Group ${cl.groupName}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <ListItem
                      key={cl.classId}
                      title={title}
                      subtitle={subtitle}
                      left={<Avatar name={title} role="teacher" />}
                      showChevron
                      divider={i < Math.min(classes.length, 4) - 1}
                      onPress={() => router.push(`/class/${cl.classId}`)}
                    />
                  );
                })}
              </Card>
            ) : (
              <Card style={{ marginBottom: space[8] }}>
                <Text variant="bodyEm">No classes yet</Text>
                <Text variant="footnote" color="textMuted" style={{ marginTop: space[1] }}>
                  Join with a class or group code to unlock subjects, quizzes and your timetable.
                </Text>
                <Button
                  label="Join a class"
                  variant="secondary"
                  size="compact"
                  leftIcon="plus"
                  onPress={() => router.push("/classes" as Href)}
                  style={{ marginTop: space[4], alignSelf: "flex-start" }}
                />
              </Card>
            )}

            {/* ── Keep going ─────────────────────────────────────────── */}
            <SectionHeader title="Keep going" />
            <Card padded={false} style={{ paddingHorizontal: space[4] }}>
              <ListItem
                title="Practice problems"
                subtitle="DSA & SQL — solve and track progress"
                left={<TileIcon icon="code" />}
                showChevron
                onPress={() => router.push("/practice")}
              />
              <ListItem
                title="Interview readiness"
                subtitle="Your AI mock sessions and scorecards"
                left={<TileIcon icon="mic" />}
                showChevron
                onPress={() => router.push("/interviews")}
              />
              <ListItem
                title="Quizzes"
                subtitle="Class quizzes and catalog"
                left={<TileIcon icon="check-square" />}
                showChevron
                onPress={() => router.push("/quizzes")}
              />
              <ListItem
                title="Compete"
                subtitle="Live contests across your classes"
                left={<TileIcon icon="zap" />}
                showChevron
                onPress={() => router.push("/contests" as Href)}
              />
              <ListItem
                title="Job Map"
                subtitle="Openings near you & remote, on a map"
                left={<TileIcon icon="map-pin" />}
                showChevron
                onPress={() => router.push("/jobs" as Href)}
              />
              <ListItem
                title="Timetable"
                subtitle="Your weekly class schedule"
                left={<TileIcon icon="grid" />}
                showChevron
                onPress={() => router.push("/timetable" as Href)}
              />
              <ListItem
                title="Schedule"
                subtitle="Deadlines & due dates"
                left={<TileIcon icon="calendar" />}
                showChevron
                divider={false}
                onPress={() => router.push("/schedule" as Href)}
              />
            </Card>

            {data && data.purchasedSeries.length > 0 ? (
              <>
                <View style={{ height: space[8] }} />
                <SectionHeader title="Your test series" />
                <Card padded={false} style={{ paddingHorizontal: space[4] }}>
                  {data.purchasedSeries.slice(0, 4).map((s, i) => (
                    <ListItem
                      key={s.id}
                      title={s.title}
                      subtitle={`${s.totalTests ?? 0} tests · ${s.totalQuestions ?? 0} questions`}
                      left={<TileIcon icon="file-text" />}
                      divider={i < Math.min(data.purchasedSeries.length, 4) - 1}
                    />
                  ))}
                </Card>
              </>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text variant="footnote" style={{ color: "rgba(255,255,255,0.8)" }}>
        {label}
      </Text>
      <Text variant="bodyEm" style={{ color: "#ffffff" }}>
        {value}
      </Text>
    </View>
  );
}

function TileIcon({ icon }: { icon: React.ComponentProps<typeof Icon>["name"] }) {
  const c = useColors();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: c.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={20} color="textMuted" />
    </View>
  );
}
