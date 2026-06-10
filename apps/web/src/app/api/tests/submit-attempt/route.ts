import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
    requireOwnedAttempt,
    serializeTestAttempt,
    submitTestAttemptServer,
} from "@/lib/server/testAttempts";
import { userOwnsTestSeries, isPaidCatalogSeries } from "@/lib/server/testAccess";

export const dynamic = "force-dynamic";

type SubmitAnswer = {
    questionId: string;
    selectedOptionId?: string;
    timeSpent?: number;
};

function normalizeAnswers(value: unknown): SubmitAnswer[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            if (typeof record.questionId !== "string") return null;
            const selected =
                typeof record.selectedOptionId === "string"
                    ? record.selectedOptionId
                    : typeof record.answer === "string"
                    ? (record.answer as string)
                    : "";
            return {
                questionId: record.questionId,
                selectedOptionId: selected,
                timeSpent: typeof record.timeSpent === "number" ? record.timeSpent : 0,
            };
        })
        .filter(Boolean) as SubmitAnswer[];
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
        if (!attemptId) {
            return NextResponse.json({ error: "attemptId required" }, { status: 400 });
        }

        const owned = await requireOwnedAttempt(req, attemptId);
        if (owned.error) {
            return NextResponse.json({ error: owned.error.message }, { status: owned.error.status });
        }

        // Paid-catalogue purchase gate (mirrors start-attempt). Firestore rules
        // let a client CREATE a testAttempts doc directly without buying the
        // series; without this, grading it server-side would hand back the
        // answer key for a paid test the user never purchased.
        const seriesId = String(owned.attempt?.seriesId || "");
        const contestId = owned.attempt?.contestId || null;
        if (seriesId && !contestId) {
            const seriesSnap = await adminDb.collection("tests").doc(seriesId).get();
            const series: any = seriesSnap.exists
                ? { id: seriesSnap.id, ...seriesSnap.data() }
                : null;
            if (
                series &&
                isPaidCatalogSeries(series) &&
                !(await userOwnsTestSeries(owned.userId!, seriesId))
            ) {
                return NextResponse.json(
                    { error: "Purchase this test series to submit it.", code: "purchase_required" },
                    { status: 402 }
                );
            }
        }

        const answers = normalizeAnswers(body.answers);
        const remainingTime =
            typeof body.remainingTime === "number"
                ? Math.max(0, Math.floor(body.remainingTime))
                : 0;
        const finalStatus =
            body.finalStatus === "timed_out" ? "timed_out" : "completed";
        const integrity =
            body.integrity && typeof body.integrity === "object"
                ? {
                      tabSwitches:
                          typeof body.integrity.tabSwitches === "number"
                              ? body.integrity.tabSwitches
                              : 0,
                      autoSubmitted: body.integrity.autoSubmitted === true,
                  }
                : undefined;

        const finalAttempt = await submitTestAttemptServer(attemptId, {
            answers,
            remainingTime,
            finalStatus,
            integrity,
        });

        return NextResponse.json({ attempt: serializeTestAttempt(finalAttempt) });
    } catch (error: any) {
        console.error("Failed to submit test attempt:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to submit test attempt" },
            { status: 500 }
        );
    }
}
