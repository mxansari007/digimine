import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

type Meeting = { day: string; startTime: string; endTime: string; room: string | null };

type ClassroomRow = {
    // Class identity.
    classId: string;
    // Set for institute classes expanded per-subject; null otherwise. Used as
    // the React key so multiple subjects of one section don't collide.
    subjectId: string | null;
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
    // New model (null/empty on legacy classes) — drives the subject-led list
    // and the student timetable.
    subject: string | null;
    sectionName: string | null;
    groupName: string | null;
    room: string | null;
    meetings: Meeting[];
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
            groupId?: string | null;
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
                    groupId: data.groupId || null,
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

        // Institute classes hold their subjects (each = a teacher + schedule)
        // in a `subjects` subcollection, and the subject teacher's display name
        // lives in the institute roster. Fetch both so the student sees one row
        // per SUBJECT instead of a single subjectless section card.
        type SubjectRow = {
            id: string;
            name: string;
            teacherId: string;
            room: string | null;
            meetings: Meeting[];
        };
        const subjectsByClassId = new Map<string, SubjectRow[]>();
        const rosterKeys = new Set<string>(); // `${instituteId}::${teacherId}`
        await Promise.all(
            classDocs
                .filter((c): c is any => !!c && !!c.instituteId)
                .map(async (c) => {
                    const subsSnap = await adminDb
                        .collection("classes")
                        .doc(c.id)
                        .collection("subjects")
                        .get();
                    const subs: SubjectRow[] = subsSnap.docs.map((d) => {
                        const sd = d.data() || {};
                        const tid = String(sd.teacherId || "");
                        if (tid) rosterKeys.add(`${c.instituteId}::${tid}`);
                        return {
                            id: d.id,
                            name: sd.name || "Subject",
                            teacherId: tid,
                            room: sd.room ?? null,
                            meetings: Array.isArray(sd.meetings) ? sd.meetings : [],
                        };
                    });
                    if (subs.length) subjectsByClassId.set(c.id, subs);
                })
        );
        const rosterNameByKey = new Map<string, string>();
        await Promise.all(
            Array.from(rosterKeys).map(async (key) => {
                const [instId, tid] = key.split("::");
                if (!instId || !tid) return;
                const s = await adminDb
                    .collection("institutes")
                    .doc(instId)
                    .collection("teachers")
                    .doc(tid)
                    .get();
                if (s.exists) {
                    const d = s.data() || {};
                    rosterNameByKey.set(key, d.name || d.email || "Teacher");
                }
            })
        );

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

        // Group names for rows that came in via a group join.
        const groupIdsToFetch = new Set<string>();
        pending.forEach((p) => {
            if (p.kind === "class" && p.groupId) groupIdsToFetch.add(p.groupId);
        });
        const groupDocs = await Promise.all(
            Array.from(groupIdsToFetch).map(async (gid) => {
                const s = await adminDb.collection("groups").doc(gid).get();
                return s.exists ? { id: s.id, name: (s.data() as any)?.name as string } : null;
            })
        );
        const groupNameById = new Map<string, string>();
        groupDocs.forEach((g) => {
            if (g) groupNameById.set(g.id, g.name || "");
        });

        const classes: ClassroomRow[] = [];
        const seenClassIds = new Set<string>();
        pending.forEach((row) => {
            if (row.kind === "class" && row.classId) {
                const c = classById.get(row.classId);
                if (!c || c.isArchived) return;
                const groupName = row.groupId ? groupNameById.get(row.groupId) || null : null;
                const subs = subjectsByClassId.get(c.id);

                // Institute class with subjects → one row per subject, each with
                // its own teacher, room and schedule.
                if (c.instituteId && subs && subs.length) {
                    subs.forEach((subj) => {
                        const key = `${c.id}:${subj.id}`;
                        if (seenClassIds.has(key)) return;
                        seenClassIds.add(key);
                        classes.push({
                            classId: c.id,
                            subjectId: subj.id,
                            className: c.name || "Class",
                            classDescription: c.description ?? null,
                            inviteCode: c.inviteCode || "",
                            isArchived: c.isArchived ?? false,
                            enrolledAt: row.enrolledAt,
                            teacherId: subj.teacherId || "",
                            teacherName:
                                rosterNameByKey.get(`${c.instituteId}::${subj.teacherId}`) || "Teacher",
                            teacherAvatar: null,
                            teacherInstitute: "",
                            subject: subj.name,
                            sectionName: c.sectionName ?? c.name ?? null,
                            groupName,
                            room: subj.room ?? null,
                            meetings: subj.meetings,
                        });
                    });
                    return;
                }

                // Independent-teacher class (one subject) or an institute
                // section with no subjects yet → a single row.
                if (seenClassIds.has(c.id)) return;
                seenClassIds.add(c.id);
                const teacher = c.teacherId ? teacherById.get(c.teacherId) : null;
                classes.push({
                    classId: c.id,
                    subjectId: null,
                    className: c.name || "Class",
                    classDescription: c.description ?? null,
                    inviteCode: c.inviteCode || "",
                    isArchived: c.isArchived ?? false,
                    enrolledAt: row.enrolledAt,
                    teacherId: c.teacherId || "",
                    teacherName: teacher?.profile?.name || "Teacher",
                    teacherAvatar: teacher?.profile?.avatarUrl || null,
                    teacherInstitute: teacher?.profile?.institute || "",
                    subject: c.subject ?? null,
                    sectionName: c.sectionName ?? null,
                    groupName,
                    room: c.room ?? null,
                    meetings: Array.isArray(c.meetings) ? c.meetings : [],
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
                    subjectId: null,
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
                    subject: null,
                    sectionName: null,
                    groupName: null,
                    room: null,
                    meetings: [],
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
