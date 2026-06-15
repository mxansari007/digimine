import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, type ClassContentRow } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Icon,
  ListSkeleton,
  Screen,
  ScreenScroll,
  SectionHeader,
  Text,
} from "@/design/ui";
import { GradientHero, LivePill } from "@/design/bold";

const ms = (s: string | null | undefined) => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
};

function fmtFull(toMs: number) {
  const d = new Date(toMs);
  let h = d.getHours();
  const min = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const diff = Math.round((new Date(toMs).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  const day =
    diff === 0
      ? "Today"
      : diff === 1
        ? "Tomorrow"
        : `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}`;
  return `${day} · ${h}:${String(min).padStart(2, "0")} ${ap}`;
}

function clock(deltaMs: number) {
  const d = Math.max(0, Math.floor(deltaMs / 1000));
  const h = Math.floor(d / 3600);
  const m = Math.floor((d % 3600) / 60);
  const s = d % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export default function ContestDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { contestId, classId } = useLocalSearchParams<{ contestId: string; classId: string }>();
  const [row, setRow] = useState<ClassContentRow | null>(null);
  const [className, setClassName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!classId || !contestId) {
      setError("Missing contest.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const page = await api.classPageData(String(classId));
      const found = (page.content?.contests || []).find((r) => r.id === contestId) || null;
      setRow(found);
      setClassName(page.class?.name || "");
      if (!found) setError("Contest not found.");
    } catch (e: any) {
      setError(e?.message || "Couldn't load this contest.");
    } finally {
      setLoading(false);
    }
  }, [classId, contestId]);

  useEffect(() => {
    load();
  }, [load]);

  // Tick the countdown once a second while the screen is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <Screen edges={["bottom"]}>
        <ListSkeleton rows={5} />
      </Screen>
    );
  }
  if (error || !row) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorState message={error || "Contest not found."} onRetry={load} />
      </Screen>
    );
  }

  const start = ms(row.startTime);
  const end = ms(row.endTime);
  const status = start != null && end != null && now >= start && now <= end ? "live" : end != null && now > end ? "ended" : "upcoming";
  const stats: [number, string][] = [
    [row.totalQuestions || 0, "QS"],
    [row.totalMarks || 0, "MARKS"],
    [row.timeLimitMinutes || row.duration || 0, "MIN"],
  ];

  return (
    <Screen edges={["bottom"]}>
      <ScreenScroll>
        <GradientHero
          variant={status === "live" ? "flare" : status === "ended" ? "ink" : "signal"}
          style={{ paddingVertical: space[5], marginBottom: space[5] }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            {status === "live" ? (
              <LivePill />
            ) : (
              <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)", fontWeight: "700" }}>
                {status === "ended" ? "ENDED" : "UPCOMING"}
              </Text>
            )}
            {className ? (
              <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)" }} numberOfLines={1}>
                {className.toUpperCase()}
              </Text>
            ) : null}
          </View>
          <Text variant="title1" style={{ color: "#fff", marginTop: space[2] }} numberOfLines={2}>
            {row.title}
          </Text>
          {status === "live" && end != null ? (
            <Text variant="bodyEm" style={{ color: "#FFD8C6", marginTop: space[1] }}>
              ⏱ Ends in {clock(end - now)}
            </Text>
          ) : status === "upcoming" && start != null ? (
            <Text variant="bodyEm" style={{ color: "rgba(255,255,255,0.92)", marginTop: space[1] }}>
              Starts in {clock(start - now)}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: space[2], marginTop: space[4] }}>
            {stats.map(([n, l]) => (
              <View
                key={l}
                style={{
                  flex: 1,
                  backgroundColor: "rgba(255,255,255,0.16)",
                  borderRadius: radius.md,
                  paddingVertical: space[2],
                  alignItems: "center",
                }}
              >
                <Text variant="bodyEm" style={{ color: "#fff" }}>
                  {n}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 9, fontWeight: "700", marginTop: 1 }}>{l}</Text>
              </View>
            ))}
          </View>
        </GradientHero>

        {/* Live window */}
        <SectionHeader title="Window" />
        <Card style={{ marginBottom: space[5] }}>
          <Row k="Starts" v={start != null ? fmtFull(start) : "—"} />
          <View style={{ marginVertical: space[3] }}>
            <Divider />
          </View>
          <Row k="Ends" v={end != null ? fmtFull(end) : "—"} live={status === "live"} />
        </Card>

        {/* Contests are taken on the web; mobile sends you to the class hub. */}
        <Button
          label={status === "live" ? "Open in class" : "View class"}
          variant={status === "live" ? "primary" : "secondary"}
          fullWidth
          leftIcon={status === "live" ? "zap" : "external-link"}
          onPress={() => router.push(`/class/${classId}`)}
          style={{ marginBottom: space[3] }}
        />

        <View style={{ gap: space[2], marginBottom: space[6] }}>
          {["Same end time for everyone", "One attempt per student", "Final ranking after it ends"].map((b) => (
            <View key={b} style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
              <Icon name="check" size={16} color="success" />
              <Text variant="footnote" color="textMuted">
                {b}
              </Text>
            </View>
          ))}
        </View>

        {/* Leaderboard — no standings endpoint yet, so state honestly. */}
        <SectionHeader title="Leaderboard" />
        <EmptyState
          icon="bar-chart-2"
          title={status === "ended" ? "Standings coming soon" : "Standings open after it ends"}
          body={
            status === "ended"
              ? "Final rankings for this contest aren't available on mobile yet."
              : "Everyone finishes on the same clock — the ranked leaderboard appears once the window closes."
          }
        />
      </ScreenScroll>
    </Screen>
  );
}

function Row({ k, v, live }: { k: string; v: string; live?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text variant="subhead" color="textMuted">
        {k}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <Text variant="subhead" style={{ fontWeight: "700" }}>
          {v}
        </Text>
        {live ? <LivePill /> : null}
      </View>
    </View>
  );
}
