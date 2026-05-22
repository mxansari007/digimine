import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";

// ────────────────────────────────────────────────────────────────────
// Shared analytics helpers for teacher dashboards. Pure functions and
// admin-SDK reads only.
// ────────────────────────────────────────────────────────────────────

export const COMPLETED_STATUSES = new Set(["completed", "timed_out"]);

export function toMillis(value: any): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

export function clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

export function pctFromData(data: FirebaseFirestore.DocumentData): number {
    if (typeof data.percentage === "number") return clampPercent(data.percentage);
    if (
        typeof data.totalScore === "number" &&
        typeof data.maxPossibleScore === "number" &&
        data.maxPossibleScore > 0
    ) {
        return clampPercent((data.totalScore / data.maxPossibleScore) * 100);
    }
    return 0;
}

export type AttemptRecord = {
    id: string;
    kind: "quiz" | "test";
    userId: string;
    contentId: string;        // for tests = "seriesId:testId", for quizzes = quizId
    contentTitle: string;
    category: string;         // topic / category for heatmap grouping
    status: string;
    percentage: number;
    totalScore: number;
    maxPossibleScore: number;
    correctAnswers: number;
    wrongAnswers: number;
    unattempted: number;
    durationSeconds: number;
    startedAtMs: number;
    completedAtMs: number;
    sectionResults: SectionResult[];
    answers: AnswerRecord[];
};

export type SectionResult = {
    sectionId: string;
    title: string;
    score: number;
    maxScore: number;
    correctAnswers: number;
    wrongAnswers: number;
    unattempted: number;
};

export type AnswerRecord = {
    questionId: string;
    selectedOptionId: string | null;
    answer: string | null;
    isCorrect: boolean;
    marksObtained: number;
};

export type StudentSummary = {
    studentId: string;
    studentEmail: string;
    studentName: string;
    rollNumber: string | null;
    enrolledAt: string | null;
    status: "active" | "banned" | "removed";
    lastActiveAt: string | null;
};

// ────────────────────────────────────────────────────────────────────
// Loaders
// ────────────────────────────────────────────────────────────────────

export async function loadClassRoster(classId: string): Promise<StudentSummary[]> {
    const snap = await adminDb
        .collection("classes")
        .doc(classId)
        .collection("students")
        .get();
    return snap.docs.map((d) => {
        const data = d.data() || {};
        return {
            studentId: data.studentId || d.id,
            studentEmail: data.studentEmail || "",
            studentName: data.studentName || data.studentEmail || "Student",
            rollNumber: data.rollNumber || null,
            enrolledAt: toIsoDate(data.enrolledAt),
            status: (data.status as StudentSummary["status"]) || "active",
            lastActiveAt: toIsoDate(data.lastActiveAt),
        };
    });
}

export async function loadTeacherContentIds(teacherId: string) {
    const [quizzesSnap, testsSnap] = await Promise.all([
        adminDb.collection("quizzes").where("teacherId", "==", teacherId).get(),
        adminDb.collection("tests").where("teacherId", "==", teacherId).get(),
    ]);

    const quizzes = new Map<string, { title: string; category: string; passingPercentage: number }>();
    quizzesSnap.docs.forEach((d) => {
        const data = d.data() || {};
        quizzes.set(d.id, {
            title: data.title || "Quiz",
            category: data.category || "Uncategorised",
            passingPercentage: data.passingPercentage || 0,
        });
    });

    type SeriesInfo = {
        title: string;
        category: string;
        passingMarks: number;
        sections: Array<{ id: string; title: string; marksPerQuestion?: number }>;
    };
    const seriesById = new Map<string, SeriesInfo>();
    const testTitleByCompound = new Map<string, string>();

    await Promise.all(
        testsSnap.docs.map(async (seriesDoc) => {
            const sData = seriesDoc.data() || {};
            const seriesInfo: SeriesInfo = {
                title: sData.title || "Test",
                category: sData.category || "Uncategorised",
                passingMarks: sData.passingMarks || 0,
                sections: Array.isArray(sData.sections) ? sData.sections : [],
            };
            seriesById.set(seriesDoc.id, seriesInfo);
            const childrenSnap = await seriesDoc.ref.collection("tests").get();
            childrenSnap.docs.forEach((child) => {
                const c = child.data() || {};
                testTitleByCompound.set(`${seriesDoc.id}:${child.id}`, c.title || child.id);
            });
        })
    );

    return { quizzes, seriesById, testTitleByCompound };
}

