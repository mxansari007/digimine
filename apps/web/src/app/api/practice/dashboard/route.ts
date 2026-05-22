import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { ALL_PATTERNS, pickNextProblems } from "@digimine/types";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { MASTERY, PROBLEMS, PROGRESS, SUBMISSIONS, serializeProblemSummary } from "@/lib/server/practice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAY_MS = 24 * 60 * 60 * 1000;
const HEATMAP_DAYS = 182; // ~26 weeks

function dayKey(ms: number) {
    return new Date(ms).toISOString().slice(0, 10);
}

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });

        const now = Timestamp.now();
        const nowMs = now.toMillis();

        const [progressSnap, masterySnap, problemsSnap, submissionsSnap] = await Promise.all([
            adminDb.collection(PROGRESS).where("userId", "==", userId).limit(1000).get(),
            adminDb.collection(MASTERY).where("userId", "==", userId).get(),
            adminDb.collection(PROBLEMS).where("status", "==", "published").limit(300).get(),
            // Single-field index (userId) only — we bucket by day in code to
            // avoid needing a composite (userId + createdAt) index.
            adminDb.collection(SUBMISSIONS).where("userId", "==", userId).limit(4000).get(),
        ]);

        // Problem id → title/kind map (for recent-activity labels).
        const problemMeta: Record<string, { title: string; slug: string; kind: string }> = {};
        problemsSnap.docs.forEach((d) => {
            const p = d.data() || {};
            problemMeta[d.id] = { title: p.title || "Problem", slug: p.slug || "", kind: p.kind || "dsa" };
        });

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
            const todayKey = dayKey(nowMs);
            const yKey = dayKey(nowMs - DAY_MS);
            if (!solveDays.has(todayKey) && solveDays.has(yKey)) cursor = nowMs - DAY_MS;
            for (let i = 0; i < 365; i++) {
                const key = dayKey(cursor);
                if (solveDays.has(key)) {
                    streak += 1;
                    cursor -= DAY_MS;
                } else {
                    break;
                }
            }
        }

        // Longest streak ever (over all solve days).
        let longestStreak = 0;
        {
            const days = [...solveDays].sort();
            let run = 0;
            let prevMs: number | null = null;
            for (const key of days) {
                const ms = Date.parse(key);
                if (prevMs !== null && Math.round((ms - prevMs) / DAY_MS) === 1) {
                    run += 1;
                } else {
                    run = 1;
                }
                if (run > longestStreak) longestStreak = run;
                prevMs = ms;
            }
        }

        // How many published problems exist per pattern (the denominator for
        // coverage). Counts the PRIMARY pattern of each published problem.
        const totalByPattern: Record<string, number> = {};
        problemsSnap.docs.forEach((d) => {
            const p = (d.data() || {}).primaryPattern;
            if (p) totalByPattern[p] = (totalByPattern[p] || 0) + 1;
        });

        // Mastery rollup with a transparent, percentage-driven strength score.
        //
        //   accuracy = solved / attempted        (how often your attempts land)
        //   coverage = solved / totalAvailable   (how much of the pattern you've cleared)
        //   strength = 55% accuracy + 45% coverage   →   weakness = 100 - strength
        //
        // We surface patterns you've ACTUALLY attempted (real signal) sorted by
        // weakness; coverage pulls in patterns you've barely scratched.
        const masteryByPattern: Record<string, any> = {};
        masterySnap.docs.forEach((d) => {
            const m = d.data() || {};
            const attempted = m.attempted ?? 0;
            const solved = m.solved ?? 0;
            const total = totalByPattern[m.pattern] ?? 0;
            const wrong = Math.max(0, attempted - solved);
            const accuracy = attempted > 0 ? solved / attempted : 0;
            const coverage = total > 0 ? Math.min(1, solved / total) : 0;
            const strength = Math.round(100 * (0.55 * accuracy + 0.45 * coverage));
            masteryByPattern[m.pattern] = {
                pattern: m.pattern,
                attempted,
                solved,
                wrong,
                total,
                accuracyPct: Math.round(accuracy * 100),
                coveragePct: Math.round(coverage * 100),
                strength,
                weakness: 100 - strength,
                level: m.level ?? "novice",
                // Alias so pickNextProblems (which keys off masteryScore) uses
                // the same strength signal.
                masteryScore: strength,
            };
        });
        const touched = (Object.values(masteryByPattern) as any[]).filter((m) => m.attempted > 0);
        const overallMastery =
            touched.length > 0 ? Math.round(touched.reduce((s, m) => s + m.strength, 0) / touched.length) : 0;

        const decorate = (m: any) => {
            const meta = ALL_PATTERNS.find((p) => p.id === m.pattern);
            return {
                pattern: m.pattern,
                label: meta?.label || m.pattern,
                solved: m.solved,
                wrong: m.wrong,
                total: m.total,
                attempted: m.attempted,
                accuracyPct: m.accuracyPct,
                coveragePct: m.coveragePct,
                strength: m.strength,
                weakness: m.weakness,
            };
        };

        // Weakest = engaged patterns with the most room to improve (lowest
        // strength; break ties by more wrong attempts, then lower coverage).
        const weakest = [...touched]
            .sort((a, b) => a.strength - b.strength || b.wrong - a.wrong || a.coveragePct - b.coveragePct)
            .slice(0, 4)
            .map(decorate);

        // Strongest = engaged patterns you've nailed (highest strength).
        const strongest = [...touched]
            .sort((a, b) => b.strength - a.strength || b.accuracyPct - a.accuracyPct)
            .slice(0, 5)
            .map(decorate);

        // Difficulty + kind breakdown (summed across mastery docs).
        const difficulty = { easy: 0, medium: 0, hard: 0 };
        const kind = { dsa: 0, sql: 0 };
        masterySnap.docs.forEach((d) => {
            const m = d.data() || {};
            difficulty.easy += m.easySolved ?? 0;
            difficulty.medium += m.mediumSolved ?? 0;
            difficulty.hard += m.hardSolved ?? 0;
            if (m.kind === "sql") kind.sql += m.solved ?? 0;
            else kind.dsa += m.solved ?? 0;
        });

        // ── Submissions: contribution heatmap, acceptance, recent activity ──
        const dayCounts: Record<string, number> = {};
        let totalSubmissions = 0;
        let acceptedSubmissions = 0;
        const subs = submissionsSnap.docs
            .map((d) => {
                const s = d.data() || {};
                const ms = s.createdAt?.toMillis ? s.createdAt.toMillis() : 0;
                return { id: d.id, ms, verdict: s.verdict || "", problemId: s.problemId || "", mode: s.mode || "submit", language: s.language || "" };
            })
            .filter((s) => s.ms > 0)
            .sort((a, b) => b.ms - a.ms);

        const heatStart = nowMs - HEATMAP_DAYS * DAY_MS;
        subs.forEach((s) => {
            totalSubmissions += 1;
            if (s.verdict === "accepted") acceptedSubmissions += 1;
            if (s.ms >= heatStart) {
                const k = dayKey(s.ms);
                dayCounts[k] = (dayCounts[k] || 0) + 1;
            }
        });
        const acceptanceRate = totalSubmissions > 0 ? Math.round((acceptedSubmissions / totalSubmissions) * 100) : 0;

        // Build a contiguous day-by-day heatmap series ending today.
        const heatmap: { date: string; count: number }[] = [];
        for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
            const k = dayKey(nowMs - i * DAY_MS);
            heatmap.push({ date: k, count: dayCounts[k] || 0 });
        }
        const activeDays = Object.keys(dayCounts).length;
        const submissionsToday = dayCounts[dayKey(nowMs)] || 0;

        // Recent activity (last 8 submissions with problem labels).
        const recentActivity = subs.slice(0, 8).map((s) => {
            const meta = problemMeta[s.problemId];
            return {
                id: s.id,
                title: meta?.title || "Problem",
                slug: meta?.slug || "",
                kind: meta?.kind || "dsa",
                verdict: s.verdict,
                language: s.language,
                at: new Date(s.ms).toISOString(),
            };
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
                longestStreak,
                overallMastery,
                totalProblems: candidates.length,
                totalSubmissions,
                acceptanceRate,
                activeDays,
                submissionsToday,
                patternsTouched: touched.length,
            },
            difficulty,
            kind,
            heatmap,
            heatmapDays: HEATMAP_DAYS,
            weakest,
            strongest,
            recentActivity,
            recommended,
        });
    } catch (error: any) {
        console.error("Practice dashboard failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
