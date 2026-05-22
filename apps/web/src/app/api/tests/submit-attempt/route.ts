import { NextResponse } from "next/server";
import {
    requireOwnedAttempt,
    serializeTestAttempt,
    submitTestAttemptServer,
} from "@/lib/server/testAttempts";

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

        const answers = normalizeAnswers(body.answers);
        const remainingTime =
            typeof body.remainingTime === "number"
                ? Math.max(0, Math.floor(body.remainingTime))
                : 0;
        const finalStatus =
            body.finalStatus === "timed_out" ? "timed_out" : "completed";

        const finalAttempt = await submitTestAttemptServer(attemptId, {
            answers,
            remainingTime,
            finalStatus,
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
