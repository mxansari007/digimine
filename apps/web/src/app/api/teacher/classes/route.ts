import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    allocateUniqueInviteCode,
    listTeacherClasses,
    serializeClass,
} from "@/lib/server/classes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        const classes = await listTeacherClasses(userId);
        return NextResponse.json({
            classes: classes.map((c) => serializeClass(c)),
        });
    } catch (error: any) {
        console.error("List classes failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to list classes" },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        const body = await req.json().catch(() => ({}));
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const description = typeof body.description === "string" ? body.description.trim() : "";

        if (!name) {
            return NextResponse.json({ error: "Class name is required." }, { status: 400 });
        }
        if (name.length > 80) {
            return NextResponse.json({ error: "Class name is too long." }, { status: 400 });
        }

        // Institute-affiliated teachers can't create classes themselves — the
        // institute owns class creation and assigns teachers. Independent
        // teachers (no `instituteId`) keep working as before.
        const teacherSnap = await adminDb.collection("teachers").doc(userId).get();
        const teacherData = teacherSnap.exists ? teacherSnap.data() || {} : {};
        if (teacherData.instituteId) {
            return NextResponse.json(
                {
                    error: "You're affiliated with an institute — classes are created and assigned by the institute admin.",
                },
                { status: 403 }
            );
        }

        const inviteCode = await allocateUniqueInviteCode();
        const now = Timestamp.now();
        const classRef = adminDb.collection("classes").doc();
        const data = {
            teacherId: userId,
            instituteId: null,
            name,
            description: description || null,
            inviteCode,
            studentsCount: 0,
            activeStudentsCount: 0,
            isArchived: false,
            createdAt: now,
            updatedAt: now,
        };
        await classRef.set(data);

        return NextResponse.json({
            class: serializeClass({ id: classRef.id, ...data }),
        });
    } catch (error: any) {
        console.error("Create class failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to create class" },
            { status: 500 }
        );
    }
}
