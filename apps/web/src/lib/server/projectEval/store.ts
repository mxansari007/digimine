/**
 * Firestore access + serialization for project evaluation. Both
 * collections are server-only (admin SDK); doc shapes mirror
 * `@digimine/types` projectEvaluation.ts.
 */
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";
import { isInstituteAdmin } from "@/lib/server/institutes";
import { getStudentActiveClassIds } from "@/lib/server/classes";
import type { ProjectEvalParameter } from "@digimine/types";

export const PROJECT_EVALS = "projectEvaluations";
export const PROJECT_SUBMISSIONS = "projectSubmissions";

export function submissionDocId(evaluationId: string, studentId: string): string {
    return `${evaluationId}_${studentId}`;
}

export async function getEvaluationById(evalId: string): Promise<any | null> {
    if (!evalId) return null;
    const snap = await adminDb.collection(PROJECT_EVALS).doc(evalId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * May this user manage (view submissions of / edit / review) the
 * evaluation? Owner teacher always; institute admins for institute-
 * affiliated teachers' evaluations.
 */
export async function canManageEvaluation(evalData: any, userId: string): Promise<boolean> {
    if (!evalData || !userId) return false;
    if (evalData.teacherId === userId) return true;
    if (evalData.instituteId) {
        return isInstituteAdmin(evalData.instituteId, userId);
    }
    return false;
}

/**
 * Teacher ids a student is actively enrolled with — classes (new shape)
 * plus legacy teacher_enrollments. Used for "all_students" assignment.
 */
export async function getStudentTeacherIds(studentId: string): Promise<string[]> {
    if (!studentId) return [];
    const snap = await adminDb
        .collectionGroup("students")
        .where("studentId", "==", studentId)
        .where("status", "==", "active")
        .get();
    const classIds = new Set<string>();
    const teacherIds = new Set<string>();
    snap.docs.forEach((d) => {
        const segments = d.ref.path.split("/");
        if (segments[0] === "classes" && segments.length >= 2) classIds.add(segments[1]);
        if (segments[0] === "teacher_enrollments" && segments.length >= 2) teacherIds.add(segments[1]);
    });
    await Promise.all(
        Array.from(classIds).map(async (classId) => {
            const c = await adminDb.collection("classes").doc(classId).get();
            const tid = c.exists ? c.data()?.teacherId : null;
            if (typeof tid === "string" && tid) teacherIds.add(tid);
        })
    );
    return Array.from(teacherIds);
}

/** Can this student see / submit to the evaluation? */
export async function studentCanAccessEvaluation(
    evalData: any,
    studentId: string
): Promise<boolean> {
    if (!evalData || !studentId) return false;
    if (evalData.status !== "published" && evalData.status !== "closed") return false;
    if (evalData.assignedMode === "all_students") {
        const teacherIds = await getStudentTeacherIds(studentId);
        return teacherIds.includes(evalData.teacherId);
    }
    const classIds: string[] = Array.isArray(evalData.classIds) ? evalData.classIds : [];
    if (classIds.length === 0) return false;
    const mine = await getStudentActiveClassIds(studentId);
    return classIds.some((id) => mine.includes(id));
}

/**
 * Evaluations visible inside one classroom: those assigned to the class
 * directly, plus the owning teacher's "all students" evaluations. Only
 * published/closed are returned (drafts are teacher-private).
 */
export async function listClassProjectEvals(classDoc: {
    id: string;
    teacherId?: string;
}): Promise<any[]> {
    const [byClass, byTeacher] = await Promise.all([
        adminDb
            .collection(PROJECT_EVALS)
            .where("classIds", "array-contains", classDoc.id)
            .get(),
        classDoc.teacherId
            ? adminDb
                  .collection(PROJECT_EVALS)
                  .where("assignedMode", "==", "all_students")
                  .where("teacherId", "==", classDoc.teacherId)
                  .get()
            : Promise.resolve(null),
    ]);
    const byId = new Map<string, any>();
    const collect = (snap: FirebaseFirestore.QuerySnapshot | null) => {
        snap?.docs.forEach((d) => {
            const status = d.data()?.status;
            if (status !== "published" && status !== "closed") return;
            if (!byId.has(d.id)) byId.set(d.id, { id: d.id, ...d.data() });
        });
    };
    collect(byClass);
    collect(byTeacher);
    return Array.from(byId.values()).sort(
        (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );
}

export interface ClassProjectEvalStat {
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    maxTotalScore: number;
    /** Students of THIS roster who submitted / were scored. */
    submitted: number;
    scored: number;
    pending: number;
    /** Mean of (teacher-final ?? AI) percentage across scored submissions. */
    averagePercent: number | null;
}

/**
 * Per-evaluation progress stats scoped to one class roster — used by the
 * class progress/analytics modules. An evaluation can be assigned to many
 * classes, so submissions are filtered to the given roster.
 */
export async function buildClassProjectEvalStats(
    classDoc: { id: string; teacherId?: string },
    rosterStudentIds: string[]
): Promise<ClassProjectEvalStat[]> {
    const evals = await listClassProjectEvals(classDoc);
    if (evals.length === 0) return [];
    const rosterSet = new Set(rosterStudentIds);

    return Promise.all(
        evals.map(async (ev) => {
            const snap = await adminDb
                .collection(PROJECT_SUBMISSIONS)
                .where("evaluationId", "==", ev.id)
                .get();
            const rows = snap.docs
                .map((d) => d.data() || {})
                .filter((s) => rosterSet.has(s.studentId));
            const scoredRows = rows.filter((s) => s.status === "scored");
            const maxTotal = ev.maxTotalScore ?? 0;
            const percents = scoredRows
                .map((s) => {
                    const score = s.teacherReview?.finalScore ?? s.totalScore;
                    const max = s.maxTotalScore ?? maxTotal;
                    return typeof score === "number" && max > 0 ? (score / max) * 100 : null;
                })
                .filter((v): v is number => v !== null);
            return {
                id: ev.id,
                title: ev.title || "",
                status: ev.status || "published",
                dueAt: toIsoDate(ev.dueAt),
                maxTotalScore: maxTotal,
                submitted: rows.length,
                scored: scoredRows.length,
                pending: Math.max(0, rosterSet.size - rows.length),
                averagePercent: percents.length
                    ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
                    : null,
            };
        })
    );
}

export interface StudentProjectResult {
    evaluationId: string;
    title: string;
    evalStatus: string;
    dueAt: string | null;
    maxTotalScore: number;
    /** null = not submitted. */
    submission: {
        status: string;
        totalScore: number | null;
        /** Teacher-final when reviewed, else the AI score. */
        finalScore: number | null;
        reviewed: boolean;
        /** Whether the result has been released to the student. */
        published: boolean;
        attempt: number;
        submittedAt: string | null;
    } | null;
}

/**
 * One student's standing across a teacher's project evaluations — used by
 * the student progress module. Direct doc reads (`{evalId}_{studentId}`),
 * no queries needed per submission.
 */
export async function listStudentProjectResults(
    teacherId: string,
    studentId: string
): Promise<StudentProjectResult[]> {
    const snap = await adminDb
        .collection(PROJECT_EVALS)
        .where("teacherId", "==", teacherId)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
    const evals = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((ev) => ev.status === "published" || ev.status === "closed");

    return Promise.all(
        evals.map(async (ev) => {
            const subSnap = await adminDb
                .collection(PROJECT_SUBMISSIONS)
                .doc(submissionDocId(ev.id, studentId))
                .get();
            const s = subSnap.exists ? subSnap.data() || {} : null;
            return {
                evaluationId: ev.id,
                title: ev.title || "",
                evalStatus: ev.status,
                dueAt: toIsoDate(ev.dueAt),
                maxTotalScore: ev.maxTotalScore ?? 0,
                submission: s
                    ? {
                          status: s.status || "queued",
                          totalScore: s.totalScore ?? null,
                          finalScore: s.teacherReview?.finalScore ?? s.totalScore ?? null,
                          reviewed: Boolean(s.teacherReview),
                          published: s.resultPublished === true,
                          attempt: s.attempt ?? 1,
                          submittedAt: toIsoDate(s.submittedAt),
                      }
                    : null,
            };
        })
    );
}

export function sanitizeParameters(raw: any): ProjectEvalParameter[] | { error: string } {
    if (!Array.isArray(raw) || raw.length === 0) {
        return { error: "Add at least one scoring parameter." };
    }
    if (raw.length > 12) return { error: "At most 12 scoring parameters." };
    const parameters: ProjectEvalParameter[] = [];
    for (let i = 0; i < raw.length; i++) {
        const p = raw[i] || {};
        const title = typeof p.title === "string" ? p.title.trim().slice(0, 120) : "";
        const description =
            typeof p.description === "string" ? p.description.trim().slice(0, 1200) : "";
        const maxScore = Number(p.maxScore);
        if (!title) return { error: `Parameter ${i + 1} needs a title.` };
        if (!description) return { error: `Parameter "${title}" needs a description of what you expect.` };
        if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 100) {
            return { error: `Parameter "${title}" needs a max score between 1 and 100.` };
        }
        parameters.push({ id: `p${i + 1}`, title, description, maxScore: Math.round(maxScore) });
    }
    return parameters;
}

export function serializeEvaluation(doc: any) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        title: data.title || "",
        brief: data.brief || "",
        techStack: data.techStack ?? null,
        parameters: Array.isArray(data.parameters) ? data.parameters : [],
        maxTotalScore: data.maxTotalScore ?? 0,
        teacherId: data.teacherId || "",
        instituteId: data.instituteId ?? null,
        assignedMode: data.assignedMode === "all_students" ? "all_students" : "classes",
        classIds: Array.isArray(data.classIds) ? data.classIds : [],
        status: data.status || "draft",
        dueAt: toIsoDate(data.dueAt),
        submissionCount: data.submissionCount ?? 0,
        evaluatedCount: data.evaluatedCount ?? 0,
        createdAt: toIsoDate(data.createdAt),
        updatedAt: toIsoDate(data.updatedAt),
    };
}

