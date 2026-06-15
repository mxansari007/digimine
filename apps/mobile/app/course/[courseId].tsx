import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api, type CourseDetail } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import { Card, Chip, EmptyState, ErrorState, Icon, ListSkeleton, PressableScale, Screen, ScreenScroll, Text } from "@/design/ui";
import { HtmlView } from "@/components/HtmlView";

export default function CourseReaderScreen() {
  const { courseId, classId, title } = useLocalSearchParams<{ courseId: string; classId: string; title?: string }>();
  const c = useColors();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId || !classId) return;
    setError(null);
    try {
      const res = await api.courseDetail(courseId, classId);
      setCourse(res.content);
      const first = (res.content.chapters || [])[0];
      if (first) setOpenChapter(first.id);
    } catch (e: any) {
      setError(e?.message || "Couldn't load the course.");
    } finally {
      setLoading(false);
    }
  }, [courseId, classId]);

  useEffect(() => {
    load();
  }, [load]);

  const chapters = useMemo(
    () =>
      (course?.chapters || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((ch) => ({ ...ch, subtopics: (ch.subtopics || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) })),
    [course]
  );

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: course?.title || title || "Course" }} />
      <ScreenScroll>
        {error ? <ErrorState message={error} onRetry={load} /> : null}
        {loading ? (
          <ListSkeleton rows={5} />
        ) : (
          <>
            {course ? (
              <View style={{ marginBottom: space[6] }}>
                <Text variant="title2">{course.title}</Text>
                {course.description ? (
                  <Text variant="callout" color="textMuted" style={{ marginTop: space[2] }}>
                    {course.description}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[3] }}>
                  {course.difficulty ? <Chip label={course.difficulty} tone="accent" /> : null}
                  <Chip label={`${course.totalModules ?? chapters.length} modules`} />
                  {course.estimatedHours ? <Chip label={`~${course.estimatedHours}h`} /> : null}
                </View>
              </View>
            ) : null}

            {chapters.length === 0 && !error ? (
              <EmptyState icon="book-open" title="No notes yet" body="Your teacher hasn't published chapters for this course yet." />
            ) : null}

            {chapters.map((ch, ci) => {
              const open = openChapter === ch.id;
              return (
                <View key={ch.id} style={{ borderWidth: 0.5, borderColor: c.border, borderRadius: radius.lg, overflow: "hidden", marginBottom: space[3], backgroundColor: c.surface }}>
                  <PressableScale onPress={() => { setOpenChapter(open ? null : ch.id); setOpenLesson(null); }} scaleTo={0.995} style={{ flexDirection: "row", alignItems: "center", gap: space[3], padding: space[4] }}>
                    <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: c.accentSubtle, alignItems: "center", justifyContent: "center" }}>
                      <Text variant="subhead" color="accentText">{ci + 1}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="subhead" numberOfLines={2}>{ch.title}</Text>
                      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>
                        {ch.subtopics.length} lesson{ch.subtopics.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color="textSubtle" />
                  </PressableScale>

                  {open
                    ? ch.subtopics.map((lesson) => {
                        const reading = openLesson === lesson.id;
                        return (
                          <View key={lesson.id} style={{ borderTopWidth: 0.5, borderTopColor: c.border }}>
                            <PressableScale onPress={() => setOpenLesson(reading ? null : lesson.id)} scaleTo={0.995} style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: reading ? c.accent : c.borderStrong }} />
                              <Text variant="footnote" style={{ flex: 1, fontWeight: "500", color: reading ? c.accentText : c.textMuted }} numberOfLines={2}>
                                {lesson.title}
                              </Text>
                            </PressableScale>
                            {reading ? (
                              <View style={{ paddingHorizontal: space[4], paddingBottom: space[4], backgroundColor: c.bg }}>
                                <HtmlView html={lesson.contentHtml || "<p>No content yet.</p>"} />
                                {lesson.videos?.length || lesson.imageUrls?.length ? (
                                  <Text variant="caption" color="textSubtle" style={{ marginTop: space[2], fontStyle: "italic" }}>
                                    {lesson.videos?.length ? `▶ ${lesson.videos.length} video${lesson.videos.length === 1 ? "" : "s"}` : ""}
                                    {lesson.videos?.length && lesson.imageUrls?.length ? " · " : ""}
                                    {lesson.imageUrls?.length ? `${lesson.imageUrls.length} image${lesson.imageUrls.length === 1 ? "" : "s"}` : ""}
                                    {" — open this lesson on the web to view"}
                                  </Text>
                                ) : null}
                              </View>
                            ) : null}
                          </View>
                        );
                      })
                    : null}
                </View>
              );
            })}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
