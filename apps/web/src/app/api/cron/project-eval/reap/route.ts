import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { processSubmission } from "@/lib/server/projectEval/process";
import {
    PROJECT_SUBMISSIONS,
    reapStuckSubmissions,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Recovery sweep for project evaluations:
 *  1. re-queue submissions stuck in "processing" (function killed mid-run);
 *  2. process up to two old queued submissions whose client-side trigger
 *     never landed (tab closed between submit and trigger).
 *
 * Primary processing is the client-fired /api/project-eval/process call —
 * this route is the safety net. Not registered in vercel.json crons yet
 * (the Vercel project already uses the Hobby plan's 2-cron budget);
 * hit it manually or register it once on Pro:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/project-eval/reap
 */
export async function GET(req: NextRequest) {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
        return NextResponse.json({ error: "Cron secret not configured." }, { status: 503 });
    }
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${expected}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const requeued = await reapStuckSubmissions();

        // Queued for >5 minutes means nobody is going to trigger it.
        const cutoff = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
        const snap = await adminDb
            .collection(PROJECT_SUBMISSIONS)
            .where("status", "==", "queued")
            .where("submittedAt", "<", cutoff)
            .orderBy("submittedAt", "asc")
            .limit(2)
            .get();

        const processed: string[] = [];
        for (const doc of snap.docs) {
            const outcome = await processSubmission(doc.id);
            processed.push(`${doc.id}: ${outcome.ok ? "scored" : outcome.reason}`);
        }

        return NextResponse.json({ requeued, processed });
    } catch (error: any) {
        console.error("Project eval reap failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
