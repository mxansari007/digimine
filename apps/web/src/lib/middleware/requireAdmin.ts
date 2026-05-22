import { NextRequest, NextResponse } from "next/server";

export async function requireAdmin(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    try {
        const { getAuth } = await import("firebase-admin/auth");
        const decoded = await getAuth().verifyIdToken(token);
        const uid = decoded.uid;

        const { adminDb } = await import("@/lib/firebase/admin");
        const userSnap = await adminDb.collection("users").doc(uid).get();

        if (!userSnap.exists) {
            return NextResponse.json({ error: "User not found" }, { status: 403 });
        }

        const role = userSnap.data()?.role;
        if (!role || !["admin", "super_admin"].includes(role)) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        return { uid, role };
    } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
}