export async function loadAttemptsForUsers(
    userIds: string[],
    contentIndex: Awaited<ReturnType<typeof loadTeacherContentIds>>
): Promise<AttemptRecord[]> {
    if (userIds.length === 0) return [];

    // Firestore `in` cap is 30 — chunk for safety.
    const chunks: string[][] = [];
    for (let i = 0; i < userIds.length; i += 30) chunks.push(userIds.slice(i, i + 30));

    const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    await Promise.all(
        chunks.map(async (chunk) => {
            const [quizzesSnap, testsSnap] = await Promise.all([
                adminDb.collection("quizAttempts").where("userId", "in", chunk).get(),
                adminDb.collection("testAttempts").where("userId", "in", chunk).get(),
            ]);
            allDocs.push(...quizzesSnap.docs, ...testsSnap.docs);
        })
    );

    const records: AttemptRecord[] = [];
    for (const docSnap of allDocs) {
        const data = docSnap.data() || {};
        const isTest = "seriesId" in data;
        if (isTest) {
            const seriesId = data.seriesId;
            const seriesInfo = contentIndex.seriesById.get(seriesId);
            if (!seriesInfo) continue;
            const childKey = `${seriesId}:${data.testId}`;
            const childTitle = contentIndex.testTitleByCompound.get(childKey);
            records.push(buildRecord(docSnap.id, data, {
                kind: "test",
                contentId: childKey,
                contentTitle: childTitle ? `${seriesInfo.title}: ${childTitle}` : seriesInfo.title,
                category: seriesInfo.category,
            }));
        } else {
            const quizId = data.quizId;
            const quizInfo = contentIndex.quizzes.get(quizId);
            if (!quizInfo) continue;
            records.push(buildRecord(docSnap.id, data, {
                kind: "quiz",
                contentId: quizId,
                contentTitle: quizInfo.title,
                category: quizInfo.category,
            }));
        }
    }
    return records;
}

function buildRecord(
    id: string,
    data: FirebaseFirestore.DocumentData,
    meta: { kind: "quiz" | "test"; contentId: string; contentTitle: string; category: string }
): AttemptRecord {
    const startedAtMs = toMillis(data.startedAt) || toMillis(data.createdAt);
    const completedAtMs = toMillis(data.completedAt) || toMillis(data.updatedAt);
    const duration = completedAtMs && startedAtMs ? Math.max(0, Math.round((completedAtMs - startedAtMs) / 1000)) : 0;

    const sectionResults: SectionResult[] = Array.isArray(data.sectionResults)
        ? data.sectionResults.map((s: any) => ({
              sectionId: s.sectionId || "__unsectioned",
              title: s.title || "Unsectioned",
              score: typeof s.score === "number" ? s.score : 0,
              maxScore: typeof s.maxScore === "number" ? s.maxScore : 0,
              correctAnswers: typeof s.correctAnswers === "number" ? s.correctAnswers : 0,
              wrongAnswers: typeof s.wrongAnswers === "number" ? s.wrongAnswers : 0,
              unattempted: typeof s.unattempted === "number" ? s.unattempted : 0,
          }))
        : [];

    const answers: AnswerRecord[] = Array.isArray(data.answers)
        ? data.answers.map((a: any) => ({
              questionId: a.questionId || "",
              selectedOptionId: typeof a.selectedOptionId === "string" ? a.selectedOptionId : null,
              answer: typeof a.answer === "string" ? a.answer : null,
              isCorrect: Boolean(a.isCorrect),
              marksObtained: typeof a.marksObtained === "number" ? a.marksObtained : 0,
          }))
        : [];

    return {
        id,
        kind: meta.kind,
        userId: data.userId,
        contentId: meta.contentId,
        contentTitle: meta.contentTitle,
        category: meta.category,
        status: data.status || "in_progress",
        percentage: pctFromData(data),
        totalScore: typeof data.totalScore === "number" ? data.totalScore : 0,
        maxPossibleScore: typeof data.maxPossibleScore === "number" ? data.maxPossibleScore : 0,
        correctAnswers: typeof data.correctAnswers === "number" ? data.correctAnswers : 0,
        wrongAnswers: typeof data.wrongAnswers === "number" ? data.wrongAnswers : 0,
        unattempted:
            typeof data.unattempted === "number"
                ? data.unattempted
                : typeof data.skipped === "number"
                ? data.skipped
                : 0,
        durationSeconds: duration,
        startedAtMs,
        completedAtMs,
        sectionResults,
        answers,
    };
}

// ────────────────────────────────────────────────────────────────────
// Risk score
// ────────────────────────────────────────────────────────────────────

