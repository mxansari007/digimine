/**
 * GET /api/credits/wallet — the caller's balance plus their recent
 * ledger rows for the history list on /credits. Works for any signed-in
 * role (student / teacher / institute admin) — wallets are per-account.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { getWallet, CREDIT_TRANSACTIONS } from "@/lib/server/credits";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        const wallet = await getWallet(userId);
        const txSnap = await adminDb
            .collection(CREDIT_TRANSACTIONS)
            .where("userId", "==", userId)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();

        const transactions = txSnap.docs.map((doc) => {
            const d = doc.data();
            return {
                id: doc.id,
                type: d.type,
                task: d.task ?? null,
                amount: d.amount,
                balanceAfter: d.balanceAfter,
                ref: d.ref ?? null,
                note: d.note ?? null,
                createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
            };
        });

        return NextResponse.json({
            balance: wallet?.balance ?? 0,
            lifetimePurchased: wallet?.lifetimePurchased ?? 0,
            lifetimeSpent: wallet?.lifetimeSpent ?? 0,
            transactions,
        });
    } catch (error) {
        console.error("[/api/credits/wallet] failed:", error);
        return NextResponse.json({ error: "Failed to load wallet" }, { status: 500 });
    }
}
