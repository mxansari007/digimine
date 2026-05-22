import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { toggleVote, type VoteTargetType } from "@/lib/server/practiceCommunity";

export const dynamic = "force-dynamic";

const VALID: VoteTargetType[] = ["discussion", "solution", "reply"];

/** POST /api/practice/vote  { targetType, targetId } — toggles the caller's upvote. */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const targetType = body.targetType as VoteTargetType;
        const targetId = String(body.targetId || "");
        if (!VALID.includes(targetType) || !targetId) {
            return NextResponse.json({ error: "Invalid target." }, { status: 400 });
        }

        const result = await toggleVote(userId, targetType, targetId);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Vote failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
