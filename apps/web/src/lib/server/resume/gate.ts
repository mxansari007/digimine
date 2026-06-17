/**
 * AI-limits enforcement for metered Resume Maker actions (ATS score, bullet
 * rewrite, summary, JD tailor, import). Single source of truth so every AI
 * resume route gates identically — mirrors the ai-interview/schedule skeleton:
 *
 *   1. Plan feature gate         → 402 premium_required
 *   2. Monthly quota (consume)   → on exhaustion, fall through to credits
 *   3. Credit overflow           → 402 insufficient_credits / 429 quota_exceeded
 *
 * The returned `refundOnFailure()` gives back whichever allowance paid for the
 * action (credits if they covered it, else the consumed quota unit) and MUST
 * be called when the downstream AI work throws — never on success.
 */
import { NextResponse } from "next/server";
import { getEntitlements, checkQuota, refundQuota } from "@/lib/server/entitlements";
import { chargeCredits, refundCredits, insufficientCreditsResponse } from "@/lib/server/credits";

const QUOTA = "resumeAtsPerMonth" as const;
const CREDIT_TASK = "resume_ats" as const;

export type ResumeAiGate =
    | { ok: false; response: NextResponse }
    | { ok: true; creditsCharged: number; refundOnFailure: () => Promise<void> };

/**
 * @param actionLabel human phrase for messages, e.g. "an ATS check",
 *        "a bullet rewrite".
 */
export async function enforceResumeAiQuota(
    userId: string,
    actionLabel: string
): Promise<ResumeAiGate> {
    const ent = await getEntitlements(userId);
    if (!ent.features.resume_ats) {
        return {
            ok: false,
            response: NextResponse.json(
                {
                    error: "The AI Resume Maker isn't included in your plan. Upgrade to unlock it.",
                    code: "premium_required",
                    upgradeUrl: "/membership",
                },
                { status: 402 }
            ),
        };
    }

    const now = new Date();
    const ref = crypto.randomUUID();
    const quota = await checkQuota(userId, QUOTA, { consume: true });
    let creditsCharged = 0;

    if (!quota.allowed) {
        // Plan allowance exhausted (quota was NOT consumed) — try credits.
        const charge = await chargeCredits({ userId, task: CREDIT_TASK, ref });
        if (!charge.ok) {
            return { ok: false, response: insufficientCreditsResponse(charge, actionLabel) };
        }
        if (charge.charged === 0) {
            // Credits disabled or this task is free → the plan cap stands.
            return {
                ok: false,
                response: NextResponse.json(
                    {
                        error:
                            quota.limit === 0
                                ? "Your plan doesn't include AI resume actions. Upgrade to unlock."
                                : `You've used all ${quota.limit} AI resume action${quota.limit === 1 ? "" : "s"} in your plan this month. Add credits or upgrade for more.`,
                        code: "quota_exceeded",
                        upgradeUrl: "/membership",
                    },
                    { status: 429 }
                ),
            };
        }
        creditsCharged = charge.charged;
    }

    const refundOnFailure = async () => {
        if (creditsCharged > 0) {
            await refundCredits({
                userId,
                task: CREDIT_TASK,
                amount: creditsCharged,
                ref,
                note: `${actionLabel} failed`,
            });
        } else {
            await refundQuota(userId, QUOTA, now);
        }
    };

    return { ok: true, creditsCharged, refundOnFailure };
}
