import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, isPublishedContent, toIsoDate } from "@/lib/server/classroomAccess";
import { computeRiskScore, type AttemptRecord } from "@/lib/server/teacherAnalytics";

export const dynamic = "force-dynamic";

const IN_CHUNK = 30;
const COMPLETED_STATUSES = new Set(["completed", "timed_out"]);

type ProgressAggregate = {
    totalAttempts: number;
    completedAttempts: number;
    inProgressAttempts: number;
    percentageTotal: number;
    percentageCount: number;
    bestPercentage: number | null;
    completedContentIds: Set<string>;
    lastActiveAtMs: number;
    lastContentTitle: string | null;
    // Lightweight stand-ins for AttemptRecord that computeRiskScore expects.
    completedRecords: Array<Pick<AttemptRecord, "percentage" | "completedAtMs">>;
};

function chunkValues<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < values.length; i += size) {
        chunks.push(values.slice(i, i + size));
    }
    return chunks;
}

function toMillis(value: any): number {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function clampPercentage(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function getAttemptPercentage(data: FirebaseFirestore.DocumentData): number {
    if (typeof data.percentage === "number") {
        return clampPercentage(data.percentage);
    }

    if (typeof data.totalScore === "number" && typeof data.maxPossibleScore === "number" && data.maxPossibleScore > 0) {
        return clampPercentage((data.totalScore / data.maxPossibleScore) * 100);
    }

    return 0;
}

function createAggregate(enrollment: FirebaseFirestore.DocumentData): ProgressAggregate {
    return {
        totalAttempts: 0,
        completedAttempts: 0,
        inProgressAttempts: 0,
        percentageTotal: 0,
        percentageCount: 0,
        bestPercentage: null,
        completedContentIds: new Set<string>(),
        lastActiveAtMs: toMillis(enrollment.lastActiveAt || enrollment.enrolledAt),
        lastContentTitle: null,
        completedRecords: [],
    };
}

function attemptActivityMs(data: FirebaseFirestore.DocumentData): number {
    return Math.max(
        toMillis(data.updatedAt),
        toMillis(data.completedAt),
        toMillis(data.startedAt),
        toMillis(data.createdAt)
    );
}

function applyAttempt(
    aggregate: ProgressAggregate,
    data: FirebaseFirestore.DocumentData,
    contentKey: string,
    title: string
) {
    const status = String(data.status || "");
    const activityMs = attemptActivityMs(data);

    aggregate.totalAttempts += 1;
    if (status === "in_progress") aggregate.inProgressAttempts += 1;

    if (activityMs > aggregate.lastActiveAtMs) {
        aggregate.lastActiveAtMs = activityMs;
        aggregate.lastContentTitle = title;
    }

    if (COMPLETED_STATUSES.has(status)) {
        const percentage = getAttemptPercentage(data);
        aggregate.completedAttempts += 1;
        aggregate.completedContentIds.add(contentKey);
        aggregate.percentageTotal += percentage;
        aggregate.percentageCount += 1;
        aggregate.bestPercentage = aggregate.bestPercentage === null
            ? percentage
            : Math.max(aggregate.bestPercentage, percentage);
        aggregate.completedRecords.push({
            percentage,
            completedAtMs: toMillis(data.completedAt) || activityMs,
        });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const teacherId = searchParams.get("teacherId");

        if (!teacherId) {
            return NextResponse.json({ error: "teacherId is required" }, { status: 400 });
        }

        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in as the teacher to view progress." }, { status: 401 });
        }
        if (tokenUserId !== teacherId) {
            return NextResponse.json({ error: "You can only view your own classroom progress." }, { status: 403 });
        }

        const [legacyEnrollmentsSnap, classesSnap, quizzesSnap, testsSnap] = await Promise.all([
            adminDb
                .collection("teacher_enrollments")
                .doc(teacherId)
                .collection("students")
                .orderBy("enrolledAt", "desc")
                .get(),
            adminDb.collection("classes").where("teacherId", "==", teacherId).get(),
            adminDb.collection("quizzes").where("teacherId", "==", teacherId).get(),
            adminDb.collection("tests").where("teacherId", "==", teacherId).get(),
        ]);

        // Build per-student class membership map. We also collect a flat list of
        // classes so the UI can render a class filter.
        const classesById = new Map<string, { id: string; name: string; isArchived: boolean }>();
        classesSnap.docs.forEach((c) => {
            const d = c.data() || {};
            classesById.set(c.id, {
                id: c.id,
                name: d.name || "Class",
                isArchived: Boolean(d.isArchived),
            });
        });
        const membershipsByStudent = new Map<string, { classId: string; className: string; status: string }[]>();
        await Promise.all(
            classesSnap.docs.map(async (classDoc) => {
                const classData = classDoc.data() || {};
                const className = classData.name || "Class";
                const memberSnap = await classDoc.ref.collection("students").get();
                memberSnap.docs.forEach((m) => {
                    const md = m.data() || {};
                    const studentId = md.studentId || m.id;
                    if (!studentId) return;
                    const existing = membershipsByStudent.get(studentId) || [];
                    existing.push({
                        classId: classDoc.id,
                        className,
                        status: md.status || "active",
                    });
                    membershipsByStudent.set(studentId, existing);
                });
            })
        );

        // Pull roster from every class this teacher owns (new shape) plus the
        // legacy single-classroom shape. De-duplicate by studentId so a
        // student in two classes only appears once.
        const classRosters = await Promise.all(
            classesSnap.docs.map(async (classDoc) => {
                const snap = await classDoc.ref.collection("students").get();
                return snap.docs;
            })
        );
        const allRosterDocs = [...legacyEnrollmentsSnap.docs, ...classRosters.flat()];

        const rosterByStudent = new Map<string, any>();
        allRosterDocs.forEach((doc) => {
            const data = doc.data() || {};
            const studentId = data.studentId || doc.id;
            if (!studentId) return;
            const prev = rosterByStudent.get(studentId);
            const enrolledMs = toMillis(data.enrolledAt);
            if (!prev || (toMillis(prev.enrolledAt) || 0) < enrolledMs) {
                rosterByStudent.set(studentId, {
                    id: doc.id,
                    studentId,
                    studentEmail: data.studentEmail || prev?.studentEmail || "",
                    studentName: data.studentName || prev?.studentName || data.studentEmail || "Student",
                    rollNumber: data.rollNumber || prev?.rollNumber || null,
                    enrolledAt: data.enrolledAt || prev?.enrolledAt,
                    status: data.status || prev?.status || "active",
                    totalAttempts: data.totalAttempts || prev?.totalAttempts || 0,
                    lastActiveAt: data.lastActiveAt || prev?.lastActiveAt || null,
                });
            }
        });

        const students = Array.from(rosterByStudent.values())
            .map((s) => ({
                ...s,
                enrolledAt: toIsoDate(s.enrolledAt),
                lastActiveAt: toIsoDate(s.lastActiveAt),
            }))
            .sort((a, b) => {
                const aTime = a.enrolledAt ? Date.parse(a.enrolledAt) : 0;
                const bTime = b.enrolledAt ? Date.parse(b.enrolledAt) : 0;
                return bTime - aTime;
            });

        const studentIds = students.map((student) => student.studentId).filter(Boolean);
        const aggregates = new Map<string, ProgressAggregate>();
        students.forEach((student) => {
            aggregates.set(student.studentId, createAggregate({
                enrolledAt: student.enrolledAt,
                lastActiveAt: student.lastActiveAt,
            }));
        });

        const quizIds = new Set<string>();
        const quizTitles = new Map<string, string>();
        quizzesSnap.docs.forEach((doc) => {
            const data = doc.data() || {};
            if (!isPublishedContent(data)) return;
            quizIds.add(doc.id);
            quizTitles.set(doc.id, data.title || doc.id);
        });

        const seriesIds = new Set<string>();
        const seriesTitles = new Map<string, string>();
        const testContentTitles = new Map<string, string>();
        const assignedTestKeys = new Set<string>();

        await Promise.all(testsSnap.docs.map(async (seriesDoc) => {
            const data = seriesDoc.data() || {};
            if (!isPublishedContent(data)) return;

            const seriesId = seriesDoc.id;
            const seriesTitle = data.title || seriesId;
            seriesIds.add(seriesId);
            seriesTitles.set(seriesId, seriesTitle);

            const childSnap = await seriesDoc.ref.collection("tests").get();
            const publishedChildren = childSnap.docs.filter((childDoc) => {
                const childData = childDoc.data() || {};
                return isPublishedContent(childData);
            });

            if (publishedChildren.length === 0) {
                const fallbackKey = `test:${seriesId}`;
                assignedTestKeys.add(fallbackKey);
                testContentTitles.set(fallbackKey, seriesTitle);
                return;
            }

            publishedChildren.forEach((childDoc) => {
                const childData = childDoc.data() || {};
                const key = `test:${seriesId}:${childDoc.id}`;
                assignedTestKeys.add(key);
                testContentTitles.set(key, `${seriesTitle}: ${childData.title || childDoc.id}`);
            });
        }));

        if (studentIds.length > 0) {
            const chunks = chunkValues(studentIds, IN_CHUNK);
            await Promise.all(chunks.map(async (chunk) => {
                const [quizAttemptsSnap, testAttemptsSnap] = await Promise.all([
                    adminDb.collection("quizAttempts").where("userId", "in", chunk).get(),
                    adminDb.collection("testAttempts").where("userId", "in", chunk).get(),
                ]);

                quizAttemptsSnap.docs.forEach((doc) => {
                    const data = doc.data() || {};
                    const userId = data.userId;
                    const quizId = data.quizId;
                    if (!quizIds.has(quizId)) return;

                    const aggregate = aggregates.get(userId);
                    if (!aggregate) return;

                    applyAttempt(
                        aggregate,
                        data,
                        `quiz:${quizId}`,
                        quizTitles.get(quizId) || data.title || "Quiz"
                    );
                });

                testAttemptsSnap.docs.forEach((doc) => {
                    const data = doc.data() || {};
                    const userId = data.userId;
                    const seriesId = data.seriesId;
                    const testId = data.testId;
                    if (!seriesIds.has(seriesId)) return;

                    const aggregate = aggregates.get(userId);
                    if (!aggregate) return;

                    const childKey = `test:${seriesId}:${testId}`;
                    const contentKey = testContentTitles.has(childKey) ? childKey : `test:${seriesId}`;

                    applyAttempt(
                        aggregate,
                        data,
                        contentKey,
                        testContentTitles.get(contentKey) || seriesTitles.get(seriesId) || data.title || "Test"
                    );
                });
            }));
        }

        const totalAssignedContent = quizIds.size + assignedTestKeys.size;
        let totalAttempts = 0;
        let completedAttempts = 0;
        let inProgressAttempts = 0;
        let activeStudents = 0;

        const progressStudents = students.map((student) => {
            const aggregate = aggregates.get(student.studentId) || createAggregate(student as any);
            totalAttempts += aggregate.totalAttempts;
            completedAttempts += aggregate.completedAttempts;
            inProgressAttempts += aggregate.inProgressAttempts;
            if (student.status === "active") activeStudents += 1;

            const averagePercentage = aggregate.percentageCount > 0
                ? clampPercentage(aggregate.percentageTotal / aggregate.percentageCount)
                : null;
            const progressPercent = totalAssignedContent > 0
                ? clampPercentage((aggregate.completedContentIds.size / totalAssignedContent) * 100)
                : 0;

            const memberships = membershipsByStudent.get(student.studentId) || [];

            // computeRiskScore expects the partial AttemptRecord shape; we
            // only need the two fields it actually reads.
            const risk = computeRiskScore({
                completed: aggregate.completedRecords as any,
                totalAssignedContent,
                completedContentCount: aggregate.completedContentIds.size,
                lastActiveAtMs: aggregate.lastActiveAtMs > 0 ? aggregate.lastActiveAtMs : null,
            });

            // Sparkline = last 5 completed scores, chronological.
            const sparkline = [...aggregate.completedRecords]
                .sort((a, b) => a.completedAtMs - b.completedAtMs)
                .slice(-5)
                .map((r) => r.percentage);

            return {
                ...student,
                classes: memberships,
                progress: {
                    progressPercent,
                    totalAttempts: aggregate.totalAttempts,
                    completedAttempts: aggregate.completedAttempts,
                    inProgressAttempts: aggregate.inProgressAttempts,
                    averagePercentage,
                    bestPercentage: aggregate.bestPercentage,
                    completedContentCount: aggregate.completedContentIds.size,
                    totalAssignedContent,
                    lastActiveAt: aggregate.lastActiveAtMs ? new Date(aggregate.lastActiveAtMs).toISOString() : null,
                    lastContentTitle: aggregate.lastContentTitle,
                },
                risk,
                sparkline,
            };
        });

        // Aggregate roll-ups for the page header.
        const highRiskCount = progressStudents.filter((s) => s.status === "active" && s.risk.band === "high").length;
        const mediumRiskCount = progressStudents.filter((s) => s.status === "active" && s.risk.band === "medium").length;
        const inactive14dCount = progressStudents.filter((s) => {
            if (s.status !== "active") return false;
            const days = s.risk.metrics.daysSinceLastActive;
            return days === null || days >= 14;
        }).length;

        return NextResponse.json({
            students: progressStudents,
            classes: Array.from(classesById.values()),
            totals: {
                totalStudents: students.length,
                activeStudents,
                totalAssignedContent,
                totalAttempts,
                completedAttempts,
                inProgressAttempts,
                highRiskCount,
                mediumRiskCount,
                inactive14dCount,
            },
        });
    } catch (error: any) {
        console.error("Teacher student progress error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load student progress" },
            { status: 500 }
        );
    }
}
