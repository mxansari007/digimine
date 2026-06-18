/**
 * GET /api/teacher/classes/[classId]/overview
 *
 * Combined endpoint for the class detail "command-center" page. Returns
 * everything the teacher needs to judge their class at a glance in one
 * round trip:
 *
 *   - Class metadata (name, invite code, archived, counts)
 *   - Per-student insights row (risk band, avg/best %, coverage, last
 *     active, attempt counts, pending state)
 *   - Class-level aggregates (active count, avg %, pass rate, at-risk
 *     count, content live count)
 *   - Pre-sorted "Needs attention" list (top-N highest-risk active
 *     students with at least one attempt)
 *
 * Why combine instead of reusing /students + /analytics:
 *   - The analytics endpoint is HEAVY (histogram, daily heatmap,
 *     topic mastery, etc.) — overkill for the roster page.
 *   - Two round trips on a page that's mostly a glanceable summary is
 *     a poor UX.
 *   - Reuses the same analytics helpers so we don't duplicate the
 *     risk-scoring math.
 *
 * Access: a teacher who owns OR teaches a subject in the class (assertClassTeacher).
 */
import { NextResponse } from "next/server";
import { assertClassTeacher } from "@/lib/server/classes";
import {
    buildDailyActivity,
    clampPercent,
    computeRiskScore,
    COMPLETED_STATUSES,
    loadAttemptsForUsers,
    loadClassRoster,
    loadTeacherContentIds,
    toMillis,
} from "@/lib/server/teacherAnalytics";

export const dynamic = "force-dynamic";

const PASS_THRESHOLD = 40; // % — same default used elsewhere in the app
const NEEDS_ATTENTION_LIMIT = 5;
const SPARKLINE_DAYS = 14;
const WEAK_TOPIC_MIN_ATTEMPTS = 2;
const WEAK_TOPIC_LIMIT = 3;

