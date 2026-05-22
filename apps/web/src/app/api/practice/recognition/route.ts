import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import {
    computeMasteryScore,
    masteryLevel,
} from "@digimine/types";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { MASTERY, PROGRESS, loadProblemById, masteryId, progressId } from "@/lib/server/practice";

export const dynamic = "force-dynamic";

/**
 * Pattern Lens — record whether the user correctly classified a problem's
 * pattern (before viewing the editorial). Updates per-problem progress and
 * per-pattern recognition counters that feed the Mastery Map.
 *
 * Body: { problemId, chosenPattern }
 */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const problemId = String(body.problemId || "");
        const chosen = String(body.chosenPattern || "");
        if (!problemId || !chosen) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

        const problem = await loadProblemById(problemId);
        if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });

        const correct = chosen === problem.primaryPattern;
        const now = Timestamp.now();

        // Idempotent per problem: only the first recognition answer counts
        // toward mastery, so re-answering doesn't farm the metric.
        const progRef = adminDb.collection(PROGRESS).doc(progressId(userId, problemId));
        const progSnap = await progRef.get();
        const prev = progSnap.exists ? progSnap.data() || {} : {};
        const alreadyAnswered = Boolean(prev.recognitionAnswered);

        await progRef.set(
            {
                userId,
                problemId,
                kind: problem.kind,
                primaryPattern: problem.primaryPattern,
                difficulty: problem.difficulty,
                status: prev.status || "attempted",
                recognitionAnswered: true,
                recognitionCorrect: alreadyAnswered ? Boolean(prev.recognitionCorrect) : correct,
                updatedAt: now,
                createdAt: prev.createdAt || now,
            },
            { merge: true }
        );

        if (!alreadyAnswered) {
            const mRef = adminDb.collection(MASTERY).doc(masteryId(userId, problem.primaryPattern));
            const mSnap = await mRef.get();
            const m = mSnap.exists ? mSnap.data() || {} : {};
            const next = {
                attempted: m.attempted ?? 0,
                solved: m.solved ?? 0,
                solvedFirstTry: m.solvedFirstTry ?? 0,
                easySolved: m.easySolved ?? 0,
                mediumSolved: m.mediumSolved ?? 0,
                hardSolved: m.hardSolved ?? 0,
                recognitionCorrect: (m.recognitionCorrect ?? 0) + (correct ? 1 : 0),
                recognitionTotal: (m.recognitionTotal ?? 0) + 1,
            };
            const score = computeMasteryScore({ ...next, lastPracticedAtMs: now.toMillis() }, now.toMillis());
            await mRef.set(
                {
                    userId,
                    pattern: problem.primaryPattern,
                    kind: problem.kind,
                    ...next,
                    masteryScore: score,
                    level: masteryLevel(score),
                    lastPracticedAt: now,
                    updatedAt: now,
                },
                { merge: true }
            );
        }

        return NextResponse.json({
            correct,
            correctPattern: problem.primaryPattern,
            alreadyAnswered,
        });
    } catch (error: any) {
        console.error("Recognition failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
