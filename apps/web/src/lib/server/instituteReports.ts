/**
 * Institute-wide placement-readiness reporting for the TPO (training &
 * placement officer) dashboard. Aggregates every class the institute runs
 * into per-class readiness distributions plus institute-level totals —
 * the numbers a placement cell shows management and cites as NAAC/NBA
 * training-outcome evidence.
 *
 * Reuses the teacher analytics primitives (attempt loading, risk scoring)
 * but builds the content index across the WHOLE institute: content the
 * institute assigned (instituteId on the doc) plus content authored by any
 * teacher who runs one of its classes.
 */
import { adminDb } from "@/lib/firebase/admin";
import {
    COMPLETED_STATUSES,
    clampPercent,
    computeRiskScore,
    loadAttemptsForUsers,
    loadClassRoster,
    toMillis,
    type AttemptRecord,
} from "@/lib/server/teacherAnalytics";

export type ReadinessBand = "ready" | "developing" | "at_risk";

export interface ClassReportRow {
    classId: string;
    className: string;
    teacherName: string | null;
    activeStudents: number;
    /** Students with ≥1 completed attempt. */
    participated: number;
    participationPercent: number;
    attempts: number;
    averagePercentage: number | null;
    ready: number;
    developing: number;
    atRisk: number;
}

export interface AtRiskStudentRow {
    studentId: string;
    studentName: string;
    studentEmail: string;
    className: string;
    averagePercentage: number | null;
    daysSinceLastActive: number | null;
    reasons: string[];
}

export interface InstituteReport {
    generatedAt: string;
    totals: {
        classes: number;
        activeStudents: number;
        participated: number;
        participationPercent: number;
        attempts: number;
        attemptsLast30d: number;
        averagePercentage: number | null;
        ready: number;
        developing: number;
        atRisk: number;
    };
    classes: ClassReportRow[];
    atRiskStudents: AtRiskStudentRow[];
}

/** Map the teacher risk band onto the placement-readiness vocabulary. */
function bandFromRisk(band: "low" | "medium" | "high"): ReadinessBand {
    if (band === "low") return "ready";
    if (band === "medium") return "developing";
    return "at_risk";
}

/**
 * Content index spanning the institute: institute-assigned content plus
 * everything authored by the institute's class teachers. Same shape as
 * loadTeacherContentIds so loadAttemptsForUsers can consume it directly.
 */
async function loadInstituteContentIndex(instituteId: string, teacherIds: string[]) {
    const quizzes = new Map<string, { title: string; category: string; passingPercentage: number }>();
    type SeriesInfo = {
        title: string;
        category: string;
        passingMarks: number;
        sections: Array<{ id: string; title: string; marksPerQuestion?: number }>;
    };
    const seriesById = new Map<string, SeriesInfo>();
    const testTitleByCompound = new Map<string, string>();

    const teacherChunks: string[][] = [];
    const uniqueTeachers = Array.from(new Set(teacherIds.filter(Boolean)));
    for (let i = 0; i < uniqueTeachers.length; i += 30) {
        teacherChunks.push(uniqueTeachers.slice(i, i + 30));
    }

    const quizQueries = [
        adminDb.collection("quizzes").where("instituteId", "==", instituteId).get(),
        ...teacherChunks.map((chunk) =>
            adminDb.collection("quizzes").where("teacherId", "in", chunk).get()
        ),
    ];
    const testQueries = [
        adminDb.collection("tests").where("instituteId", "==", instituteId).get(),
        ...teacherChunks.map((chunk) =>
            adminDb.collection("tests").where("teacherId", "in", chunk).get()
        ),
    ];

    const [quizSnaps, testSnaps] = await Promise.all([
        Promise.all(quizQueries),
        Promise.all(testQueries),
    ]);

    for (const snap of quizSnaps) {
        for (const d of snap.docs) {
            if (quizzes.has(d.id)) continue;
            const data = d.data() || {};
            quizzes.set(d.id, {
                title: data.title || "Quiz",
                category: data.category || "Uncategorised",
                passingPercentage: data.passingPercentage || 0,
            });
        }
    }

    const seriesDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const snap of testSnaps) {
        for (const d of snap.docs) {
            if (!seriesDocs.has(d.id)) seriesDocs.set(d.id, d);
        }
    }
    await Promise.all(
        Array.from(seriesDocs.values()).map(async (seriesDoc) => {
            const sData = seriesDoc.data() || {};
            seriesById.set(seriesDoc.id, {
                title: sData.title || "Test",
                category: sData.category || "Uncategorised",
                passingMarks: sData.passingMarks || 0,
                sections: Array.isArray(sData.sections) ? sData.sections : [],
            });
            const childrenSnap = await seriesDoc.ref.collection("tests").get();
            childrenSnap.docs.forEach((child) => {
                const c = child.data() || {};
                testTitleByCompound.set(`${seriesDoc.id}:${child.id}`, c.title || child.id);
            });
        })
    );

    return { quizzes, seriesById, testTitleByCompound };
}

