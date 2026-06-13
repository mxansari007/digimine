/**
 * Admin credit operations (called from the admin app via authedFetch):
 *
 *   GET  /api/admin/credits?userId=…|email=…   → that user's wallet + ledger
 *   GET  /api/admin/credits                    → recent platform-wide ledger
 *   POST /api/admin/credits                    → grant/revoke credits
 *        { userId? , email? , amount (+grant / −revoke), note? }
 *
 * Rates/packs/toggle are NOT here — the admin app edits `appConfig/aiCredits`
 * directly (appConfig is admin-writable by rules). This route exists for the
 * operations that need the Admin SDK: wallet transactions and email lookup.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/middleware/requireAdmin";
import { corsPreflight, withCors } from "@/lib/server/adminCors";
import {
    getWallet,
    grantCredits,
    CREDIT_TRANSACTIONS,
} from "@/lib/server/credits";

export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
    return corsPreflight(req);
}

async function resolveUserId(userId: string, email: string): Promise<string | null> {
    if (userId) return userId;
    if (!email) return null;
    try {
        const record = await adminAuth.getUserByEmail(email);
        return record.uid;
    } catch {
        return null;
    }
}

function serializeTxn(doc: FirebaseFirestore.QueryDocumentSnapshot) {
    const d = doc.data();
    return {
        id: doc.id,
        userId: d.userId,
        type: d.type,
        task: d.task ?? null,
        amount: d.amount,
        balanceAfter: d.balanceAfter,
        ref: d.ref ?? null,
        note: d.note ?? null,
        actorId: d.actorId ?? null,
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
    };
}

export async function GET(req: NextRequest) {
    const admin = await requireAdmin(req);
    if (admin instanceof NextResponse) return withCors(req, admin);

    const { searchParams } = new URL(req.url);
    const userIdParam = (searchParams.get("userId") || "").trim();
    const emailParam = (searchParams.get("email") || "").trim();

    try {
        if (userIdParam || emailParam) {
            const userId = await resolveUserId(userIdParam, emailParam);
            if (!userId) {
                return withCors(
                    req,
                    NextResponse.json({ error: "No user found for that email/uid." }, { status: 404 })
                );
            }
            const wallet = await getWallet(userId);
            const txSnap = await adminDb
                .collection(CREDIT_TRANSACTIONS)
                .where("userId", "==", userId)
                .orderBy("createdAt", "desc")
                .limit(50)
                .get();
            return withCors(
                req,
                NextResponse.json({
                    userId,
                    wallet: wallet
                        ? {
                              balance: wallet.balance,
                              lifetimePurchased: wallet.lifetimePurchased,
                              lifetimeSpent: wallet.lifetimeSpent,
                              lifetimeGranted: wallet.lifetimeGranted,
                          }
                        : null,
                    transactions: txSnap.docs.map(serializeTxn),
                })
            );
        }

        const txSnap = await adminDb
            .collection(CREDIT_TRANSACTIONS)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();
        return withCors(
            req,
            NextResponse.json({ transactions: txSnap.docs.map(serializeTxn) })
        );
    } catch (error: any) {
        console.error("[/api/admin/credits] GET failed:", error);
        return withCors(
            req,
            NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
        );
    }
}

export async function POST(req: NextRequest) {
    const admin = await requireAdmin(req);
    if (admin instanceof NextResponse) return withCors(req, admin);

    try {
        const body = await req.json().catch(() => ({}));
        const userId = await resolveUserId(
            typeof body.userId === "string" ? body.userId.trim() : "",
            typeof body.email === "string" ? body.email.trim() : ""
        );
        if (!userId) {
            return withCors(
                req,
                NextResponse.json({ error: "No user found for that email/uid." }, { status: 404 })
            );
        }
        const amount = Math.trunc(Number(body.amount));
        if (!Number.isFinite(amount) || amount === 0) {
            return withCors(
                req,
                NextResponse.json(
                    { error: "amount must be a non-zero integer (negative to revoke)." },
                    { status: 400 }
                )
            );
        }
        const note = typeof body.note === "string" ? body.note.slice(0, 200) : null;

        const balance = await grantCredits({
            userId,
            amount,
            actorId: admin.uid,
            note,
        });
        return withCors(req, NextResponse.json({ ok: true, userId, balance }));
    } catch (error: any) {
        console.error("[/api/admin/credits] POST failed:", error);
        return withCors(
            req,
            NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
        );
    }
}
