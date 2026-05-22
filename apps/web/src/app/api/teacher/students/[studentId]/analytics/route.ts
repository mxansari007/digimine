import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, toIsoDate } from "@/lib/server/classroomAccess";
import {
    buildDailyActivity,
    clampPercent,
    COMPLETED_STATUSES,
    computeRiskScore,
    loadAttemptsForUsers,
    loadTeacherContentIds,
    toMillis,
    type AttemptRecord,
} from "@/lib/server/teacherAnalytics";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { studentId: string } }
) {
    try {
        const { searchParams } = new URL(req.url);
        const teacherId = searchParams.get("teacherId");
        if (!teacherId) {
            return NextResponse.json({ error: "teacherId required" }, { status: 400 });
        }
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) return NextResponse.json({ error: "Sign in as the teacher." }, { status: 401 });
        if (tokenUserId !== teacherId) {
            return NextResponse.json({ error: "You can only view your own classroom." }, { status: 403 });
        }

        const studentId = params.studentId;

        // Confirm the student is a member of at least one of this teacher's classes
        const classMemberships = await adminDb
            .collectionGroup("students")
            .where("studentId", "==", studentId)
            .where("teacherId", "==", teacherId)
            .get();
        if (classMemberships.empty) {
            return NextResponse.json({ error: "Student not in your classes" }, { status: 404 });
        }

        // Pull the most recent / canonical enrollment row for display
        const enrollment = classMemberships.docs
            .map((d) => d.data() || {})
            .sort((a, b) => toMillis(b.enrolledAt) - toMillis(a.enrolledAt))[0];

        const [contentIndex, userSnap] = await Promise.all([
            loadTeacherContentIds(teacherId),
            adminDb.collection("users").doc(studentId).get(),
        ]);

        const userData = userSnap.exists ? userSnap.data() || {} : {};
        const allClassRosterIds = await collectClassmateIds(teacherId, studentId);

        // Attempts: this student + classmates so we can compute class averages
        // for the comparison panel. We split them in JS.
        const allAttempts = await loadAttemptsForUsers(
            [studentId, ...allClassRosterIds.filter((id) => id !== studentId)],
            contentIndex
        );

        const studentAttempts = allAttempts.filter((a) => a.userId === studentId);
        const classmateAttempts = allAttempts.filter((a) => a.userId !== studentId);

        const completed = studentAttempts.filter((a) => COMPLETED_STATUSES.has(a.status));
        const sortedByDate = [...completed].sort((a, b) => a.completedAtMs - b.completedAtMs);

        const totalAssignedContent = contentIndex.quizzes.size + contentIndex.seriesById.size;
        const completedContentIds = new Set(completed.map((a) => a.contentId));
        const lastActiveMs = Math.max(
            ...studentAttempts.map((a) => Math.max(a.completedAtMs, a.startedAtMs)),
            toMillis(enrollment.lastActiveAt),
            0
        );

        const risk = computeRiskScore({
            completed,
            totalAssignedContent,
            completedContentCount: completedContentIds.size,
            lastActiveAtMs: lastActiveMs > 0 ? lastActiveMs : null,
        });

        // Performance trend — one point per completed attempt
        const trend = sortedByDate.map((a) => ({
            attemptId: a.id,
            contentTitle: a.contentTitle,
            category: a.category,
            kind: a.kind,
            percentage: a.percentage,
            completedAt: a.completedAtMs ? new Date(a.completedAtMs).toISOString() : null,
        }));

        // Rolling average of last 3 attempts to smooth the line
        const rollingAvg = trend.map((_, i) => {
            const slice = trend.slice(Math.max(0, i - 2), i + 1);
            const avg = slice.reduce((s, p) => s + p.percentage, 0) / slice.length;
            return { index: i, average: clampPercent(avg) };
        });

        // Topic mastery (categories)
        const topicMap = new Map<string, { sum: number; count: number }>();
        completed.forEach((a) => {
            const slot = topicMap.get(a.category) || { sum: 0, count: 0 };
            slot.sum += a.percentage;
            slot.count += 1;
            topicMap.set(a.category, slot);
        });
        const classTopicMap = new Map<string, { sum: number; count: number }>();
        classmateAttempts
            .filter((a) => COMPLETED_STATUSES.has(a.status))
            .forEach((a) => {
                const slot = classTopicMap.get(a.category) || { sum: 0, count: 0 };
                slot.sum += a.percentage;
                slot.count += 1;
                classTopicMap.set(a.category, slot);
            });
        const topicBreakdown = Array.from(
            new Set([...topicMap.keys(), ...classTopicMap.keys()])
        )
            .map((category) => {
                const student = topicMap.get(category);
                const classmate = classTopicMap.get(category);
                return {
                    category,
                    studentAverage: student && student.count > 0
                        ? clampPercent(student.sum / student.count)
                        : null,
                    classAverage:
                        classmate && classmate.count > 0
                            ? clampPercent(classmate.sum / classmate.count)
                            : null,
                    studentAttempts: student?.count || 0,
                };
            })
            .sort((a, b) => (a.studentAverage ?? -1) - (b.studentAverage ?? -1));

        // Section-level mastery (specific test sections this student attempted)
        const sectionMap = new Map<string, { title: string; sum: number; count: number }>();
        completed.forEach((a) => {
            a.sectionResults.forEach((s) => {
                if (s.maxScore <= 0) return;
                const key = `${a.contentId}|${s.sectionId}`;
                const slot = sectionMap.get(key) || { title: `${a.contentTitle} → ${s.title}`, sum: 0, count: 0 };
                slot.sum += (s.score / s.maxScore) * 100;
                slot.count += 1;
                sectionMap.set(key, slot);
            });
        });
        const sectionStrengths = Array.from(sectionMap.entries())
            .map(([key, v]) => ({
                key,
                title: v.title,
                averagePercentage: clampPercent(v.sum / Math.max(1, v.count)),
                attempts: v.count,
            }))
            .sort((a, b) => b.averagePercentage - a.averagePercentage);

        // Comparison vs class on key headline metrics
        const classCompleted = classmateAttempts.filter((a) => COMPLETED_STATUSES.has(a.status));
        const classAvg = classCompleted.length
            ? clampPercent(classCompleted.reduce((s, a) => s + a.percentage, 0) / classCompleted.length)
            : null;
        const studentAvg = risk.metrics.averagePercentage;
        const studentAvgDuration = avg(completed.map((c) => c.durationSeconds));
        const classAvgDuration = avg(classCompleted.map((c) => c.durationSeconds));

        // Activity heatmap (last 90 days)
        const daily = buildDailyActivity(studentAttempts, 90);

        // Recent (last 10) attempts list with rich detail
        const recent = [...studentAttempts]
            .sort((a, b) => Math.max(b.completedAtMs, b.startedAtMs) - Math.max(a.completedAtMs, a.startedAtMs))
            .slice(0, 10)
            .map((a) => ({
                id: a.id,
                kind: a.kind,
                contentTitle: a.contentTitle,
                category: a.category,
                status: a.status,
                percentage: a.percentage,
                durationSeconds: a.durationSeconds,
                completedAt: a.completedAtMs ? new Date(a.completedAtMs).toISOString() : null,
                correctAnswers: a.correctAnswers,
                wrongAnswers: a.wrongAnswers,
            }));

        // Streak — longest consecutive-day run of attempts in last 90 days
        const streak = computeStreak(daily);

        return NextResponse.json({
            student: {
                id: studentId,
                studentEmail: enrollment.studentEmail || userData.email || "",
                studentName:
                    enrollment.studentName ||
                    userData.displayName ||
                    userData.name ||
                    "Student",
                rollNumber: enrollment.rollNumber || null,
                status: enrollment.status || "active",
                enrolledAt: toIsoDate(enrollment.enrolledAt),
                lastActiveAt: lastActiveMs > 0 ? new Date(lastActiveMs).toISOString() : null,
                classMemberships: classMemberships.docs.map((d) => {
                    const path = d.ref.path.split("/");
                    return {
                        classId: path[1],
                        status: (d.data() || {}).status || "active",
                    };
                }),
            },
            risk,
            headline: {
                studentAverage: studentAvg,
                classAverage: classAvg,
                bestPercentage: completed.length ? Math.max(...completed.map((c) => c.percentage)) : null,
                completedAttempts: completed.length,
                inProgressAttempts: studentAttempts.filter((a) => a.status === "in_progress").length,
                totalAssignedContent,
                completedContentCount: completedContentIds.size,
                coveragePercent: risk.metrics.coveragePercent,
                avgDurationSeconds: studentAvgDuration,
                classAvgDurationSeconds: classAvgDuration,
                longestStreakDays: streak.longest,
                currentStreakDays: streak.current,
            },
            trend,
            rollingAvg,
            topicBreakdown,
            sectionStrengths,
            daily,
            recent,
        });
    } catch (error: any) {
        console.error("Student analytics error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load student analytics" },
            { status: 500 }
        );
    }
}