export async function buildInstituteReport(instituteId: string): Promise<InstituteReport> {
    const classesSnap = await adminDb
        .collection("classes")
        .where("instituteId", "==", instituteId)
        .get();

    const classes = classesSnap.docs.map((d) => {
        const data = d.data() || {};
        return {
            classId: d.id,
            className: data.name || "Untitled class",
            teacherId: (data.teacherId as string) || "",
            teacherName: (data.teacherName as string) || null,
        };
    });

    // Rosters for every class, fetched in parallel.
    const rosters = await Promise.all(classes.map((c) => loadClassRoster(c.classId)));

    // One attempts fetch across ALL students (deduped), not one per class.
    const allStudentIds = Array.from(
        new Set(rosters.flat().map((s) => s.studentId).filter(Boolean))
    );
    const contentIndex = await loadInstituteContentIndex(
        instituteId,
        classes.map((c) => c.teacherId)
    );
    const totalAssignedContent = contentIndex.quizzes.size + contentIndex.seriesById.size;
    const allAttempts = allStudentIds.length
        ? await loadAttemptsForUsers(allStudentIds, contentIndex)
        : [];
    const attemptsByUser = new Map<string, AttemptRecord[]>();
    for (const attempt of allAttempts) {
        const list = attemptsByUser.get(attempt.userId) || [];
        list.push(attempt);
        attemptsByUser.set(attempt.userId, list);
    }

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;

    const classRows: ClassReportRow[] = [];
    const atRiskStudents: AtRiskStudentRow[] = [];
    // A student enrolled in two classes counts once in institute totals.
    const countedStudents = new Set<string>();
    const totals = {
        activeStudents: 0,
        participated: 0,
        attempts: 0,
        attemptsLast30d: 0,
        ready: 0,
        developing: 0,
        atRisk: 0,
        pctSum: 0,
        pctCount: 0,
    };

    classes.forEach((cls, index) => {
        const roster = rosters[index].filter((s) => s.status === "active");
        let participated = 0;
        let attempts = 0;
        let pctSum = 0;
        let pctCount = 0;
        let ready = 0;
        let developing = 0;
        let atRisk = 0;

        for (const student of roster) {
            const studentAttempts = attemptsByUser.get(student.studentId) || [];
            const completed = studentAttempts.filter((a) => COMPLETED_STATUSES.has(a.status));
            const completedContentIds = new Set(completed.map((a) => a.contentId));
            const lastActiveMs = Math.max(
                ...studentAttempts.map((a) => Math.max(a.completedAtMs, a.startedAtMs)),
                toMillis(student.lastActiveAt),
                0
            );
            const risk = computeRiskScore({
                completed,
                totalAssignedContent,
                completedContentCount: completedContentIds.size,
                lastActiveAtMs: lastActiveMs > 0 ? lastActiveMs : null,
            });
            const band = bandFromRisk(risk.band);

            attempts += studentAttempts.length;
            if (completed.length > 0) {
                participated += 1;
                pctSum += completed.reduce((s, r) => s + r.percentage, 0);
                pctCount += completed.length;
            }
            if (band === "ready") ready += 1;
            else if (band === "developing") developing += 1;
            else atRisk += 1;

            const isNewForTotals = !countedStudents.has(student.studentId);
            if (isNewForTotals) {
                countedStudents.add(student.studentId);
                totals.activeStudents += 1;
                totals.attempts += studentAttempts.length;
                totals.attemptsLast30d += studentAttempts.filter(
                    (a) => Math.max(a.completedAtMs, a.startedAtMs) >= thirtyDaysAgo
                ).length;
                if (completed.length > 0) {
                    totals.participated += 1;
                    totals.pctSum += completed.reduce((s, r) => s + r.percentage, 0);
                    totals.pctCount += completed.length;
                }
                if (band === "ready") totals.ready += 1;
                else if (band === "developing") totals.developing += 1;
                else totals.atRisk += 1;

                if (band === "at_risk") {
                    atRiskStudents.push({
                        studentId: student.studentId,
                        studentName: student.studentName,
                        studentEmail: student.studentEmail,
                        className: cls.className,
                        averagePercentage: risk.metrics.averagePercentage,
                        daysSinceLastActive: risk.metrics.daysSinceLastActive,
                        reasons: risk.reasons,
                    });
                }
            }
        }

        classRows.push({
            classId: cls.classId,
            className: cls.className,
            teacherName: cls.teacherName,
            activeStudents: roster.length,
            participated,
            participationPercent:
                roster.length > 0 ? clampPercent((participated / roster.length) * 100) : 0,
            attempts,
            averagePercentage: pctCount > 0 ? clampPercent(pctSum / pctCount) : null,
            ready,
            developing,
            atRisk,
        });
    });

    classRows.sort((a, b) => b.activeStudents - a.activeStudents);
    // Worst-off first, so the TPO sees who needs intervention immediately.
    atRiskStudents.sort(
        (a, b) => (a.averagePercentage ?? -1) - (b.averagePercentage ?? -1)
    );

    return {
        generatedAt: new Date().toISOString(),
        totals: {
            classes: classes.length,
            activeStudents: totals.activeStudents,
            participated: totals.participated,
            participationPercent:
                totals.activeStudents > 0
                    ? clampPercent((totals.participated / totals.activeStudents) * 100)
                    : 0,
            attempts: totals.attempts,
            attemptsLast30d: totals.attemptsLast30d,
            averagePercentage:
                totals.pctCount > 0 ? clampPercent(totals.pctSum / totals.pctCount) : null,
            ready: totals.ready,
            developing: totals.developing,
            atRisk: totals.atRisk,
        },
        classes: classRows,
        atRiskStudents: atRiskStudents.slice(0, 25),
    };
}
