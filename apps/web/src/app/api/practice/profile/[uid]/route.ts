import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { MASTERY, PROGRESS, SUBMISSIONS } from "@/lib/server/practice";
import { DISCUSSIONS, SOLUTIONS, serializeDiscussion, serializeSolution } from "@/lib/server/practiceCommunity";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAY_MS = 24 * 60 * 60 * 1000;
const HEATMAP_DAYS = 182; // ~26 weeks
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** GET /api/practice/profile/[uid] — public profile + footprint. */
export async function GET(_req: Request, { params }: { params: { uid: string } }) {
    try {
        const uid = params.uid;
        if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

        const [userSnap, progressSnap, masterySnap, solutionsSnap, discussionsSnap, submissionsSnap] = await Promise.all([
            adminDb.collection("users").doc(uid).get(),
            adminDb.collection(PROGRESS).where("userId", "==", uid).limit(1000).get(),
            adminDb.collection(MASTERY).where("userId", "==", uid).get(),
            adminDb.collection(SOLUTIONS).where("author.userId", "==", uid).limit(50).get(),
            adminDb.collection(DISCUSSIONS).where("author.userId", "==", uid).limit(50).get(),
            adminDb.collection(SUBMISSIONS).where("userId", "==", uid).limit(4000).get(),
        ]);

        if (!userSnap.exists) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
        const u = userSnap.data() || {};
        const name =
            u.displayName ||
            [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
            (u.email ? String(u.email).split("@")[0] : "") ||
            "Anonymous";

        // Solve rollups + streaks.
        let solved = 0;
        const solveDays = new Set<string>();
        progressSnap.docs.forEach((d) => {
            const p = d.data() || {};
            if (p.status === "solved") {
                solved += 1;
                const at = p.solvedAt?.toMillis ? p.solvedAt.toMillis() : null;
                if (at) solveDays.add(dayKey(at));
            }
        });

        const nowMs = Date.now();
        let currentStreak = 0;
        let cursor = nowMs;
        if (!solveDays.has(dayKey(nowMs)) && solveDays.has(dayKey(nowMs - DAY_MS))) cursor = nowMs - DAY_MS;
        for (let i = 0; i < 365; i++) {
            if (solveDays.has(dayKey(cursor))) {
                currentStreak += 1;
                cursor -= DAY_MS;
            } else break;
        }
        let longestStreak = 0;
        {
            const days = [...solveDays].sort();
            let run = 0;
            let prev: number | null = null;
            for (const k of days) {
                const ms = Date.parse(k);
                run = prev !== null && Math.round((ms - prev) / DAY_MS) === 1 ? run + 1 : 1;
                if (run > longestStreak) longestStreak = run;
                prev = ms;
            }
        }

        const diff = { easy: 0, medium: 0, hard: 0 };
        masterySnap.docs.forEach((d) => {
            const m = d.data() || {};
            diff.easy += m.easySolved ?? 0;
            diff.medium += m.mediumSolved ?? 0;
            diff.hard += m.hardSolved ?? 0;
        });

        // Contribution heatmap (submission activity over the last ~26 weeks).
        const nowDayMs = Date.now();
        const dayCounts: Record<string, number> = {};
        const heatStart = nowDayMs - HEATMAP_DAYS * DAY_MS;
        submissionsSnap.docs.forEach((d) => {
            const ms = d.data()?.createdAt?.toMillis ? d.data().createdAt.toMillis() : 0;
            if (ms >= heatStart) {
                const k = dayKey(ms);
                dayCounts[k] = (dayCounts[k] || 0) + 1;
            }
        });
        const heatmap: { date: string; count: number }[] = [];
        for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
            const k = dayKey(nowDayMs - i * DAY_MS);
            heatmap.push({ date: k, count: dayCounts[k] || 0 });
        }

        const solutions = solutionsSnap.docs
            .map((d) => serializeSolution(d.id, d.data() || {}))
            .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
        const discussions = discussionsSnap.docs
            .map((d) => serializeDiscussion(d.id, d.data() || {}))
            .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

        return NextResponse.json({
            profile: {
                userId: uid,
                name,
                avatarUrl: u.photoURL || null,
                bio: u.bio || null,
                joinedAt: toIsoDate(u.createdAt),
                stats: {
                    solved,
                    easy: diff.easy,
                    medium: diff.medium,
                    hard: diff.hard,
                    currentStreak,
                    longestStreak,
                    solutionsPosted: solutions.length,
                    discussionsStarted: discussions.length,
                },
            },
            heatmap,
            solutions,
            discussions,
        });
    } catch (error: any) {
        console.error("Get public profile failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
