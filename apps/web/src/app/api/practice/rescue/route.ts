import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { loadProblemById } from "@/lib/server/practice";

export const dynamic = "force-dynamic";

/**
 * Mentor Rescue — a student flags a problem they're stuck on. We attach
 * their latest submission for context and route it to one of their
 * classroom teachers (if any) or the open pool.
 *
 * Body: { problemId, message, submissionId? }
 */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const problemId = String(body.problemId || "");
        const message = String(body.message || "").slice(0, 2000);
        const submissionId = body.submissionId ? String(body.submissionId) : null;
        if (!problemId) return NextResponse.json({ error: "Missing problemId" }, { status: 400 });

        const problem = await loadProblemById(problemId);
        if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });

        // Resolve a mentor: the teacher of any class the student is enrolled in.
        let teacherId: string | null = null;
        try {
            const enroll = await adminDb
                .collectionGroup("students")
                .where("studentId", "==", userId)
                .where("status", "==", "active")
                .limit(1)
                .get();
            if (!enroll.empty) {
                const path = enroll.docs[0].ref.path.split("/");
                if (path[0] === "classes") {
                    const classDoc = await adminDb.collection("classes").doc(path[1]).get();
                    teacherId = classDoc.data()?.teacherId || null;
                } else if (path[0] === "teacher_enrollments") {
                    teacherId = path[1];
                }
            }
        } catch {
            /* open pool */
        }

        // Pull the user's display name for the mentor's queue.
        const userSnap = await adminDb.collection("users").doc(userId).get();
        const userName = userSnap.data()?.displayName || userSnap.data()?.email || "Student";

        const now = Timestamp.now();
        const ref = await adminDb.collection("practiceRescueRequests").add({
            userId,
            userName,
            problemId,
            problemTitle: problem.title,
            submissionId,
            message,
            teacherId,
            status: "open",
            mentorReply: null,
            mentorId: null,
            createdAt: now,
            answeredAt: null,
        });

        return NextResponse.json({
            id: ref.id,
            routedTo: teacherId ? "your mentor" : "the mentor pool",
            teacherId,
        });
    } catch (error: any) {
        console.error("Rescue request failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
