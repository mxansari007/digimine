import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  type IconName,
  ListSkeleton,
  PressableScale,
  Screen,
  ScreenScroll,
  SectionHeader,
  Text,
} from "@/design/ui";
import { GradientHero, LivePill } from "@/design/bold";

// Aggregated "everything time-bound" feed — contests, mock tests, quizzes,
// project deadlines and scheduled interviews across all the student's classes.
// There's no single deadlines endpoint, so we fan out over the per-class
// page-data and merge client-side.

type Kind = "contest" | "test" | "quiz" | "project" | "interview";

interface Item {
  id: string;
  kind: Kind;
  title: string;
  classId: string | null;
  classLabel: string | null;
  start: number | null; // ms epoch of the due / start moment
  end: number | null;
  meta: string;
  live: boolean;
}

const KIND_ICON: Record<Kind, IconName> = {
  contest: "zap",
  test: "file-text",
  quiz: "target",
  project: "package",
  interview: "mic",
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ms = (s: string | null | undefined) => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
};

function fmtTime(ts: number) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

function dayDiff(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

// Bucket order matters — earliest/most-urgent first.
const BUCKETS = ["Overdue", "Today", "Tomorrow", "This week", "Later"] as const;
type Bucket = (typeof BUCKETS)[number];

function bucketOf(it: Item): Bucket {
  if (it.live) return "Today";
  if (it.start == null) return "Later";
  const diff = dayDiff(it.start);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 7) return "This week";
  return "Later";
}

function rightLabel(it: Item): string {
  if (it.live) return "LIVE";
  if (it.start == null) return "—";
  const diff = dayDiff(it.start);
  if (diff === 0) return fmtTime(it.start);
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff <= 6) return WEEKDAY[new Date(it.start).getDay()];
  const d = new Date(it.start);
  return `${d.getDate()} ${MONTH[d.getMonth()]}`;
}