export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const ownership = await assertClassTeacher(req, params.classId);
        if (!ownership.ok) {
            return NextResponse.json({ error: ownership.error }, { status: ownership.status });
        }

        const [roster, contentIndex] = await Promise.all([
            loadClassRoster(params.classId),
            loadTeacherContentIds(ownership.teacherId),
        ]);

        const studentIds = roster.map((s) => s.studentId).filter(Boolean);
        const allAttempts = await loadAttemptsForUsers(studentIds, contentIndex);
        const totalAssignedContent = contentIndex.quizzes.size + contentIndex.seriesById.size;

        // Per-student row, enriched with the same risk + stats shape the
        // single-student page already shows. Keep it flat so the client can
        // render a table without further computation.
        const students = roster.map((student) => {
            const attempts = allAttempts.filter((a) => a.userId === student.studentId);
            const completed = attempts.filter((a) => COMPLETED_STATUSES.has(a.status));
            const completedContentIds = new Set(completed.map((a) => a.contentId));
            const lastActiveMs = Math.max(
                ...attempts.map((a) => Math.max(a.completedAtMs, a.startedAtMs)),
                toMillis(student.lastActiveAt),
                0
            );
            const risk = computeRiskScore({
                completed,
                totalAssignedContent,
                completedContentCount: completedContentIds.size,
                lastActiveAtMs: lastActiveMs > 0 ? lastActiveMs : null,
            });

            const averagePercentage =
                completed.length > 0
                    ? clampPercent(
                          completed.reduce((s, c) => s + c.percentage, 0) / completed.length
                      )
                    : null;
            const bestPercentage =
                completed.length > 0
                    ? clampPercent(Math.max(...completed.map((c) => c.percentage)))
                    : null;

            // 14-day attempt-count sparkline (one entry per day, oldest → newest).
            const sparkline = buildDailyActivity(attempts, SPARKLINE_DAYS).map((d) => d.count);

            // Weak-topic breakdown: group completed attempts by category, keep
            // categories with at least WEAK_TOPIC_MIN_ATTEMPTS attempts, sort
            // ascending by average percentage, take WEAK_TOPIC_LIMIT.
            type TopicAgg = { category: string; sum: number; count: number };
            const topicMap = new Map<string, TopicAgg>();
            for (const a of completed) {
                const cat = a.category || "Uncategorised";
                const cur = topicMap.get(cat) ?? { category: cat, sum: 0, count: 0 };
                cur.sum += a.percentage;
                cur.count += 1;
                topicMap.set(cat, cur);
            }
            const weakTopics = Array.from(topicMap.values())
                .filter((t) => t.count >= WEAK_TOPIC_MIN_ATTEMPTS)
                .map((t) => ({
                    category: t.category,
                    attempts: t.count,
                    avgPercentage: clampPercent(t.sum / t.count),
                }))
                .sort((a, b) => a.avgPercentage - b.avgPercentage)
                .slice(0, WEAK_TOPIC_LIMIT);

            return {
                id: student.studentId,
                studentId: student.studentId,
                studentName: student.studentName,
                studentEmail: student.studentEmail,
                rollNumber: student.rollNumber,
                status: student.status,
                enrolledAt: student.enrolledAt,
                isPending: student.studentId.startsWith("pending:"),
                stats: {
                    totalAttempts: attempts.length,
                    completedAttempts: completed.length,
                    inProgressAttempts: attempts.filter((a) => a.status === "in_progress").length,
                    averagePercentage,
                    bestPercentage,
                    completedContentCount: completedContentIds.size,
                    coveragePercent: risk.metrics.coveragePercent,
                    lastActiveAt: lastActiveMs > 0 ? new Date(lastActiveMs).toISOString() : null,
                },
                risk: {
                    score: risk.score,
                    band: risk.band,
                    reasons: risk.reasons,
                },
                sparkline,
                weakTopics,
            };
        });

        // Class-level aggregates. Compute against ACTIVE students with at
        // least one completed attempt so banned/removed/zero-attempt students
        // don't drag the average.
        const activeStudents = students.filter((s) => s.status === "active" && !s.isPending);
        const studentsWithData = activeStudents.filter(
            (s) => s.stats.completedAttempts > 0 && s.stats.averagePercentage != null
        );

        const classAverage =
            studentsWithData.length > 0
                ? clampPercent(
                      studentsWithData.reduce(
                          (sum, s) => sum + (s.stats.averagePercentage ?? 0),
                          0
                      ) / studentsWithData.length
                  )
                : null;
        const passRate =
            studentsWithData.length > 0
                ? clampPercent(
                      (studentsWithData.filter((s) => (s.stats.averagePercentage ?? 0) >= PASS_THRESHOLD).length /
                          studentsWithData.length) *
                          100
                  )
                : null;
        const atRiskCount = activeStudents.filter((s) => s.risk.band === "high").length;

        // Top-N highest-risk students, only those who have actually engaged
        // (we don't want to flag every brand-new student as "at risk" — they
        // just haven't started yet, that's a different problem).
        const needsAttention = activeStudents
            .filter((s) => s.risk.band === "high" && s.stats.completedAttempts > 0)
            .sort((a, b) => b.risk.score - a.risk.score)
            .slice(0, NEEDS_ATTENTION_LIMIT);

        // Brand-new "not yet started" students — separate bucket so the
        // teacher can nudge them without conflating with at-risk performers.
        const notStarted = activeStudents
            .filter((s) => s.stats.completedAttempts === 0 && s.stats.totalAttempts === 0)
            .slice(0, NEEDS_ATTENTION_LIMIT);

        return NextResponse.json({
            class: {
                id: params.classId,
                name: ownership.classDoc.name,
                description: ownership.classDoc.description || null,
                inviteCode: ownership.classDoc.inviteCode,
                isArchived: Boolean(ownership.classDoc.isArchived),
                // Per-class Virtual Lab opt-in — gates the "Start Lab" card.
                labEnabled: ownership.classDoc.labEnabled === true,
                studentsCount: ownership.classDoc.studentsCount || 0,
                activeStudentsCount: ownership.classDoc.activeStudentsCount || 0,
                createdAt: ownership.classDoc.createdAt
                    ? new Date(toMillis(ownership.classDoc.createdAt)).toISOString()
                    : null,
            },
            insights: {
                totalAssignedContent,
                activeStudents: activeStudents.length,
                rosterCount: students.length,
                studentsWithData: studentsWithData.length,
                classAverage,
                passRate,
                atRiskCount,
            },
            students,
            needsAttention,
            notStarted,
        });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/teacher/classes/[id]/overview] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to load class overview" },
            { status: 500 }
        );
    }
}
