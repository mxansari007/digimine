import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { PROBLEMS, PROGRESS, serializeProblemSummary } from "@/lib/server/practice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Revision Radar — the queue of solved problems that are due (or overdue)
 * for a spaced-repetition review, soonest first.
 */
export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });

        const now = Timestamp.now();
        let snap: FirebaseFirestore.QuerySnapshot;
        try {
            snap = await adminDb
                .collection(PROGRESS)
                .where("userId", "==", userId)
                .where("status", "==", "solved")
                .where("dueAt", "<=", now)
                .orderBy("dueAt", "asc")
                .limit(50)
                .get();
        } catch {
            // Index still building — fall back to client-side filter.
            const all = await adminDb
                .collection(PROGRESS)
                .where("userId", "==", userId)
                .where("status", "==", "solved")
                .limit(200)
                .get();
            const due = all.docs.filter((d) => {
                const due = d.data()?.dueAt;
                return due?.toMillis ? due.toMillis() <= now.toMillis() : false;
            });
            snap = { docs: due } as any;
        }

        const problemIds = snap.docs.map((d) => d.data()?.problemId).filter(Boolean);
        const problemDocs = await Promise.all(
            problemIds.slice(0, 50).map(async (pid: string) => {
                const p = await adminDb.collection(PROBLEMS).doc(pid).get();
                return p.exists ? serializeProblemSummary(p.id, p.data() || {}) : null;
            })
        );
        const byId = new Map(problemDocs.filter(Boolean).map((p: any) => [p.id, p]));

        const items = snap.docs
            .map((d) => {
                const data = d.data() || {};
                const problem = byId.get(data.problemId);
                if (!problem) return null;
                const dueMs = data.dueAt?.toMillis ? data.dueAt.toMillis() : now.toMillis();
                const overdueDays = Math.max(0, Math.round((now.toMillis() - dueMs) / (24 * 60 * 60 * 1000)));
                return {
                    problem,
                    dueAt: new Date(dueMs).toISOString(),
                    overdueDays,
                    repetitions: data.repetitions ?? 0,
                    intervalDays: data.intervalDays ?? 0,
                    lastGrade: data.lastGrade ?? 0,
                };
            })
            .filter(Boolean);

        return NextResponse.json({ items, count: items.length });
    } catch (error: any) {
        console.error("Revision queue failed:", error);
        return NextResponse.json({ items: [], count: 0 });
    }
}
