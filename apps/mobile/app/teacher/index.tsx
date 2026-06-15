import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { api, type ClassOverview, type TeacherClass, type TeacherStats } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Card,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListSkeleton,
  PressableScale,
  Screen,
  ScreenScroll,
  ScreenHeader,
  SectionHeader,
  Text,
} from "@/design/ui";
import { Gauge, GradientHero } from "@/design/bold";

interface Section {
  cls: TeacherClass;
  overview: ClassOverview | null;
}

const riskTone = (n: number): "danger" | "warning" | "muted" =>
  n >= 4 ? "danger" : n >= 1 ? "warning" : "muted";

export default function TeacherDashboard() {
  const c = useColors();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [sections, setSections] = useState<Section[]>([]);
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [{ classes }, dash] = await Promise.all([
        api.teacherClasses(),
        api.teacherDashboard(user.uid).catch(() => null),
      ]);
      const live = (classes || []).filter((cl) => !cl.isArchived);
      const overviews = await Promise.all(live.map((cl) => api.classOverview(cl.id).catch(() => null)));
      setSections(live.map((cls, i) => ({ cls, overview: overviews[i] })));
      setStats(dash?.stats ?? null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const firstName = user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const agg = useMemo(() => {
    const withData = sections.filter((s) => s.overview && s.overview.insights.studentsWithData > 0);
    const avg =
      withData.length > 0
        ? Math.round(withData.reduce((a, s) => a + (s.overview!.insights.classAverage || 0), 0) / withData.length)
        : 0;
    const passRate =
      withData.length > 0
        ? Math.round(withData.reduce((a, s) => a + (s.overview!.insights.passRate || 0), 0) / withData.length)
        : 0;
    const active = sections.reduce((a, s) => a + (s.overview?.insights.activeStudents || 0), 0);
    const atRisk = sections.reduce((a, s) => a + (s.overview?.insights.atRiskCount || 0), 0);
    const students = stats?.totalStudents ?? sections.reduce((a, s) => a + (s.cls.studentsCount || 0), 0);
    return { avg, passRate, active, atRisk, students };
  }, [sections, stats]);

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
        <ScreenHeader
          eyebrow={greeting}
          title={firstName}
          trailing={<IconButton icon="log-out" onPress={() => signOut()} />}
        />

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <ListSkeleton rows={4} />
        ) : (
          <>
            {/* Teaching hero — aggregate across sections */}
            <GradientHero variant="ink" style={{ marginBottom: space[6] }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text variant="caption" style={{ color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>
                  Teaching
                </Text>
                <Text variant="caption" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {sections.length} {sections.length === 1 ? "section" : "sections"} · {agg.students} students
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], marginTop: space[2] }}>
                <Gauge value={agg.avg} size={116} label="CLASS AVG" tone="onHero" />
                <View style={{ flex: 1, gap: space[2] }}>
                  <GlassStat label="Active" value={String(agg.active)} />
                  <GlassStat label="Pass rate" value={`${agg.passRate}%`} />
                  <GlassStat label="At risk" value={`${agg.atRisk}`} alert={agg.atRisk > 0} />
                </View>
              </View>
            </GradientHero>

            {/* Content footprint */}
            {stats ? (
              <View style={{ flexDirection: "row", gap: space[2], marginBottom: space[6] }}>
                {[
                  [stats.totalQuizzes, "Quizzes"],
                  [stats.totalTests, "Tests"],
                  [stats.totalContests, "Contests"],
                  [stats.totalSubmissions, "Attempts"],
                ].map(([n, l]) => (
                  <Card key={l as string} style={{ flex: 1, alignItems: "center", paddingVertical: space[3] }}>
                    <Text variant="title3">{n as number}</Text>
                    <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                      {l as string}
                    </Text>
                  </Card>
                ))}
              </View>
            ) : null}

            <SectionHeader title="Your sections" />
            {sections.length === 0 ? (
              <EmptyState
                icon="users"
                title="No classes yet"
                body="Classes you teach — or are assigned to as a subject teacher — show up here."
              />
            ) : (
              <View style={{ gap: space[2] }}>
                {sections.map((s) => (
                  <SectionCard key={s.cls.id} section={s} onPress={() => router.push(`/teacher/class/${s.cls.id}` as Href)} />
                ))}
              </View>
            )}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function GlassStat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: alert ? "rgba(255,107,61,0.9)" : "rgba(255,255,255,0.12)",
        borderRadius: radius.md,
        paddingHorizontal: space[3],
        paddingVertical: space[2],
      }}
    >
      <Text variant="caption" style={{ color: alert ? "#fff" : "rgba(255,255,255,0.8)" }}>
        {label}
      </Text>
      <Text variant="bodyEm" style={{ color: "#fff" }}>
        {value}
      </Text>
    </View>
  );
}

function SectionCard({ section, onPress }: { section: Section; onPress: () => void }) {
  const c = useColors();
  const { cls, overview } = section;
  const title = cls.subject || cls.name;
  const ins = overview?.insights;
  const avg = ins ? Math.round(ins.classAverage) : null;
  const students = cls.studentsCount ?? ins?.rosterCount ?? 0;
  const atRisk = ins?.atRiskCount ?? 0;
  const tone = riskTone(atRisk);
  const letter = (cls.sectionName || title || "?").trim()[0]?.toUpperCase() || "?";

  return (
    <PressableScale onPress={onPress} scaleTo={0.99}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: radius.md,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.accentSubtle,
            }}
          >
            <Text variant="bodyEm" style={{ color: c.accentText }}>
              {letter}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="subhead" numberOfLines={1}>
              {cls.sectionName || title}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
              {[title, `${students} students`, avg != null ? `avg ${avg}` : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {atRisk > 0 ? (
            <View
              style={{
                paddingHorizontal: space[2],
                paddingVertical: 2,
                borderRadius: radius.full,
                backgroundColor: tone === "danger" ? c.dangerSubtle : c.warningSubtle,
              }}
            >
              <Text variant="caption" style={{ color: tone === "danger" ? c.danger : c.warning, fontWeight: "700" }}>
                {atRisk} ⚠
              </Text>
            </View>
          ) : (
            <Icon name="chevron-right" size={20} color="textSubtle" />
          )}
        </View>
        {avg != null ? (
          <View style={{ marginTop: space[3] }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space[1] }}>
              <Text variant="caption" color="textSubtle" style={{ textTransform: "uppercase" }}>
                Class average
              </Text>
              <Text variant="caption" color="textMuted" style={{ fontWeight: "700" }}>
                {avg}%
              </Text>
            </View>
            <View style={{ height: 7, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: "hidden" }}>
              <View
                style={{ height: 7, width: `${Math.min(100, avg)}%`, borderRadius: radius.full, backgroundColor: c.accent }}
              />
            </View>
          </View>
        ) : null}
      </Card>
    </PressableScale>
  );
}
