import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { ALL_PATTERNS, pickNextProblems } from "@digimine/types";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { MASTERY, PROBLEMS, PROGRESS, serializeProblemSummary } from "@/lib/server/practice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });

        const now = Timestamp.now();
        const nowMs = now.toMillis();

        const [progressSnap, masterySnap, problemsSnap] = await Promise.all([
            adminDb.collection(PROGRESS).where("userId", "==", userId).limit(1000).get(),
            adminDb.collection(MASTERY).where("userId", "==", userId).get(),
            adminDb.collection(PROBLEMS).where("status", "==", "published").limit(300).get(),
        ]);

        // Progress rollups.
        let solved = 0;
        let attempted = 0;
        let dueCount = 0;
        const statusByProblem: Record<string, "todo" | "attempted" | "solved"> = {};
        const solveDays = new Set<string>();
        progressSnap.docs.forEach((d) => {
            const p = d.data() || {};
            statusByProblem[p.problemId] = p.status || "todo";
            if (p.status === "solved") {
                solved += 1;
                const due = p.dueAt?.toMillis ? p.dueAt.toMillis() : null;
                if (due && due <= nowMs) dueCount += 1;
                const solvedAt = p.solvedAt?.toMillis ? p.solvedAt.toMillis() : null;
                if (solvedAt) solveDays.add(new Date(solvedAt).toISOString().slice(0, 10));
            } else if (p.status === "attempted") {
                attempted += 1;
            }
        });

        // Streak: consecutive days (ending today or yesterday) with a solve.
        let streak = 0;
        {
            let cursor = nowMs;
            // allow today OR yesterday to start the streak
            const todayKey = new Date(nowMs).toISOString().slice(0, 10);
            const yKey = new Date(nowMs - DAY_MS).toISOString().slice(0, 10);
            if (!solveDays.has(todayKey) && solveDays.has(yKey)) cursor = nowMs - DAY_MS;
            for (let i = 0; i < 365; i++) {
                const key = new Date(cursor).toISOString().slice(0, 10);
                if (solveDays.has(key)) {
                    streak += 1;
                    cursor -= DAY_MS;
                } else {
                    break;
                }
            }
        }

        // Mastery rollup.
        const masteryByPattern: Record<string, any> = {};
        masterySnap.docs.forEach((d) => {
            const m = d.data() || {};
            masteryByPattern[m.pattern] = { masteryScore: m.masteryScore ?? 0, level: m.level ?? "novice", pattern: m.pattern };
        });
        const touched = Object.values(masteryByPattern) as any[];
        const overallMastery =
            touched.length > 0 ? Math.round(touched.reduce((s, m) => s + m.masteryScore, 0) / touched.length) : 0;
        const weakest = [...touched]
            .sort((a, b) => a.masteryScore - b.masteryScore)
            .slice(0, 3)
            .map((m) => {
                const meta = ALL_PATTERNS.find((p) => p.id === m.pattern);
                return { pattern: m.pattern, label: meta?.label || m.pattern, masteryScore: m.masteryScore };
            });

        // Adaptive recommendations.
        const candidates = problemsSnap.docs.map((d) => serializeProblemSummary(d.id, d.data() || {}));
        const recommended = pickNextProblems({ masteryByPattern, statusByProblem, candidates }, 6);

        return NextResponse.json({
            stats: {
                solved,
                attempted,
                dueCount,
                streak,
                overallMastery,
                totalProblems: candidates.length,
            },
            weakest,
            recommended,
        });
    } catch (error: any) {
        console.error("Practice dashboard failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
