import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, RefreshControl, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  api,
  ApiError,
  type ClassContentRow,
  type ClassPageData,
  type ClassProjectEvalRow,
  type ClassThread,
} from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Avatar,
  Card,
  Chip,
  EmptyState,
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
import { shortDate, shortDateTime, timeAgo } from "@/lib/format";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
const LANE_PREVIEW = 3;
const NEW_WINDOW_MS = 14 * 24 * 3600 * 1000;

type Phase = "live" | "upcoming" | "ended";
function contestPhase(r: ClassContentRow, now = Date.now()): Phase {
  const start = r.startTime ? new Date(r.startTime).getTime() : null;
  const end = r.endTime ? new Date(r.endTime).getTime() : null;
  if (start && now < start) return "upcoming";
  if (end && now > end) return "ended";
  if (start && (!end || now <= end)) return "live";
  return "upcoming";
}

const metaFor = {
  test: (r: ClassContentRow) =>
    [r.totalTests ? `${r.totalTests} test${r.totalTests === 1 ? "" : "s"}` : null, r.totalQuestions ? `${r.totalQuestions} questions` : null, r.totalMarks ? `${r.totalMarks} marks` : null, r.duration ? `${r.duration} min` : null].filter(Boolean).join(" · ") || "Mock test series",
  quiz: (r: ClassContentRow) =>
    [r.totalQuestions ? `${r.totalQuestions} questions` : null, r.totalMarks ? `${r.totalMarks} marks` : null, r.timeLimitMinutes ? `${r.timeLimitMinutes} min` : null].filter(Boolean).join(" · ") || "Quiz",
  contest: (r: ClassContentRow) => {
    const p = contestPhase(r);
    if (p === "live") return `Live now · ends ${shortDateTime(r.endTime)}`;
    if (p === "upcoming") return `Starts ${shortDateTime(r.startTime)}`;
    return `Ended ${shortDate(r.endTime)}`;
  },
  course: (r: ClassContentRow) =>
    [r.totalModules ? `${r.totalModules} chapters` : null, r.totalLessons ? `${r.totalLessons} lessons` : null, r.estimatedHours ? `~${r.estimatedHours} hrs` : null, r.difficulty].filter(Boolean).join(" · ") || "Course",
};

type UpNextEntry = { key: string; label: string; tone: "live" | "due" | "new"; title: string; meta: string; onPress: () => void };

