import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api, type ClassContentRow, type ClassPageData, type ClassProjectEvalRow } from "@/lib/api";
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
  Screen,
  ScreenScroll,
  Text,
} from "@/design/ui";

// Mobile is a MONITOR view: teachers create / edit / assign content on the web
// dashboard. Here they review what each class actually has, lane by lane.

type LaneKey = "quizzes" | "tests" | "contests" | "courses" | "projectEvals";

const LANES: { key: LaneKey; label: string; icon: IconName }[] = [
  { key: "quizzes", label: "Quizzes", icon: "target" },
  { key: "tests", label: "Tests", icon: "file-text" },
  { key: "contests", label: "Contests", icon: "zap" },
  { key: "courses", label: "Courses", icon: "book-open" },
  { key: "projectEvals", label: "Projects", icon: "package" },
];

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ms = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
};

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTH[d.getMonth()]}`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Real sub-line of meta per content row — never fabricated. */
function contentMeta(key: LaneKey, row: ClassContentRow): string {
  const bits: string[] = [];
  if (key === "quizzes") {
    if (row.totalQuestions) bits.push(`${row.totalQuestions} Qs`);
    if (row.totalMarks) bits.push(`${row.totalMarks} marks`);
  } else if (key === "tests") {
    const mins = row.timeLimitMinutes || row.duration;
    if (mins) bits.push(`${mins} min`);
    if (row.totalQuestions) bits.push(`${row.totalQuestions} Qs`);
    else if (row.totalTests) bits.push(`${row.totalTests} sections`);
  } else if (key === "contests") {
    if (row.totalQuestions) bits.push(`${row.totalQuestions} problems`);
    if (row.totalMarks) bits.push(`${row.totalMarks} marks`);
  } else if (key === "courses") {
    if (row.totalLessons) bits.push(`${row.totalLessons} lessons`);
    if (row.totalModules) bits.push(`${row.totalModules} modules`);
    if (row.estimatedHours) bits.push(`${row.estimatedHours}h`);
  }
  if (row.category) bits.push(row.category);
  if (row.difficulty) bits.push(row.difficulty);
  return bits.join(" · ");
}

function projectMeta(row: ClassProjectEvalRow): string {
  const bits: string[] = [];
  const lead = row.brief || row.techStack;
  if (lead) bits.push(lead);
  if (row.maxTotalScore) bits.push(`${row.maxTotalScore} pts`);
  const due = ms(row.dueAt);
  if (due != null) bits.push(`due ${fmtDate(due)}`);
  return bits.join(" · ");
}

/** Scheduled window pill (start → end) when a row carries one. */
function windowLabel(row: ClassContentRow): string | null {
  const start = ms(row.startTime);
  if (start == null) return null;
  const end = ms(row.endTime);
  const startStr = `${fmtDate(start)}, ${fmtTime(start)}`;
  if (end == null) return startStr;
  // Same calendar day → only repeat the time on the right side.
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString();
  return `${startStr} → ${sameDay ? fmtTime(end) : `${fmtDate(end)}, ${fmtTime(end)}`}`;
}

export default function TeacherClassContent() {
  const c = useColors();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const [page, setPage] = useState<ClassPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<LaneKey | null>(null);

  const load = useCallback(async () => {
    if (!classId) return;
    setError(null);
    try {
      setPage(await api.classPageData(String(classId)));
    } catch (e: any) {
      setError(e?.message || "Couldn't load this class's content.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  // Default the segmented control to the first lane that actually has items.
  const firstNonEmpty = useMemo<LaneKey>(() => {
    if (!page) return "quizzes";
    return LANES.find((l) => (page.counts[l.key] || 0) > 0)?.key ?? "quizzes";
  }, [page]);

  const selected: LaneKey = active ?? firstNonEmpty;

  if (loading) {
    return (
      <Screen edges={["bottom"]}>
        <ListSkeleton rows={6} />
      </Screen>
    );
  }
  if (error || !page) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorState message={error || "Content not found."} onRetry={load} />
      </Screen>
    );
  }

  const totalCount = LANES.reduce((a, l) => a + (page.counts[l.key] || 0), 0);
  const selectedLane = LANES.find((l) => l.key === selected)!;
  const items =
    selected === "projectEvals" ? page.content.projectEvals : (page.content[selected] as ClassContentRow[]);

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
        {/* Class name eyebrow + honest "create on web" note */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: space[3],
            marginBottom: space[4],
          }}
        >
          <Text variant="caption" color="textSubtle" style={{ textTransform: "uppercase", flex: 1 }} numberOfLines={1}>
            {page.class.name}
          </Text>
          <Text variant="caption" color="textSubtle">
            Create on web
          </Text>
        </View>

        {/* Count lanes — one small tile per content type (footprint row) */}
        <View style={{ flexDirection: "row", gap: space[2], marginBottom: space[6] }}>
          {LANES.map((l) => {
            const n = page.counts[l.key] || 0;
            const on = l.key === selected;
            return (
              <Card
                key={l.key}
                onPress={() => setActive(l.key)}
                padded={false}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: space[3],
                  paddingHorizontal: space[1],
                  backgroundColor: on ? c.accentSubtle : c.surface,
                  borderColor: on ? c.accent : c.border,
                }}
              >
                <Icon name={l.icon} size={18} color={on ? "accentText" : "textMuted"} />
                <Text variant="bodyEm" color={on ? "accentText" : "text"} style={{ marginTop: space[1] }}>
                  {n}
                </Text>
                <Text variant="caption" color="textMuted" style={{ marginTop: 1 }} numberOfLines={1}>
                  {l.label}
                </Text>
              </Card>
            );
          })}
        </View>

        {totalCount === 0 ? (
          <EmptyState
            icon="layers"
            title="No content yet"
            body="Quizzes, tests, contests, courses and project evaluations assigned to this class will appear here."
          />
        ) : (
          <>
            {/* Type picker */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: space[2],
                marginBottom: space[5],
              }}
            >
              {LANES.map((l) => (
                <Chip
                  key={l.key}
                  label={`${l.label} ${page.counts[l.key] || 0}`}
                  selected={l.key === selected}
                  onPress={() => setActive(l.key)}
                />
              ))}
            </View>

            {/* Selected lane's items */}
            {items.length === 0 ? (
              <Card style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                <Icon name={selectedLane.icon} size={18} color="textSubtle" />
                <Text variant="footnote" color="textMuted">
                  Nothing here yet — {selectedLane.label.toLowerCase()} assigned to this class will show up here.
                </Text>
              </Card>
            ) : (
              <View style={{ gap: space[2] }}>
                {selected === "projectEvals"
                  ? (items as ClassProjectEvalRow[]).map((row) => (
                      <ProjectRow key={row.id} row={row} icon={selectedLane.icon} />
                    ))
                  : (items as ClassContentRow[]).map((row) => (
                      <ContentRow key={row.id} laneKey={selected} row={row} icon={selectedLane.icon} />
                    ))}
              </View>
            )}
          </>
        )}

        {/* Honest footer — no fake create/assign action on mobile */}
        <Card style={{ flexDirection: "row", gap: space[3], marginTop: space[6], backgroundColor: c.surfaceAlt }}>
          <Icon name="info" size={18} color="textMuted" />
          <Text variant="footnote" color="textMuted" style={{ flex: 1 }}>
            Create, edit and assign content from the PlacementRanker web dashboard. This view is for monitoring what
            your class has.
          </Text>
        </Card>
      </ScreenScroll>
    </Screen>
  );
}

function IconTile({ icon }: { icon: IconName }) {
  const c = useColors();
  return (
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
      <Icon name={icon} size={18} color="textMuted" />
    </View>
  );
}

function WindowPill({ label }: { label: string }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        alignSelf: "flex-start",
        marginTop: space[2],
        paddingHorizontal: space[2],
        paddingVertical: space[1],
        borderRadius: radius.full,
        backgroundColor: c.accentSubtle,
      }}
    >
      <Icon name="clock" size={12} color="accentText" />
      <Text variant="caption" color="accentText" style={{ fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
}

function ContentRow({ laneKey, row, icon }: { laneKey: LaneKey; row: ClassContentRow; icon: IconName }) {
  const meta = contentMeta(laneKey, row);
  const win = windowLabel(row);
  return (
    <Card padded={false} style={{ flexDirection: "row", alignItems: "flex-start", padding: space[3], gap: space[3] }}>
      <IconTile icon={icon} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="subhead" numberOfLines={1}>
          {row.title}
        </Text>
        {meta ? (
          <Text variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
            {meta}
          </Text>
        ) : null}
        {win ? <WindowPill label={win} /> : null}
      </View>
    </Card>
  );
}

function ProjectRow({ row, icon }: { row: ClassProjectEvalRow; icon: IconName }) {
  const c = useColors();
  const meta = projectMeta(row);
  return (
    <Card padded={false} style={{ flexDirection: "row", alignItems: "flex-start", padding: space[3], gap: space[3] }}>
      <IconTile icon={icon} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Text variant="subhead" numberOfLines={1} style={{ flex: 1 }}>
            {row.title}
          </Text>
          {row.status ? (
            <View
              style={{
                paddingHorizontal: space[2],
                paddingVertical: 2,
                borderRadius: radius.full,
                backgroundColor: c.surfaceAlt,
              }}
            >
              <Text variant="caption" color="textMuted" style={{ fontWeight: "600" }}>
                {row.status}
              </Text>
            </View>
          ) : null}
        </View>
        {meta ? (
          <Text variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 2 }}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
