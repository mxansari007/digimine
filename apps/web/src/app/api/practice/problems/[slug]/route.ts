import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { getEntitlements } from "@/lib/server/entitlements";
import {
    PROGRESS,
    loadProblemBySlug,
    progressId,
    serializeProblemPublic,
    serializeProgress,
} from "@/lib/server/practice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { slug: string } }) {
    try {
        const slug = decodeURIComponent(params.slug || "");
        const problem = await loadProblemBySlug(slug);
        if (!problem || (problem as any).status !== "published") {
            return NextResponse.json({ error: "Problem not found" }, { status: 404 });
        }

        const userId = await getBearerUserId(req).catch(() => null);
        const ent = await getEntitlements(userId);
        // Use the STRICT paid flag, not the kill-switch-aware feature flag.
        // Admin-marked premium content must stay gated even in launch mode.
        const canAccessPremium = ent.isPaid;

        const publicProblem = serializeProblemPublic(problem.id, problem) as any;

        // ── Server-side gating ──
        // For premium-locked problems we still let the user *read* the
        // problem (statement, constraints, one sample) so they understand
        // what they'd unlock — that's the LeetCode teaser pattern. We
        // strip only the solving aids (hints, editorial, full sample set)
        // and the starter code so a free user can't just copy it and run
        // it locally; the rest of the gate lives in the submit route.
        if (publicProblem.access === "premium" && !canAccessPremium) {
            // Show the statement only — the fade + lock card sits right
            // after it. Constraints, examples, hints, editorial, starter
            // code are all unlocked by subscribing.
            publicProblem.starters = [];
            publicProblem.constraintsHtml = null;
            publicProblem.samples = [];
            publicProblem.editorialHtml = null;
            publicProblem.hints = [];
            publicProblem.sql = publicProblem.sql ? { ...publicProblem.sql, schemaSql: "" } : null;
            publicProblem.locked = true;
        }
        // Editorial-only gate: keep the problem fully playable, just strip
        // the walkthrough.
        if (publicProblem.editorialAccess === "premium" && !canAccessPremium) {
            publicProblem.editorialHtml = null;
            publicProblem.editorialLocked = true;
        }

        // Attach the caller's progress if signed in (best-effort).
        let progress = null;
        if (userId) {
            const snap = await adminDb.collection(PROGRESS).doc(progressId(userId, problem.id)).get();
            if (snap.exists) progress = serializeProgress(snap.id, snap.data() || {});
        }

        return NextResponse.json({ problem: publicProblem, progress });
    } catch (error: any) {
        console.error("Get practice problem failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