export function serializeSubmission(doc: any, opts: { forStudent?: boolean } = {}) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    const repoMeta = data.repoMeta
        ? {
              ...data.repoMeta,
              lastCommitAt: toIsoDate(data.repoMeta.lastCommitAt),
          }
        : null;
    const teacherReview = data.teacherReview
        ? { ...data.teacherReview, reviewedAt: toIsoDate(data.teacherReview.reviewedAt) }
        : null;
    const resultPublished = data.resultPublished === true;
    const base = {
        id: doc.id || data.id,
        evaluationId: data.evaluationId || "",
        studentId: data.studentId || "",
        studentName: data.studentName || "",
        repoUrl: data.repoUrl || "",
        repoRef: data.repoRef ?? null,
        status: data.status || "queued",
        attempt: data.attempt ?? 1,
        repoMeta,
        overview: data.overview ?? null,
        scores: Array.isArray(data.scores) ? data.scores : null,
        totalScore: data.totalScore ?? null,
        maxTotalScore: data.maxTotalScore ?? null,
        error: data.error ?? null,
        teacherReview,
        resultPublished,
        resultPublishedAt: toIsoDate(data.resultPublishedAt),
        submittedAt: toIsoDate(data.submittedAt),
        processedAt: toIsoDate(data.processedAt),
        updatedAt: toIsoDate(data.updatedAt),
    };
    if (opts.forStudent) {
        // A scored-but-unpublished result is the teacher's private draft —
        // strip the entire report so nothing leaks over the wire until they
        // release it. The student sees status "scored" + resultPublished:false
        // and the UI renders an "under review" state instead of the marksheet.
        if (data.status === "scored" && !resultPublished) {
            return {
                ...base,
                repoMeta: null,
                overview: null,
                scores: null,
                totalScore: null,
                maxTotalScore: null,
                teacherReview: null,
            };
        }
        return base;
    }
    return { ...base, studentEmail: data.studentEmail || "", retryCount: data.retryCount ?? 0 };
}

