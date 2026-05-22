import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, toIsoDate } from "@/lib/server/classroomAccess";
import {
    clampPercent,
    COMPLETED_STATUSES,
    computeRiskScore,
    loadAttemptsForUsers,
    loadTeacherContentIds,
    type AttemptRecord,
} from "@/lib/server/teacherAnalytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const teacherId = searchParams.get("teacherId");
        const a = searchParams.get("a");
        const b = searchParams.get("b");
        if (!teacherId || !a || !b) {
            return NextResponse.json({ error: "teacherId, a and b required" }, { status: 400 });
        }
        if (a === b) {
            return NextResponse.json({ error: "Pick two different students" }, { status: 400 });
        }

        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) return NextResponse.json({ error: "Sign in" }, { status: 401 });
        if (tokenUserId !== teacherId) return NextResponse.json({ error: "Not yours" }, { status: 403 });

        // Both must be in at least one of this teacher's classes
        const verifyMembership = async (studentId: string) => {
            const snap = await adminDb
                .collectionGroup("students")
                .where("studentId", "==", studentId)
                .where("teacherId", "==", teacherId)
                .limit(1)
                .get();
            return !snap.empty;
        };
        const [okA, okB] = await Promise.all([verifyMembership(a), verifyMembership(b)]);
        if (!okA || !okB) {
            return NextResponse.json({ error: "One or both students are not in your classes" }, { status: 404 });
        }

        const contentIndex = await loadTeacherContentIds(teacherId);
        const allAttempts = await loadAttemptsForUsers([a, b], contentIndex);

        const summarize = (studentId: string) => {
            const attempts = allAttempts.filter((x) => x.userId === studentId);
            const completed = attempts.filter((x) => COMPLETED_STATUSES.has(x.status));
            const completedContentIds = new Set(completed.map((x) => x.contentId));
            const lastActiveMs = Math.max(
                ...attempts.map((x) => Math.max(x.startedAtMs, x.completedAtMs)),
                0
            );
            const risk = computeRiskScore({
                completed,
                totalAssignedContent: contentIndex.quizzes.size + contentIndex.seriesById.size,
                completedContentCount: completedContentIds.size,
                lastActiveAtMs: lastActiveMs > 0 ? lastActiveMs : null,
            });
            const topicMap = new Map<string, { sum: number; count: number }>();
            completed.forEach((c) => {
                const slot = topicMap.get(c.category) || { sum: 0, count: 0 };
                slot.sum += c.percentage;
                slot.count += 1;
                topicMap.set(c.category, slot);
            });
            return {
                attempts,
                completed,
                stats: {
                    completedAttempts: completed.length,
                    averagePercentage: risk.metrics.averagePercentage,
                    bestPercentage: completed.length ? Math.max(...completed.map((c) => c.percentage)) : null,
                    coveragePercent: risk.metrics.coveragePercent,
                    daysSinceLastActive: risk.metrics.daysSinceLastActive,
                    avgDurationSeconds: completed.length
                        ? Math.round(completed.reduce((s, c) => s + c.durationSeconds, 0) / completed.length)
                        : 0,
                },
                risk,
                topicMap,
            };
        };

        const A = summarize(a);
        const B = summarize(b);

        // Topic union
        const topicKeys = Array.from(new Set([...A.topicMap.keys(), ...B.topicMap.keys()]));
        const topics = topicKeys.map((cat) => {
            const aSlot = A.topicMap.get(cat);
            const bSlot = B.topicMap.get(cat);
            return {
                category: cat,
                aPercentage: aSlot && aSlot.count > 0 ? clampPercent(aSlot.sum / aSlot.count) : null,
                bPercentage: bSlot && bSlot.count > 0 ? clampPercent(bSlot.sum / bSlot.count) : null,
                aAttempts: aSlot?.count || 0,
                bAttempts: bSlot?.count || 0,
            };
        });

        // Head-to-head on common content (both attempted)
        const commonContent = (() => {
            const aBest = new Map<string, AttemptRecord>();
            A.completed.forEach((c) => {
                const prev = aBest.get(c.contentId);
                if (!prev || c.percentage > prev.percentage) aBest.set(c.contentId, c);
            });
            const bBest = new Map<string, AttemptRecord>();
            B.completed.forEach((c) => {
                const prev = bBest.get(c.contentId);
                if (!prev || c.percentage > prev.percentage) bBest.set(c.contentId, c);
            });
            const rows: any[] = [];
            for (const [contentId, aRec] of aBest.entries()) {
                const bRec = bBest.get(contentId);
                if (!bRec) continue;
                rows.push({
                    contentId,
                    contentTitle: aRec.contentTitle,
                    aPercentage: aRec.percentage,
                    bPercentage: bRec.percentage,
                    aDurationSeconds: aRec.durationSeconds,
                    bDurationSeconds: bRec.durationSeconds,
                });
            }
            rows.sort((x, y) => Math.abs(y.aPercentage - y.bPercentage) - Math.abs(x.aPercentage - x.bPercentage));
            return rows.slice(0, 12);
        })();

        // Profile blocks for display
        const buildProfile = async (studentId: string) => {
            const memberSnap = await adminDb
                .collectionGroup("students")
                .where("studentId", "==", studentId)
                .where("teacherId", "==", teacherId)
                .limit(1)
                .get();
            const data = memberSnap.empty ? {} : memberSnap.docs[0].data() || {};
            return {
                studentId,
                studentName: data.studentName || data.studentEmail || "Student",
                studentEmail: data.studentEmail || "",
                rollNumber: data.rollNumber || null,
                enrolledAt: toIsoDate(data.enrolledAt),
            };
        };
        const [profileA, profileB] = await Promise.all([buildProfile(a), buildProfile(b)]);

        return NextResponse.json({
            a: { profile: profileA, stats: A.stats, risk: A.risk },
            b: { profile: profileB, stats: B.stats, risk: B.risk },
            topics,
            commonContent,
        });
    } catch (error: any) {
        console.error("Student compare error:", error);
        return NextResponse.json({ error: error?.message || "Failed to compare" }, { status: 500 });
    }
}