async function collectClassmateIds(teacherId: string, studentId: string): Promise<string[]> {
    const classesSnap = await adminDb
        .collection("classes")
        .where("teacherId", "==", teacherId)
        .get();
    const ids = new Set<string>();
    await Promise.all(
        classesSnap.docs.map(async (classDoc) => {
            const memberSnap = await classDoc.ref
                .collection("students")
                .doc(studentId)
                .get();
            if (!memberSnap.exists || memberSnap.data()?.status !== "active") return;
            const otherStudents = await classDoc.ref.collection("students").get();
            otherStudents.docs.forEach((s) => {
                const data = s.data() || {};
                if (data.status === "active") ids.add(data.studentId || s.id);
            });
        })
    );
    return Array.from(ids);
}

function avg(values: number[]): number | null {
    if (values.length === 0) return null;
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function computeStreak(daily: { date: string; count: number }[]) {
    let longest = 0;
    let current = 0;
    let running = 0;
    for (let i = 0; i < daily.length; i++) {
        if (daily[i].count > 0) {
            running += 1;
            if (running > longest) longest = running;
        } else {
            running = 0;
        }
    }
    // Current streak counts back from today
    for (let i = daily.length - 1; i >= 0; i--) {
        if (daily[i].count > 0) current += 1;
        else break;
    }
    return { longest, current };
}