export type RiskBreakdown = {
    score: number;            // 0-100 (higher = more at risk)
    band: "low" | "medium" | "high";
    reasons: string[];
    metrics: {
        averagePercentage: number | null;
        recentTrend: number;          // -100..+100 (negative = declining)
        daysSinceLastActive: number | null;
        coveragePercent: number;
    };
};

export function computeRiskScore(args: {
    completed: AttemptRecord[];
    totalAssignedContent: number;
    completedContentCount: number;
    lastActiveAtMs: number | null;
}): RiskBreakdown {
    const { completed, totalAssignedContent, completedContentCount, lastActiveAtMs } = args;
    const reasons: string[] = [];

    // Component 1: average percentage (40 weight)
    let avgPct: number | null = null;
    if (completed.length > 0) {
        avgPct = clampPercent(completed.reduce((s, r) => s + r.percentage, 0) / completed.length);
    }
    const avgRisk = avgPct === null ? 50 : Math.max(0, 100 - avgPct);
    if (avgPct !== null && avgPct < 50) reasons.push(`Average score is low (${avgPct}%)`);

    // Component 2: recent trend (20 weight) — last 5 vs previous 5
    const sortedByDate = [...completed].sort((a, b) => a.completedAtMs - b.completedAtMs);
    const recent = sortedByDate.slice(-5);
    const previous = sortedByDate.slice(-10, -5);
    const recentAvg = recent.length > 0 ? recent.reduce((s, r) => s + r.percentage, 0) / recent.length : null;
    const previousAvg = previous.length > 0 ? previous.reduce((s, r) => s + r.percentage, 0) / previous.length : null;
    let trend = 0;
    if (recentAvg !== null && previousAvg !== null) trend = Math.round(recentAvg - previousAvg);
    const trendRisk = trend < 0 ? Math.min(100, -trend * 2) : 0;
    if (trend <= -10) reasons.push(`Recent attempts trending down (${trend}%)`);

    // Component 3: engagement (20 weight) — days since last active
    const daysSinceLastActive =
        lastActiveAtMs && lastActiveAtMs > 0
            ? Math.floor((Date.now() - lastActiveAtMs) / (1000 * 60 * 60 * 24))
            : null;
    const engagementRisk = daysSinceLastActive === null ? 60 : Math.min(100, daysSinceLastActive * 5);
    if (daysSinceLastActive !== null && daysSinceLastActive >= 14) {
        reasons.push(`Inactive for ${daysSinceLastActive} days`);
    } else if (daysSinceLastActive === null) {
        reasons.push("Has never been active");
    }

    // Component 4: coverage (20 weight)
    const coveragePercent =
        totalAssignedContent > 0
            ? clampPercent((completedContentCount / totalAssignedContent) * 100)
            : 0;
    const coverageRisk = Math.max(0, 100 - coveragePercent);
    if (coveragePercent < 40 && totalAssignedContent > 0) {
        reasons.push(`Only completed ${completedContentCount}/${totalAssignedContent} content pieces`);
    }

    const score = clampPercent(
        avgRisk * 0.4 + trendRisk * 0.2 + engagementRisk * 0.2 + coverageRisk * 0.2
    );
    const band: RiskBreakdown["band"] =
        score >= 65 ? "high" : score >= 40 ? "medium" : "low";

    return {
        score,
        band,
        reasons,
        metrics: {
            averagePercentage: avgPct,
            recentTrend: trend,
            daysSinceLastActive,
            coveragePercent,
        },
    };
}

// ────────────────────────────────────────────────────────────────────
// Activity heatmap (last 90 days, per day)
// ────────────────────────────────────────────────────────────────────

export type DailyActivity = {
    date: string;          // YYYY-MM-DD
    count: number;
    avgPercentage: number | null;
};

export function buildDailyActivity(attempts: AttemptRecord[], windowDays = 90): DailyActivity[] {
    const dayStart = (ts: number) => {
        const d = new Date(ts);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    };
    const today = dayStart(Date.now());
    const result: DailyActivity[] = [];
    for (let i = windowDays - 1; i >= 0; i--) {
        const day = today - i * 86400000;
        const next = day + 86400000;
        const todays = attempts.filter(
            (a) => COMPLETED_STATUSES.has(a.status) && a.completedAtMs >= day && a.completedAtMs < next
        );
        const avg = todays.length
            ? clampPercent(todays.reduce((s, r) => s + r.percentage, 0) / todays.length)
            : null;
        result.push({
            date: new Date(day).toISOString().slice(0, 10),
            count: todays.length,
            avgPercentage: avg,
        });
    }
    return result;
}