/**
 * Reset submissions stuck in "processing" (function timed out / crashed
 * mid-run). Called opportunistically from the teacher submissions list
 * and from the reap route — there is no always-on worker to lean on.
 */
export async function reapStuckSubmissions(evaluationId?: string): Promise<number> {
    const cutoff = Timestamp.fromMillis(Date.now() - 20 * 60 * 1000);
    let query = adminDb
        .collection(PROJECT_SUBMISSIONS)
        .where("status", "==", "processing")
        .where("processingStartedAt", "<", cutoff)
        .limit(20);
    if (evaluationId) {
        query = adminDb
            .collection(PROJECT_SUBMISSIONS)
            .where("evaluationId", "==", evaluationId)
            .where("status", "==", "processing")
            .limit(20);
    }
    const snap = await query.get();
    let reset = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        // The evaluationId-scoped variant can't range-filter without
        // another composite index, so re-check staleness here.
        const startedAt = data.processingStartedAt?.toMillis?.() ?? 0;
        if (startedAt > cutoff.toMillis()) continue;
        const retryCount = data.retryCount ?? 0;
        if (retryCount >= 2) {
            await doc.ref.update({
                status: "failed",
                error: "Evaluation timed out repeatedly. Click Retry to run it again.",
                updatedAt: Timestamp.now(),
            });
        } else {
            await doc.ref.update({
                status: "queued",
                retryCount: retryCount + 1,
                updatedAt: Timestamp.now(),
            });
        }
        reset++;
    }
    return reset;
}