export default function ScheduleScreen() {
  const c = useColors();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const now = Date.now();
      const { classes } = await api.myEnrollments();
      // Several subject rows can share one classId (institute sections) — dedupe.
      const byId = new Map<string, string>();
      for (const cl of classes || []) {
        if (cl.classId && !byId.has(cl.classId)) byId.set(cl.classId, cl.subject || cl.className);
      }
      const ids = Array.from(byId.keys());

      const [pages, interviews] = await Promise.all([
        Promise.all(ids.map((id) => api.classPageData(id).catch(() => null))),
        api.interviewSessions().catch(() => null),
      ]);

      const out: Item[] = [];
      pages.forEach((p, i) => {
        if (!p) return;
        const classId = ids[i];
        const classLabel = byId.get(classId) || p.class?.name || null;
        const push = (kind: Kind, row: any, meta: string) => {
          const start = ms(row.startTime) ?? ms(row.dueAt);
          const end = ms(row.endTime);
          const live = kind === "contest" && start != null && end != null && now >= start && now <= end;
          // Only time-bound items belong on a deadlines feed.
          if (start == null && !live) return;
          out.push({
            id: `${kind}:${row.id}`,
            kind,
            title: row.title,
            classId,
            classLabel,
            start,
            end,
            meta,
            live,
          });
        };
        (p.content?.contests || []).forEach((r) => push("contest", r, "Contest"));
        (p.content?.tests || []).forEach((r) =>
          push("test", r, r.timeLimitMinutes || r.duration ? `${r.timeLimitMinutes || r.duration} min` : "Mock test")
        );
        (p.content?.quizzes || []).forEach((r) =>
          push("quiz", r, r.totalQuestions ? `${r.totalQuestions} Qs` : "Quiz")
        );
        (p.content?.projectEvals || []).forEach((r) =>
          push("project", { ...r, startTime: null, dueAt: r.dueAt }, "Project · due")
        );
      });

      for (const s of interviews?.items || []) {
        if (s.status !== "scheduled" || !s.scheduledAt) continue;
        out.push({
          id: `interview:${s.id}`,
          kind: "interview",
          title: s.problemTitle || "AI mock interview",
          classId: null,
          classLabel: "AI interview",
          start: ms(s.scheduledAt),
          end: null,
          meta: s.interviewType || "scheduled",
          live: false,
        });
      }

      out.sort((a, b) => {
        if (a.live !== b.live) return a.live ? -1 : 1;
        return (a.start ?? Infinity) - (b.start ?? Infinity);
      });
      setItems(out);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your schedule.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const classChips = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of items) if (it.classId && it.classLabel && !seen.has(it.classId)) seen.set(it.classId, it.classLabel);
    return Array.from(seen, ([id, label]) => ({ id, label }));
  }, [items]);

  const grouped = useMemo(() => {
    const shown = classFilter ? items.filter((it) => it.classId === classFilter) : items;
    const g: Record<Bucket, Item[]> = { Overdue: [], Today: [], Tomorrow: [], "This week": [], Later: [] };
    for (const it of shown) g[bucketOf(it)].push(it);
    return g;
  }, [items, classFilter]);

  const liveCount = items.filter((it) => it.live).length;
  const total = items.length;

  const onTap = (it: Item) => {
    if (it.kind === "interview") router.push("/interviews");
    else if (it.classId) router.push(`/class/${it.classId}`);
  };

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
        {!loading && !error && total > 0 ? (
          <GradientHero
            variant={liveCount ? "flare" : "signal"}
            style={{ marginBottom: space[5], paddingVertical: space[5] }}
          >
            {liveCount ? (
              <View style={{ marginBottom: space[2] }}>
                <LivePill label={`${liveCount} LIVE`} />
              </View>
            ) : (
              <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>
                Across all your classes
              </Text>
            )}
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[2], marginTop: 2 }}>
              <Text variant="display" style={{ color: "#ffffff" }}>
                {total}
              </Text>
              <Text variant="subhead" style={{ color: "rgba(255,255,255,0.9)" }}>
                {total === 1 ? "thing coming up" : "things coming up"}
              </Text>
            </View>
          </GradientHero>
        ) : null}

        {classChips.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space[2], paddingBottom: space[5] }}
          >
            <Chip label="All" selected={classFilter == null} onPress={() => setClassFilter(null)} />
            {classChips.map((cl) => (
              <Chip
                key={cl.id}
                label={cl.label}
                selected={classFilter === cl.id}
                onPress={() => setClassFilter(cl.id)}
              />
            ))}
          </ScrollView>
        ) : null}

        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : total === 0 ? (
          <EmptyState
            icon="calendar"
            title="Nothing scheduled"
            body="Contests, mock tests, quiz windows, project deadlines and booked interviews from your classes show up here."
          />
        ) : (
          BUCKETS.map((b) =>
            grouped[b].length ? (
              <View key={b} style={{ marginBottom: space[5] }}>
                <SectionHeader title={`${b} · ${grouped[b].length}`} />
                <View style={{ gap: space[2] }}>
                  {grouped[b].map((it) => (
                    <DueRow key={it.id} item={it} onPress={() => onTap(it)} />
                  ))}
                </View>
              </View>
            ) : null
          )
        )}
      </ScreenScroll>
    </Screen>
  );
}

function DueRow({ item, onPress }: { item: Item; onPress: () => void }) {
  const c = useColors();
  const overdue = !item.live && item.start != null && dayDiff(item.start) < 0;
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
            backgroundColor: item.live ? c.flare : c.surfaceAlt,
          }}
        >
          <Icon name={KIND_ICON[item.kind]} size={18} tint={item.live ? "#fff" : c.textMuted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="subhead" numberOfLines={1}>
            {item.title}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
            {[item.classLabel, item.meta].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {item.live ? (
          <LivePill />
        ) : (
          <Text
            variant="caption"
            style={{ fontWeight: "700", color: overdue ? c.danger : c.textMuted }}
          >
            {rightLabel(item)}
          </Text>
        )}
      </Card>
    </PressableScale>
  );
}
