import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { api, type TimetableEntry } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  ListSkeleton,
  PressableScale,
  Screen,
  ScreenScroll,
  SectionHeader,
  Text,
} from "@/design/ui";
import { GradientHero } from "@/design/bold";

const DAYS = [
  { key: "mon", label: "Mon", full: "Monday" },
  { key: "tue", label: "Tue", full: "Tuesday" },
  { key: "wed", label: "Wed", full: "Wednesday" },
  { key: "thu", label: "Thu", full: "Thursday" },
  { key: "fri", label: "Fri", full: "Friday" },
  { key: "sat", label: "Sat", full: "Saturday" },
] as const;

// JS getDay(): 0=Sun … 6=Sat
const JS_DAY_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export default function TimetableScreen() {
  const c = useColors();
  const router = useRouter();
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = JS_DAY_TO_KEY[new Date().getDay()];
  const [day, setDay] = useState<string>(DAYS.some((d) => d.key === today) ? today : "mon");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.timetable();
      setEntries(res.entries || []);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your timetable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const m: Record<string, TimetableEntry[]> = {};
    for (const e of entries) (m[e.day] ||= []).push(e);
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [entries]);

  const slots = byDay[day] || [];
  const selectedDay = DAYS.find((d) => d.key === day);

  return (
    <Screen edges={["bottom"]}>
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
        {!loading && !error && entries.length > 0 ? (
          <GradientHero variant="signal" style={{ marginBottom: space[5], paddingVertical: space[5] }}>
            <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>
              This week
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[2], marginTop: 2 }}>
              <Text variant="display" style={{ color: "#ffffff" }}>
                {entries.length}
              </Text>
              <Text variant="subhead" style={{ color: "rgba(255,255,255,0.85)" }}>
                {entries.length === 1 ? "class scheduled" : "classes scheduled"}
              </Text>
            </View>
          </GradientHero>
        ) : null}

        {/* Cross-link to the deadlines feed (the other half of "time-bound"). */}
        <PressableScale onPress={() => router.push("/schedule")} scaleTo={0.99} style={{ marginBottom: space[5] }}>
          <Card
            padded={false}
            style={{ flexDirection: "row", alignItems: "center", padding: space[3], gap: space[3] }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radius.md,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.surfaceAlt,
              }}
            >
              <Icon name="clock" size={18} color="textMuted" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="subhead">Deadlines & due dates</Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                Contests, tests, quizzes & projects coming up
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color="textSubtle" />
          </Card>
        </PressableScale>

        {/* Day selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space[2], paddingBottom: space[5] }}
        >
          {DAYS.map((d) => {
            const count = byDay[d.key]?.length || 0;
            return (
              <Chip
                key={d.key}
                label={count ? `${d.label} ${count}` : d.label}
                selected={d.key === day}
                onPress={() => setDay(d.key)}
              />
            );
          })}
        </ScrollView>

        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No timetable yet"
            body="Once your teachers set class times, your weekly schedule shows up here."
          />
        ) : (
          <>
            <SectionHeader title={`${selectedDay?.full ?? ""} · ${slots.length}`} />
            {slots.length === 0 ? (
              <Text variant="footnote" color="textMuted" style={{ paddingVertical: space[4] }}>
                No classes on this day.
              </Text>
            ) : (
              <View style={{ gap: space[3] }}>
                {slots.map((s, i) => (
                  <Card
                    key={`${s.classId}-${i}`}
                    padded={false}
                    onPress={() => router.push(`/class/${s.classId}`)}
                    style={{ flexDirection: "row", overflow: "hidden" }}
                  >
                    <View style={{ width: 4, backgroundColor: c.accent }} />
                    <View style={{ flex: 1, padding: space[4] }}>
                      <Text variant="caption" color="accentText">
                        {s.startTime}–{s.endTime}
                      </Text>
                      <Text variant="bodyEm" numberOfLines={1} style={{ marginTop: 2 }}>
                        {s.subject}
                      </Text>
                      <Text variant="footnote" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
                        {[s.teacherName, s.room, s.sectionName].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
