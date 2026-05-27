import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

type ClassroomRow = {
    // Class identity.
    classId: string;
    className: string;
    classDescription: string | null;
    inviteCode: string;
    isArchived: boolean;
    enrolledAt: string | null;
    // Teacher info for display.
    teacherId: string;
    teacherName: string;
    teacherAvatar: string | null;
    teacherInstitute: string;
};

export async function GET(req: Request) {
    try {
        // Bearer token required. The legacy `?studentId=` param is still
        // accepted but MUST match the token's uid — pre-fix, anyone could
        // list any student's classroom enrollments by passing their uid.
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }
        const { searchParams } = new URL(req.url);
        const queryStudentId = searchParams.get("studentId");
        if (queryStudentId && queryStudentId !== tokenUserId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const studentId = tokenUserId;

        // Single collection-group query covers both the new (`classes/.../students`)
        // and legacy (`teacher_enrollments/.../students`) paths since they share
        // the `students` subcollection name.
        let snap: FirebaseFirestore.QuerySnapshot;
        try {
            snap = await adminDb
                .collectionGroup("students")
                .where("studentId", "==", studentId)
                .where("status", "==", "active")
                .get();
        } catch (err: any) {
            console.warn("Enrollment collectionGroup query failed:", err.message);
            return NextResponse.json({ classrooms: [], classes: [] });
        }

        const teacherIdsToFetch = new Set<string>();
        const classIdsToFetch = new Set<string>();
        type Pending = {
            kind: "class" | "legacy";
            classId?: string;
            teacherId?: string;
            enrolledAt: string | null;
        };
        const pending: Pending[] = [];

        snap.docs.forEach((doc) => {
            const data = doc.data() || {};
            const path = doc.ref.path; // either classes/{id}/students/{uid} or teacher_enrollments/{id}/students/{uid}
            const segments = path.split("/");
            if (segments[0] === "classes" && segments.length >= 2) {
                const classId = segments[1];
                classIdsToFetch.add(classId);
                pending.push({
                    kind: "class",
                    classId,
                    enrolledAt: toIsoDate(data.enrolledAt),
                });
            } else if (segments[0] === "teacher_enrollments" && segments.length >= 2) {
                const teacherId = segments[1];
                teacherIdsToFetch.add(teacherId);
                pending.push({
                    kind: "legacy",
                    teacherId,
                    enrolledAt: toIsoDate(data.enrolledAt),
                });
            }
        });

        // Bulk-fetch class + teacher docs.
        const classDocs = await Promise.all(
            Array.from(classIdsToFetch).map(async (classId) => {
                const s = await adminDb.collection("classes").doc(classId).get();
                return s.exists ? { id: s.id, ...(s.data() as any) } : null;
            })
        );
        const classById = new Map<string, any>();
        classDocs.forEach((c) => {
            if (c) classById.set(c.id, c);
            if (c?.teacherId) teacherIdsToFetch.add(c.teacherId);
        });

        const teacherDocs = await Promise.all(
            Array.from(teacherIdsToFetch).map(async (teacherId) => {
                const s = await adminDb.collection("teachers").doc(teacherId).get();
                return s.exists ? { id: s.id, ...(s.data() as any) } : null;
            })
        );
        const teacherById = new Map<string, any>();
        teacherDocs.forEach((t) => {
            if (t) teacherById.set(t.id, t);
        });

        const classes: ClassroomRow[] = [];
        const seenClassIds = new Set<string>();
        pending.forEach((row) => {
            if (row.kind === "class" && row.classId) {
                const c = classById.get(row.classId);
                if (!c || c.isArchived) return;
                if (seenClassIds.has(c.id)) return;
                seenClassIds.add(c.id);
                const teacher = c.teacherId ? teacherById.get(c.teacherId) : null;
                classes.push({
                    classId: c.id,
                    className: c.name || "Class",
                    classDescription: c.description ?? null,
                    inviteCode: c.inviteCode || "",
                    isArchived: c.isArchived ?? false,
                    enrolledAt: row.enrolledAt,
                    teacherId: c.teacherId || "",
                    teacherName: teacher?.profile?.name || "Teacher",
                    teacherAvatar: teacher?.profile?.avatarUrl || null,
                    teacherInstitute: teacher?.profile?.institute || "",
                });
            } else if (row.kind === "legacy" && row.teacherId) {
                // Legacy enrollment with no migrated class — synthesize a row so
                // pre-migration installs still render. The classId is the
                // teacherId so the student-facing route can fall back to the
                // teacher-scoped path.
                const teacher = teacherById.get(row.teacherId);
                const synthId = `legacy:${row.teacherId}`;
                if (seenClassIds.has(synthId)) return;
                seenClassIds.add(synthId);
                classes.push({
                    classId: synthId,
                    className: teacher?.profile?.name
                        ? `${teacher.profile.name}'s Class`
                        : "Classroom",
                    classDescription: null,
                    inviteCode: teacher?.inviteCode || "",
                    isArchived: false,
                    enrolledAt: row.enrolledAt,
                    teacherId: row.teacherId,
                    teacherName: teacher?.profile?.name || "Teacher",
                    teacherAvatar: teacher?.profile?.avatarUrl || null,
                    teacherInstitute: teacher?.profile?.institute || "",
                });
            }
        });

        // `classrooms` kept for backward-compat with old clients; new clients
        // should read `classes`.
        return NextResponse.json({
            classes,
            classrooms: classes.map((c) => ({
                teacherId: c.teacherId,
                teacherName: c.teacherName,
                teacherAvatar: c.teacherAvatar,
                teacherInstitute: c.teacherInstitute,
                inviteCode: c.inviteCode,
                enrolledAt: c.enrolledAt,
            })),
        });
    } catch (error: any) {
        console.error("Error fetching enrollments:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch enrollments" },
            { status: 500 }
        );
    }
}
