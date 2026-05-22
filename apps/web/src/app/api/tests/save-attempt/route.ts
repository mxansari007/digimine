import { NextResponse } from "next/server";
import { requireOwnedAttempt, saveTestAttempt } from "@/lib/server/testAttempts";

export const dynamic = "force-dynamic";

type SaveAnswer = {
    questionId: string;
    selectedOptionId?: string;
    timeSpent?: number;
};

function normalizeAnswers(value: unknown): SaveAnswer[] {
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
        .filter(Boolean) as SaveAnswer[];
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

        const answers = body.answers !== undefined ? normalizeAnswers(body.answers) : undefined;
        const remainingTime =
            typeof body.remainingTime === "number"
                ? Math.max(0, Math.floor(body.remainingTime))
                : undefined;
        const currentQuestionIndex =
            typeof body.currentQuestionIndex === "number"
                ? Math.max(0, Math.floor(body.currentQuestionIndex))
                : undefined;

        await saveTestAttempt(attemptId, { answers, remainingTime, currentQuestionIndex });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Failed to save test attempt:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to save test attempt" },
            { status: 500 }
        );
    }
}
