import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const attemptId = searchParams.get("attemptId");
        if (!attemptId) {
            return NextResponse.json({ error: "attemptId required" }, { status: 400 });
        }

        const snap = await adminDb.collection("testAttempts").doc(attemptId).get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
        }

        const data = snap.data()!;
        const attempt = {
            id: snap.id,
            ...data,
            startedAt: data.startedAt?.toDate?.()?.toISOString?.() || data.startedAt || null,
            endTime: data.endTime?.toDate?.()?.toISOString?.() || data.endTime || null,
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || null,
            completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
        };

        return NextResponse.json({ attempt });
    } catch (error: any) {
        console.error("Get attempt error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
