import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Card,
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
import { GradientHero, LivePill } from "@/design/bold";

interface Contest {
  id: string;
  classId: string;
  classLabel: string;
  title: string;
  start: number | null;
  end: number | null;
  qs: number;
  marks: number;
  minutes: number;
  status: "live" | "upcoming" | "ended";
}

const ms = (s: string | null | undefined) => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
};

function countdown(toMs: number) {
  const d = Math.max(0, toMs - Date.now());
  const h = Math.floor(d / 3_600_000);
  const m = Math.floor((d % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function whenLabel(toMs: number) {
  const d = new Date(toMs);
  let h = d.getHours();
  const min = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const diff = Math.round((new Date(toMs).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  const day = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : WEEKDAY[d.getDay()];
  return `${day} · ${h}:${String(min).padStart(2, "0")} ${ap}`;
}

export default function ContestsScreen() {
  const c = useColors();
  const router = useRouter();
  const [items, setItems] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const now = Date.now();
      const { classes } = await api.myEnrollments();
      const byId = new Map<string, string>();
      for (const cl of classes || []) {
        if (cl.classId && !byId.has(cl.classId)) byId.set(cl.classId, cl.subject || cl.className);
      }
      const ids = Array.from(byId.keys());
      const pages = await Promise.all(ids.map((id) => api.classPageData(id).catch(() => null)));
      const out: Contest[] = [];
      pages.forEach((p, i) => {
        if (!p) return;
        const classId = ids[i];
        for (const r of p.content?.contests || []) {
          const start = ms(r.startTime);
          const end = ms(r.endTime);
          const status: Contest["status"] =
            start != null && end != null && now >= start && now <= end
              ? "live"
              : end != null && now > end
                ? "ended"
                : "upcoming";
          out.push({
            id: r.id,
            classId,
            classLabel: byId.get(classId) || p.class?.name || "",
            title: r.title,
            start,
            end,
            qs: r.totalQuestions || 0,
            marks: r.totalMarks || 0,
            minutes: r.timeLimitMinutes || r.duration || 0,
            status,
          });
        }
      });
      const rank = { live: 0, upcoming: 1, ended: 2 };
      out.sort((a, b) => rank[a.status] - rank[b.status] || (a.start ?? Infinity) - (b.start ?? Infinity));
      setItems(out);
    } catch (e: any) {
      setError(e?.message || "Couldn't load contests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const live = useMemo(() => items.filter((i) => i.status === "live"), [items]);
  const upcoming = useMemo(() => items.filter((i) => i.status === "upcoming"), [items]);
  const ended = useMemo(() => items.filter((i) => i.status === "ended"), [items]);

  const open = (ct: Contest) => router.push(`/contest/${ct.id}?classId=${ct.classId}`);

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
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="zap"
            title="No contests yet"
            body="Timed contests your classes run show up here — compete on the same clock as everyone else."
          />
        ) : (
          <>
            {live.length ? (
              <View style={{ marginBottom: space[6], gap: space[3] }}>
                {live.map((ct) => (
                  <PressableScale key={ct.id} onPress={() => open(ct)} scaleTo={0.99}>
                    <GradientHero variant="flare" style={{ paddingVertical: space[5] }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <LivePill />
                        <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)" }} numberOfLines={1}>
                          {ct.classLabel.toUpperCase()}
                        </Text>
                      </View>
                      <Text variant="title2" style={{ color: "#fff", marginTop: space[2] }} numberOfLines={2}>
                        {ct.title}
                      </Text>
                      {ct.end != null ? (
                        <Text variant="subhead" style={{ color: "#FFD8C6", fontWeight: "700", marginTop: space[1] }}>
                          ⏱ Ends in {countdown(ct.end)}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: "row", gap: space[2], marginTop: space[4] }}>
                        {[
                          [ct.qs, "QS"],
                          [ct.marks, "MARKS"],
                          [ct.minutes, "MIN"],
                        ].map(([n, l]) => (
                          <View
                            key={l as string}
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
                            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 9, fontWeight: "700", marginTop: 1 }}>
                              {l}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </GradientHero>
                  </PressableScale>
                ))}
              </View>
            ) : null}

            {upcoming.length ? (
              <View style={{ marginBottom: space[6] }}>
                <SectionHeader title={`Upcoming · ${upcoming.length}`} />
                <View style={{ gap: space[2] }}>
                  {upcoming.map((ct) => (
                    <ContestRow key={ct.id} ct={ct} onPress={() => open(ct)} />
                  ))}
                </View>
              </View>
            ) : null}

            {ended.length ? (
              <View style={{ marginBottom: space[6] }}>
                <SectionHeader title={`Past · ${ended.length}`} />
                <View style={{ gap: space[2] }}>
                  {ended.map((ct) => (
                    <ContestRow key={ct.id} ct={ct} onPress={() => open(ct)} />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function ContestRow({ ct, onPress }: { ct: Contest; onPress: () => void }) {
  const c = useColors();
  const ended = ct.status === "ended";
  return (
    <PressableScale onPress={onPress} scaleTo={0.99}>
      <Card padded={false} style={{ flexDirection: "row", alignItems: "center", padding: space[3], gap: space[3] }}>
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
          <Icon name={ended ? "flag" : "zap"} size={18} color="textMuted" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="subhead" numberOfLines={1}>
            {ct.title}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
            {[ct.classLabel, ct.qs ? `${ct.qs} Qs` : null, ct.minutes ? `${ct.minutes} min` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <Text variant="caption" style={{ fontWeight: "700", color: ended ? c.textSubtle : c.textMuted }}>
          {ended ? "Ended" : ct.start != null ? whenLabel(ct.start) : "—"}
        </Text>
      </Card>
    </PressableScale>
  );
}
