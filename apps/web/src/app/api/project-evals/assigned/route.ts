import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getStudentActiveClassIds } from "@/lib/server/classes";
import {
    PROJECT_EVALS,
    PROJECT_SUBMISSIONS,
    getStudentTeacherIds,
    serializeEvaluation,
    serializeSubmission,
    submissionDocId,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/**
 * Project evaluations visible to the signed-in student: published (or
 * closed, so past work stays visible) evaluations assigned to one of
 * their classes, plus "all students" evaluations from teachers they're
 * enrolled with. Each row carries the student's own submission, if any.
 */
export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
        }

        const [classIds, teacherIds] = await Promise.all([
            getStudentActiveClassIds(userId),
            getStudentTeacherIds(userId),
        ]);

        // Firestore allows only ONE disjunctive clause (`in` /
        // `array-contains-any`) per query, so the visibility filter
        // (published/closed) is applied in code below.
        const byId = new Map<string, any>();
        const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
        for (const ids of chunk(classIds, 10)) {
            queries.push(
                adminDb
                    .collection(PROJECT_EVALS)
                    .where("classIds", "array-contains-any", ids)
                    .get()
            );
        }
        for (const ids of chunk(teacherIds, 10)) {
            queries.push(
                adminDb
                    .collection(PROJECT_EVALS)
                    .where("assignedMode", "==", "all_students")
                    .where("teacherId", "in", ids)
                    .get()
            );
        }
        const snaps = await Promise.all(queries);
        snaps.forEach((snap) =>
            snap.docs.forEach((d) => {
                const status = d.data()?.status;
                if (status !== "published" && status !== "closed") return;
                if (!byId.has(d.id)) byId.set(d.id, serializeEvaluation(d));
            })
        );

        const evaluations = Array.from(byId.values()).sort((a, b) =>
            (b.createdAt || "").localeCompare(a.createdAt || "")
        );

        // Attach this student's submission per eval (direct doc reads).
        const withSubmissions = await Promise.all(
            evaluations.map(async (ev) => {
                const snap = await adminDb
                    .collection(PROJECT_SUBMISSIONS)
                    .doc(submissionDocId(ev.id, userId))
                    .get();
                return {
                    ...ev,
                    mySubmission: snap.exists
                        ? serializeSubmission(snap, { forStudent: true })
                        : null,
                };
            })
        );

        return NextResponse.json({ evaluations: withSubmissions });
    } catch (error: any) {
        console.error("List assigned project evals failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
