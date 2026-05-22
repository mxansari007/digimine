import { NextResponse } from "next/server";
import { ALL_PATTERNS } from "@digimine/types";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { MASTERY, serializeMastery } from "@/lib/server/practice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Mastery Map — the user's per-pattern mastery across all patterns. Returns
 * every pattern (even untouched ones) so the UI can render a complete skill
 * graph, plus a quick summary for the hub.
 */
export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });

        const snap = await adminDb.collection(MASTERY).where("userId", "==", userId).get();
        const byPattern = new Map<string, any>();
        snap.docs.forEach((d) => {
            const m = serializeMastery(d.id, d.data() || {});
            byPattern.set(m.pattern, m);
        });

        const patterns = ALL_PATTERNS.map((meta) => {
            const m = byPattern.get(meta.id);
            return {
                pattern: meta.id,
                kind: meta.kind,
                label: meta.label,
                blurb: meta.blurb,
                order: meta.order,
                masteryScore: m?.masteryScore ?? 0,
                level: m?.level ?? "novice",
                attempted: m?.attempted ?? 0,
                solved: m?.solved ?? 0,
                recognitionCorrect: m?.recognitionCorrect ?? 0,
                recognitionTotal: m?.recognitionTotal ?? 0,
                lastPracticedAt: m?.lastPracticedAt ?? null,
            };
        });

        const touched = patterns.filter((p) => p.attempted > 0);
        const overall =
            touched.length > 0
                ? Math.round(touched.reduce((s, p) => s + p.masteryScore, 0) / touched.length)
                : 0;
        const weakest = [...touched].sort((a, b) => a.masteryScore - b.masteryScore).slice(0, 3);

        return NextResponse.json({
            patterns,
            overall,
            touchedCount: touched.length,
            totalPatterns: patterns.length,
            weakest,
        });
    } catch (error: any) {
        console.error("Mastery map failed:", error);
        return NextResponse.json({ patterns: [], overall: 0 });
    }
}