export default function ClassHubScreen() {
  const router = useRouter();
  const c = useColors();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const [data, setData] = useState<ClassPageData | null>(null);
  const [notices, setNotices] = useState<ClassThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) return;
    setError(null);
    try {
      const [res, threads] = await Promise.all([
        api.classPageData(classId),
        api.classThreads(classId, { sort: "new" }).then((r) => r.threads || []).catch(() => [] as ClassThread[]),
      ]);
      setData(res);
      // Noticeboard = teacher's broadcast surface: announcements + teacher-shared resources.
      setNotices(threads.filter((t) => t.tag === "announcement" || (t.tag === "resource" && t.authorRole !== "student")).slice(0, 4));
    } catch (e: any) {
      setError(e?.message || "Couldn't load this class.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const startQuiz = async (quiz: ClassContentRow) => {
    if (startingId) return;
    setStartingId(quiz.id);
    try {
      const { attempt } = await api.startQuizAttempt(quiz.id);
      router.push(`/quiz/${attempt.id}`);
    } catch (e: any) {
      if (e instanceof ApiError && (e.status === 402 || e.status === 403)) setError(e.body?.error || "This quiz isn't available on your plan.");
      else setError(e?.message || "Couldn't start the quiz.");
    } finally {
      setStartingId(null);
    }
  };

  const openCourse = (cr: ClassContentRow) =>
    router.push({ pathname: "/course/[courseId]", params: { courseId: cr.id, classId: String(classId), title: cr.title } });
  const openType = (type: string) => router.push({ pathname: "/class/[classId]/content/[type]", params: { classId: String(classId), type } });

  // Up Next — schedule rail: live/upcoming contests, due projects, new tests/quizzes.
  const upNext = useMemo<UpNextEntry[]>(() => {
    if (!data) return [];
    const now = Date.now();
    const out: UpNextEntry[] = [];
    data.content.contests.forEach((ct) => {
      const p = contestPhase(ct, now);
      if (p === "live") out.push({ key: `c-${ct.id}`, label: "LIVE", tone: "live", title: ct.title, meta: metaFor.contest(ct), onPress: () => openType("contests") });
      else if (p === "upcoming") out.push({ key: `c-${ct.id}`, label: shortDate(ct.startTime).toUpperCase(), tone: "due", title: ct.title, meta: metaFor.contest(ct), onPress: () => openType("contests") });
    });
    data.content.projectEvals.forEach((ev) => {
      const sub = ev.mySubmission;
      if (sub && sub.status !== "failed") return;
      const overdue = ev.dueAt && new Date(ev.dueAt).getTime() < now;
      if (overdue && !sub) return;
      out.push({ key: `e-${ev.id}`, label: sub?.status === "failed" ? "RETRY" : ev.dueAt ? `DUE ${shortDate(ev.dueAt).toUpperCase()}` : "OPEN", tone: "due", title: ev.title, meta: `Project · ${ev.maxTotalScore} marks`, onPress: () => openType("projectEvals") });
    });
    [...data.content.tests, ...data.content.quizzes]
      .filter((r) => r.createdAt && now - new Date(r.createdAt).getTime() < NEW_WINDOW_MS)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 2)
      .forEach((r) => {
        const isTest = data.content.tests.includes(r);
        out.push({ key: `${isTest ? "t" : "q"}-${r.id}`, label: "NEW", tone: "new", title: r.title, meta: isTest ? metaFor.test(r) : metaFor.quiz(r), onPress: () => (isTest ? openType("tests") : startQuiz(r)) });
      });
    const rank = { live: 0, due: 1, new: 2 } as const;
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: "Classroom" }} />
        <ListSkeleton rows={6} />
      </Screen>
    );
  }
  if (!data || !data.enrolled) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: "Classroom" }} />
        <EmptyState icon="alert-circle" title={error ? "Couldn't load this class" : "You're not in this class"} body={error || "Join with the invite code from the Classes tab first."} />
      </Screen>
    );
  }

  const teacherName = data.teacher.profile?.name || data.teacher.profile?.fullName || data.teacher.profile?.displayName || "Your teacher";
  const counts = data.counts;
  const totalItems = counts.quizzes + counts.tests + counts.contests + counts.courses + counts.projectEvals;

  const toneColor = (t: UpNextEntry["tone"]) => (t === "live" ? c.danger : t === "due" ? c.warning : c.accentText);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: data.class.name }} />
      <ScreenScroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.textSubtle} />}>
        {/* Identity hero */}
        <GradientHero variant="signal" style={{ marginBottom: space[6] }}>
          <Text variant="title2" numberOfLines={2} style={{ color: "#ffffff" }}>
            {data.class.name}
          </Text>
          <Text
            variant="footnote"
            numberOfLines={1}
            style={{ color: "rgba(255,255,255,0.85)", marginTop: space[1] }}
          >
            {teacherName}
            {data.teacher.profile?.institute ? ` · ${data.teacher.profile.institute}` : ""}
          </Text>
          {totalItems > 0 ? (
            <Text
              variant="caption"
              style={{ color: "rgba(255,255,255,0.75)", marginTop: space[2], textTransform: "uppercase" }}
            >
              {totalItems} item{totalItems === 1 ? "" : "s"} posted
            </Text>
          ) : null}
        </GradientHero>

        {/* Noticeboard */}
        {notices.length > 0 ? (
          <View style={{ marginBottom: space[8] }}>
            <SectionHeader
              title="Noticeboard"
              action={<Text variant="footnote" color="accentText" onPress={() => router.push(`/class/${classId}/threads`)}>All notices</Text>}
            />
            <View style={{ backgroundColor: c.accentSubtle, borderWidth: 0.5, borderColor: c.accent, borderRadius: radius.lg, overflow: "hidden" }}>
              {notices.map((n, i) => (
                <PressableScale key={n.id} onPress={() => router.push(`/class/${classId}/thread/${n.id}`)} scaleTo={0.995} style={{ flexDirection: "row", alignItems: "flex-start", gap: space[3], padding: space[3], borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: c.accent }}>
                  <Avatar name={n.authorName} role={n.authorRole} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                      <Chip label={n.tag === "resource" ? "Resource" : "Announcement"} tone={n.tag === "resource" ? "success" : "warning"} />
                      {n.isPinned ? <Text variant="caption" color="warning" style={{ fontWeight: "700" }}>PINNED</Text> : null}
                    </View>
                    <Text variant="subhead" numberOfLines={1} style={{ marginTop: space[1] }}>{n.title}</Text>
                    <Text variant="caption" color="textSubtle" numberOfLines={1} style={{ marginTop: 2 }}>
                      {n.authorName}{n.authorRole !== "student" ? " · Teacher" : ""} · {timeAgo(n.lastActivityAt || n.createdAt)}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color="textSubtle" />
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}

        {error ? <Text variant="footnote" color="danger" style={{ marginBottom: space[4] }}>{error}</Text> : null}

        {/* Up Next rail */}
        {upNext.length > 0 ? (
          <View style={{ marginBottom: space[8] }}>
            <SectionHeader title="Up next" />
            <View style={{ borderLeftWidth: 2, borderLeftColor: c.border }}>
              {upNext.map((e) => (
                <PressableScale key={e.key} onPress={e.onPress} scaleTo={0.99} style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3], paddingLeft: space[4], paddingRight: space[2] }}>
                  <View style={{ width: 78, flexDirection: "row", alignItems: "center", gap: space[1] }}>
                    {e.tone === "live" ? (
                      <LivePill />
                    ) : (
                      <>
                        {e.tone !== "new" ? (
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneColor(e.tone) }} />
                        ) : null}
                        <Text
                          style={{ fontFamily: mono, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3, color: toneColor(e.tone) }}
                          numberOfLines={1}
                        >
                          {e.label}
                        </Text>
                      </>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="subhead" numberOfLines={1}>{e.title}</Text>
                    <Text variant="caption" color="textSubtle" numberOfLines={1} style={{ marginTop: 1 }}>{e.meta}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color="textSubtle" />
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}

        {/* Community strip */}
        <View style={{ gap: space[3], marginBottom: space[8] }}>
          <View style={{ flexDirection: "row", gap: space[3] }}>
            <CommunityTile icon="message-circle" label="Discussions" sub="Ask doubts & discuss" onPress={() => router.push(`/class/${classId}/threads`)} />
            <CommunityTile icon="users" label="People" sub={`Message ${teacherName.split(" ")[0]} & classmates`} onPress={() => router.push("/messages/new")} />
          </View>
          <CommunityTile icon="folder" label="Resources" sub="Slide decks, PDFs & videos shared in class" onPress={() => router.push(`/class/${classId}/resources`)} />
        </View>

        {/* Content lanes */}
        {totalItems === 0 ? (
          <EmptyState icon="inbox" title="Nothing on the board yet" body={`When ${teacherName} posts a quiz, test, contest, course or project, it shows up here.`} />
        ) : (
          <>
            <Lane title="Mock tests" count={counts.tests} show={data.content.tests.length > 0} onViewAll={() => openType("tests")}>
              {data.content.tests.slice(0, LANE_PREVIEW).map((r, i) => (
                <LaneRow key={r.id} first={i === 0} title={r.title} meta={metaFor.test(r)} onPress={() => openType("tests")} />
              ))}
            </Lane>
            <Lane title="Quizzes" count={counts.quizzes} show={data.content.quizzes.length > 0} onViewAll={() => openType("quizzes")}>
              {data.content.quizzes.slice(0, LANE_PREVIEW).map((r, i) => (
                <LaneRow key={r.id} first={i === 0} title={r.title} meta={metaFor.quiz(r)} onPress={() => startQuiz(r)} right={startingId === r.id ? <ActivityIndicator size="small" color={c.accent} /> : undefined} />
              ))}
            </Lane>
            <Lane title="Contests" count={counts.contests} show={data.content.contests.length > 0} onViewAll={() => openType("contests")}>
              {data.content.contests.slice(0, LANE_PREVIEW).map((r, i) => (
                <LaneRow key={r.id} first={i === 0} title={r.title} meta={metaFor.contest(r)} onPress={() => openType("contests")} right={contestPhase(r) === "live" ? <Chip label="Live" tone="danger" /> : undefined} />
              ))}
            </Lane>
            <Lane title="Projects" count={counts.projectEvals} show={data.content.projectEvals.length > 0} onViewAll={() => openType("projectEvals")}>
              {data.content.projectEvals.slice(0, LANE_PREVIEW).map((ev, i) => (
                <LaneRow key={ev.id} first={i === 0} title={ev.title} meta={`${ev.maxTotalScore} marks${ev.dueAt ? ` · due ${shortDate(ev.dueAt)}` : ""}`} onPress={() => openType("projectEvals")} right={ev.mySubmission ? <Chip label={ev.mySubmission.status === "scored" || ev.mySubmission.status === "evaluated" ? "Scored" : "Submitted"} tone="accent" /> : undefined} />
              ))}
            </Lane>
            <Lane title="Courses" count={counts.courses} show={data.content.courses.length > 0} onViewAll={() => openType("courses")}>
              {data.content.courses.slice(0, LANE_PREVIEW).map((r, i) => (
                <LaneRow key={r.id} first={i === 0} title={r.title} meta={metaFor.course(r)} onPress={() => openCourse(r)} />
              ))}
            </Lane>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function CommunityTile({ icon, label, sub, onPress }: { icon: IconName; label: string; sub: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} scaleTo={0.97} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[3], backgroundColor: c.surface, borderWidth: 0.5, borderColor: c.border, borderRadius: radius.lg, padding: space[3] }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={18} color="textMuted" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="subhead">{label}</Text>
        <Text variant="caption" color="textSubtle" numberOfLines={1}>{sub}</Text>
      </View>
    </PressableScale>
  );
}

function Lane({ title, count, show, onViewAll, children }: { title: string; count: number; show: boolean; onViewAll: () => void; children: React.ReactNode }) {
  const c = useColors();
  if (!show) return null;
  return (
    <View style={{ marginBottom: space[6] }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: space[2] }}>
        <Text variant="title3">
          {title} <Text variant="footnote" color="textSubtle" style={{ fontFamily: mono }}>{count}</Text>
        </Text>
        {count > LANE_PREVIEW ? (
          <Text variant="footnote" color="accentText" onPress={onViewAll}>View all</Text>
        ) : null}
      </View>
      <Card padded={false} style={{ paddingHorizontal: space[4] }}>{children}</Card>
    </View>
  );
}

function LaneRow({ title, meta, onPress, right, first }: { title: string; meta: string; onPress: () => void; right?: React.ReactNode; first?: boolean }) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} scaleTo={0.99} style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3], borderTopWidth: first ? 0 : 0.5, borderTopColor: c.border }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="callout" style={{ fontWeight: "500" }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontFamily: mono, fontSize: 11, color: c.textSubtle, marginTop: 2 }} numberOfLines={1}>{meta}</Text>
      </View>
      {right}
      <Icon name="chevron-right" size={18} color="textSubtle" />
    </PressableScale>
  );
}
