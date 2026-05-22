import { NextResponse } from "next/server";
import { assertClassOwner } from "@/lib/server/classes";
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

export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const ownership = await assertClassOwner(req, params.classId);
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

        // Per-student aggregates
        const perStudent = roster.map((student) => {
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

            return {
                student,
                stats: {
                    totalAttempts: attempts.length,
                    completedAttempts: completed.length,
                    inProgressAttempts: attempts.filter((a) => a.status === "in_progress").length,
                    droppedOff: attempts.filter((a) => a.status === "in_progress" && Date.now() - a.startedAtMs > 24 * 3600 * 1000).length,
                    averagePercentage: risk.metrics.averagePercentage,
                    bestPercentage: completed.length ? Math.max(...completed.map((c) => c.percentage)) : null,
                    completedContentCount: completedContentIds.size,
                    coveragePercent: risk.metrics.coveragePercent,
                    lastActiveAt: lastActiveMs > 0 ? new Date(lastActiveMs).toISOString() : null,
                },
                risk,
            };
        });

        const activeStudents = perStudent.filter((p) => p.student.status === "active");
        const studentsWithData = activeStudents.filter((p) => p.stats.completedAttempts > 0);

        // Class-level distribution histogram (10% bands)
        const histogram = Array.from({ length: 10 }, () => 0);
        const allCompleted = allAttempts.filter((a) => COMPLETED_STATUSES.has(a.status));
        allCompleted.forEach((a) => {
            const idx = Math.min(9, Math.floor(a.percentage / 10));
            histogram[idx] += 1;
        });

        const classAverage =
            allCompleted.length > 0
                ? clampPercent(allCompleted.reduce((s, a) => s + a.percentage, 0) / allCompleted.length)
                : null;
        const classTop =
            allCompleted.length > 0 ? Math.max(...allCompleted.map((a) => a.percentage)) : null;
        const classMedian = (() => {
            if (allCompleted.length === 0) return null;
            const sorted = [...allCompleted].map((a) => a.percentage).sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
        })();
        const passRate =
            allCompleted.length > 0
                ? clampPercent(
                      (allCompleted.filter((a) => a.percentage >= 40).length / allCompleted.length) * 100
                  )
                : null;

        // Top + bottom performers
        const rankedByAvg = [...studentsWithData].sort(
            (a, b) => (b.stats.averagePercentage ?? 0) - (a.stats.averagePercentage ?? 0)
        );
        const topPerformers = rankedByAvg.slice(0, 5).map((p) => ({
            studentId: p.student.studentId,
            studentName: p.student.studentName,
            averagePercentage: p.stats.averagePercentage,
            completedAttempts: p.stats.completedAttempts,
        }));
        const bottomPerformers = [...rankedByAvg]
            .reverse()
            .slice(0, 5)
            .map((p) => ({
                studentId: p.student.studentId,
                studentName: p.student.studentName,
                averagePercentage: p.stats.averagePercentage,
                completedAttempts: p.stats.completedAttempts,
            }));

        // At-risk students (sorted by risk score)
        const atRisk = [...activeStudents]
            .filter((p) => p.risk.band !== "low")
            .sort((a, b) => b.risk.score - a.risk.score)
            .slice(0, 10)
            .map((p) => ({
                studentId: p.student.studentId,
                studentName: p.student.studentName,
                studentEmail: p.student.studentEmail,
                risk: p.risk,
                stats: p.stats,
            }));

        // Engagement timeline
        const daily = buildDailyActivity(allAttempts, 90);

        // Topic mastery (per category, what % the class averages)
        const topicTotals = new Map<string, { sum: number; count: number }>();
        allCompleted.forEach((a) => {
            const key = a.category || "Uncategorised";
            const slot = topicTotals.get(key) || { sum: 0, count: 0 };
            slot.sum += a.percentage;
            slot.count += 1;
            topicTotals.set(key, slot);
        });
        const topicMastery = Array.from(topicTotals.entries())
            .map(([category, v]) => ({
                category,
                attempts: v.count,
                averagePercentage: clampPercent(v.sum / Math.max(1, v.count)),
            }))
            .sort((a, b) => a.averagePercentage - b.averagePercentage);

        // Section mastery — gathers section-level results across all test attempts.
        const sectionTotals = new Map<string, { title: string; sum: number; count: number }>();
        allCompleted.forEach((a) => {
            a.sectionResults.forEach((s) => {
                if (s.maxScore <= 0) return;
                const sectionKey = `${a.contentId}|${s.sectionId}`;
                const slot = sectionTotals.get(sectionKey) || { title: s.title, sum: 0, count: 0 };
                slot.sum += (s.score / s.maxScore) * 100;
                slot.count += 1;
                sectionTotals.set(sectionKey, slot);
            });
        });
        const sectionMastery = Array.from(sectionTotals.entries())
            .map(([key, v]) => ({
                key,
                title: v.title,
                averagePercentage: clampPercent(v.sum / Math.max(1, v.count)),
                attempts: v.count,
            }))
            .sort((a, b) => a.averagePercentage - b.averagePercentage)
            .slice(0, 12);

        // Most-missed questions (across all attempts in this class)
        const questionMisses = new Map<string, { total: number; wrong: number; contentTitle: string }>();
        allCompleted.forEach((a) => {
            a.answers.forEach((ans) => {
                if (!ans.questionId) return;
                const slot = questionMisses.get(ans.questionId) || {
                    total: 0,
                    wrong: 0,
                    contentTitle: a.contentTitle,
                };
                slot.total += 1;
                if (!ans.isCorrect) slot.wrong += 1;
                slot.contentTitle = a.contentTitle;
                questionMisses.set(ans.questionId, slot);
            });
        });
        const mostMissed = Array.from(questionMisses.entries())
            .filter(([, v]) => v.total >= 3)
            .map(([qid, v]) => ({
                questionId: qid,
                contentTitle: v.contentTitle,
                totalAttempts: v.total,
                wrongCount: v.wrong,
                wrongRate: clampPercent((v.wrong / v.total) * 100),
            }))
            .sort((a, b) => b.wrongRate - a.wrongRate)
            .slice(0, 10);

        // Drop-off — students who started something but never finished any
        const dropOffStudents = activeStudents
            .filter((p) => p.stats.inProgressAttempts > 0 && p.stats.completedAttempts === 0)
            .map((p) => ({
                studentId: p.student.studentId,
                studentName: p.student.studentName,
                inProgressAttempts: p.stats.inProgressAttempts,
            }));

        // Not-attempted students (active, zero attempts)
        const notAttempted = activeStudents
            .filter((p) => p.stats.totalAttempts === 0)
            .map((p) => ({
                studentId: p.student.studentId,
                studentName: p.student.studentName,
                studentEmail: p.student.studentEmail,
                enrolledAt: p.student.enrolledAt,
            }));

        return NextResponse.json({
            totals: {
                totalStudents: roster.length,
                activeStudents: activeStudents.length,
                totalAssignedContent,
                totalAttempts: allAttempts.length,
                completedAttempts: allCompleted.length,
                classAverage,
                classMedian,
                classTop,
                passRate,
            },
            histogram,
            daily,
            topPerformers,
            bottomPerformers,
            atRisk,
            topicMastery,
            sectionMastery,
            mostMissed,
            dropOffStudents,
            notAttempted,
        });
    } catch (error: any) {
        console.error("Class analytics error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load class analytics" },
            { status: 500 }
        );
    }
}
