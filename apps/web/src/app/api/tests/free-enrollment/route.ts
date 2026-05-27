import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/server/ratelimit";
import type { TestPurchase } from "@digimine/types";

type DateLike = Date | Timestamp | string | { _seconds: number };
type StoredPurchase = Omit<TestPurchase, "id" | "purchasedAt" | "createdAt" | "updatedAt"> & {
    purchasedAt?: DateLike;
    createdAt?: DateLike;
    updatedAt?: DateLike;
};

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
    const header = req.headers.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;

    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
}

function hasToDate(value: unknown): value is { toDate: () => Date } {
    return typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function";
}

function hasSeconds(value: unknown): value is { _seconds: number } {
    return typeof value === "object" && value !== null && "_seconds" in value && typeof value._seconds === "number";
}

function serializeDate(value: DateLike | undefined): string {
    if (!value) return new Date().toISOString();
    if (hasToDate(value)) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return value;
    if (hasSeconds(value)) return new Date(value._seconds * 1000).toISOString();
    return new Date(value).toISOString();
}

function serializePurchase(id: string, data: StoredPurchase) {
    return {
        id,
        ...data,
        purchasedAt: serializeDate(data.purchasedAt),
        createdAt: serializeDate(data.createdAt),
        updatedAt: serializeDate(data.updatedAt),
    };
}

export async function POST(req: Request) {
    try {
        const authUserId = await getAuthenticatedUserId(req);
        if (!authUserId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        // Rate limit free enrolments: 20 per user per 5 minutes. A real
        // student only enrolls in a handful of series interactively; higher
        // rates are ID enumeration or scripted noise. Fails-open if Redis
        // is unavailable so legit traffic never gets blocked by infra.
        const rl = await rateLimit("free-enroll", authUserId, {
            limit: 20,
            windowSeconds: 300,
        });
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many enrolment attempts. Please slow down and try again in a minute." },
                { status: 429 }
            );
        }

        const { seriesId, userId } = await req.json();
        if (!seriesId || typeof seriesId !== "string") {
            return NextResponse.json({ error: "Missing seriesId" }, { status: 400 });
        }

        if (userId && userId !== authUserId) {
            return NextResponse.json({ error: "User mismatch" }, { status: 403 });
        }

        const seriesRef = adminDb.collection("tests").doc(seriesId);
        const seriesSnap = await seriesRef.get();
        if (!seriesSnap.exists) {
            return NextResponse.json({ error: "Test series not found" }, { status: 404 });
        }

        const series = seriesSnap.data() || {};
        if (series.status !== "published" || series.accessType !== "free") {
            return NextResponse.json({ error: "This test series is not available for free enrollment" }, { status: 403 });
        }

        const purchaseId = `${authUserId}_${seriesId}`;
        const purchaseRef = adminDb.collection("testPurchases").doc(purchaseId);
        const now = new Date();

        const existingPurchase = await purchaseRef.get();
        const existingPurchaseData = existingPurchase.data() as StoredPurchase | undefined;
        if (existingPurchase.exists && existingPurchaseData?.status === "active") {
            return NextResponse.json({
                purchase: serializePurchase(purchaseId, existingPurchaseData),
                alreadyEnrolled: true,
            });
        }

        const purchaseData: Omit<TestPurchase, "id"> = {
            userId: authUserId,
            seriesId,
            orderId: "free-enrollment",
            price: 0,
            purchasedAt: now,
            status: "active",
            createdAt: existingPurchase.exists && existingPurchaseData?.createdAt instanceof Date ? existingPurchaseData.createdAt : now,
            updatedAt: now,
        };

        await purchaseRef.set(purchaseData, { merge: true });

        await adminDb.collection("users").doc(authUserId).set({
            purchasedTests: FieldValue.arrayUnion(seriesId),
            purchasedTestSeriesIds: FieldValue.arrayUnion(seriesId),
            updatedAt: now,
        }, { merge: true });

        return NextResponse.json({
            purchase: serializePurchase(purchaseId, purchaseData),
            alreadyEnrolled: false,
        });
    } catch (error: unknown) {
        console.error("Free test enrollment failed:", error);
        const message = error instanceof Error ? error.message : "Failed to enroll in free test series";
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
