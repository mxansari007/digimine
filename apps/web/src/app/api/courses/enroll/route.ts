import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
    const header = req.headers.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
}

function serializeDate(value: unknown): string {
    if (!value) return new Date().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
        return value.toDate().toISOString();
    }
    if (typeof value === "string") return value;
    return new Date(value as string).toISOString();
}

export async function POST(req: Request) {
    try {
        const authUserId = await getAuthenticatedUserId(req);
        if (!authUserId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const { courseId } = await req.json();
        if (!courseId || typeof courseId !== "string") {
            return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
        }

        const courseRef = adminDb.collection("courses").doc(courseId);
        const courseSnap = await courseRef.get();
        if (!courseSnap.exists) {
            return NextResponse.json({ error: "Course not found" }, { status: 404 });
        }

        const course = courseSnap.data() || {};
        if (course.status !== "published") {
            return NextResponse.json({ error: "Course is not published" }, { status: 403 });
        }

        if (course.accessType !== "free") {
            return NextResponse.json({ error: "This course requires purchase before enrollment" }, { status: 402 });
        }

        const enrollmentId = `${authUserId}_${courseId}`;
        const enrollmentRef = adminDb.collection("courseEnrollments").doc(enrollmentId);
        const now = new Date();
        const existing = await enrollmentRef.get();
        const existingData = existing.data();

        if (existing.exists && existingData?.status === "active") {
            return NextResponse.json({
                enrollment: {
                    id: enrollmentId,
                    ...existingData,
                    enrolledAt: serializeDate(existingData.enrolledAt),
                    createdAt: serializeDate(existingData.createdAt),
                    updatedAt: serializeDate(existingData.updatedAt),
                },
                alreadyEnrolled: true,
            });
        }

        const enrollmentData = {
            userId: authUserId,
            courseId,
            status: "active",
            enrolledAt: now,
            createdAt: existingData?.createdAt || now,
            updatedAt: now,
        };

        await enrollmentRef.set(enrollmentData, { merge: true });
        await adminDb.collection("users").doc(authUserId).set(
            {
                enrolledCourseIds: FieldValue.arrayUnion(courseId),
                updatedAt: now,
            },
            { merge: true }
        );

        return NextResponse.json({
            enrollment: {
                id: enrollmentId,
                ...enrollmentData,
                enrolledAt: now.toISOString(),
                createdAt: serializeDate(enrollmentData.createdAt),
                updatedAt: now.toISOString(),
            },
            alreadyEnrolled: false,
        });
    } catch (error: unknown) {
        console.error("Course enrollment failed:", error);
        const message = error instanceof Error ? error.message : "Failed to enroll in course";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
