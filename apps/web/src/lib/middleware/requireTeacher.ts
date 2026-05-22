import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function requireTeacher(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    try {
        const { getAuth } = await import("firebase-admin/auth");
        const decoded = await getAuth().verifyIdToken(token);
        const uid = decoded.uid;

        const teacherSnap = await adminDb.collection("teachers").doc(uid).get();
        if (!teacherSnap.exists) {
            return NextResponse.json({ error: "Not a teacher" }, { status: 403 });
        }

        const teacher = teacherSnap.data();
        if (teacher?.subscription?.status === "expired") {
            return NextResponse.json({ error: "Subscription expired" }, { status: 403 });
        }

        return { uid, teacher };
    } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
}

export async function checkTrialOrActive(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    try {
        const { getAuth } = await import("firebase-admin/auth");
        const decoded = await getAuth().verifyIdToken(token);
        const uid = decoded.uid;

        const teacherSnap = await adminDb.collection("teachers").doc(uid).get();
        if (!teacherSnap.exists) {
            return NextResponse.json({ error: "Not a teacher" }, { status: 403 });
        }

        const sub = teacherSnap.data()?.subscription;
        if (!sub || !["trial", "active"].includes(sub.status)) {
            return NextResponse.json({ error: "Subscription required to create content. Subscribe at /teacher/subscribe." }, { status: 403 });
        }

        return { uid };
    } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
}

export async function requireEnrollment(req: NextRequest, teacherId: string) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    try {
        const { getAuth } = await import("firebase-admin/auth");
        const decoded = await getAuth().verifyIdToken(token);
        const uid = decoded.uid;

        if (uid === teacherId) return { uid }; // Teacher can access their own content

        const enrollmentSnap = await adminDb
            .collection("teacher_enrollments")
            .doc(teacherId)
            .collection("students")
            .doc(uid)
            .get();

        if (!enrollmentSnap.exists || enrollmentSnap.data()?.status !== "active") {
            return NextResponse.json({ error: "Not enrolled in this classroom" }, { status: 403 });
        }

        return { uid };
    } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
}
