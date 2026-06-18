import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, toIsoDate } from "@/lib/server/classroomAccess";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_LENGTH = 8;
const INVITE_PREFIX = "CLS-";

export function generateInviteCode(): string {
    let code = INVITE_PREFIX;
    for (let i = 0; i < INVITE_LENGTH; i++) {
        code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
    }
    return code;
}

export type ClassResolveResult =
    | { ok: true; class: any; classId: string }
    | { ok: false; status: number; error: string };

export async function getClassById(classId: string): Promise<any | null> {
    if (!classId) return null;
    const snap = await adminDb.collection("classes").doc(classId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
}

export async function getClassByInviteCode(inviteCode: string): Promise<any | null> {
    if (!inviteCode) return null;
    const snap = await adminDb
        .collection("classes")
        .where("inviteCode", "==", inviteCode)
        .limit(1)
        .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
}

/**
 * Allocate a fresh invite code that does not collide with any existing
 * class. We do up to a few retries — at 32^8 the chance of collision is
 * vanishingly small, but it's cheap to guard against.
 */
export async function allocateUniqueInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateInviteCode();
        const existing = await adminDb
            .collection("classes")
            .where("inviteCode", "==", code)
            .limit(1)
            .get();
        if (existing.empty) return code;
    }
    // Fall back to a UUID-flavored code if we somehow keep colliding.
    return `${INVITE_PREFIX}${Date.now().toString(36).toUpperCase()}`;
}

export async function hasActiveClassEnrollment(
    classId: string,
    studentId: string
): Promise<boolean> {
    if (!classId || !studentId) return false;
    const snap = await adminDb
        .collection("classes")
        .doc(classId)
        .collection("students")
        .doc(studentId)
        .get();
    return snap.exists && snap.data()?.status === "active";
}

export type EnrollmentAccessResult =
    | { allowed: true; userId: string; classDoc: any }
    | { allowed: false; status: number; error: string };

export async function assertClassEnrollment(
    req: Request,
    classId: string
): Promise<EnrollmentAccessResult> {
    const userId = await getBearerUserId(req).catch(() => null);
    if (!userId) {
        return { allowed: false, status: 401, error: "Sign in to access this class." };
    }
    const classDoc = await getClassById(classId);
    if (!classDoc) {
        return { allowed: false, status: 404, error: "Class not found." };
    }
    if (classDoc.isArchived) {
        return { allowed: false, status: 410, error: "This class is archived." };
    }
    const enrolled = await hasActiveClassEnrollment(classId, userId);
    if (!enrolled) {
        return {
            allowed: false,
            status: 403,
            error: "You are not enrolled in this class.",
        };
    }
    return { allowed: true, userId, classDoc };
}

/**
 * Verify that the given teacherId is the authenticated user. Used by
 * `/api/teacher/*` routes that scope by classId — we still want to confirm
 * the caller actually owns the class they are operating on.
 */
export async function assertClassOwner(
    req: Request,
    classId: string
): Promise<{ ok: true; teacherId: string; classDoc: any } | { ok: false; status: number; error: string }> {
    const userId = await getBearerUserId(req).catch(() => null);
    if (!userId) return { ok: false, status: 401, error: "Authentication required" };
    const classDoc = await getClassById(classId);
    if (!classDoc) return { ok: false, status: 404, error: "Class not found" };
    if (classDoc.teacherId !== userId) {
        return { ok: false, status: 403, error: "You do not own this class" };
    }
    return { ok: true, teacherId: userId, classDoc };
}

/**
 * Like {@link assertClassOwner}, but also allows a teacher who teaches a SUBJECT
 * in the class — their uid is in `classDoc.teacherIds[]` (institute classes the
 * teacher is assigned to but doesn't "own"). Use this for READ + student/content
 * management on assigned classes; keep `assertClassOwner` for structural changes
 * (rename / archive), which only the owner / institute admin should do.
 */
export async function assertClassTeacher(
    req: Request,
    classId: string
): Promise<{ ok: true; teacherId: string; classDoc: any } | { ok: false; status: number; error: string }> {
    const userId = await getBearerUserId(req).catch(() => null);
    if (!userId) return { ok: false, status: 401, error: "Authentication required" };
    const classDoc = await getClassById(classId);
    if (!classDoc) return { ok: false, status: 404, error: "Class not found" };
    const isOwner = classDoc.teacherId === userId;
    const isSubjectTeacher =
        Array.isArray(classDoc.teacherIds) && classDoc.teacherIds.includes(userId);
    if (!isOwner && !isSubjectTeacher) {
        return { ok: false, status: 403, error: "You don't teach this class" };
    }
    return { ok: true, teacherId: userId, classDoc };
}

export async function listTeacherClasses(teacherId: string): Promise<any[]> {
    // A teacher should see two kinds of class:
    //   1. ones they OWN — `teacherId == them` (independent-teacher classes, and
    //      institute classes where they're the lead teacher);
    //   2. institute classes where they teach a SUBJECT — the institute subjects
    //      route denormalises every subject's teacher into `class.teacherIds[]`,
    //      so we also match `teacherIds array-contains them`.
    // Without (2), a teacher assigned only as a subject teacher (teacherId on the
    // class is "" or the lead) never sees the institute class they teach in.
    const [owned, assigned] = await Promise.all([
        adminDb.collection("classes").where("teacherId", "==", teacherId).get(),
        adminDb.collection("classes").where("teacherIds", "array-contains", teacherId).get(),
    ]);
    const byId = new Map<string, any>();
    for (const d of [...owned.docs, ...assigned.docs]) {
        if (!byId.has(d.id)) byId.set(d.id, { id: d.id, ...d.data() });
    }
    return Array.from(byId.values()).sort((a: any, b: any) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
    });
}

/**
 * Returns the list of class IDs the user is actively enrolled in. Used to
 * check whether a student may read a piece of teacher content (the content
 * must reference at least one of these classes in its `classIds` array).
 */
export async function getStudentActiveClassIds(studentId: string): Promise<string[]> {
    if (!studentId) return [];
    const snap = await adminDb
        .collectionGroup("students")
        .where("studentId", "==", studentId)
        .where("status", "==", "active")
        .get();
    const ids = new Set<string>();
    snap.docs.forEach((d) => {
        // Subcollection path is classes/{classId}/students/{studentId}
        const segments = d.ref.path.split("/");
        if (segments.length >= 2 && segments[0] === "classes") {
            ids.add(segments[1]);
        }
    });
    return Array.from(ids);
}

export async function studentCanAccessContent(
    studentId: string,
    content: { teacherId?: string; classIds?: string[] }
): Promise<boolean> {
    if (!studentId || !content) return false;
    const targetClassIds = content.classIds || [];
    if (targetClassIds.length === 0) return false;
    const myClassIds = await getStudentActiveClassIds(studentId);
    return targetClassIds.some((classId) => myClassIds.includes(classId));
}

export function serializeClass(doc: any) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        teacherId: data.teacherId,
        name: data.name,
        description: data.description ?? null,
        inviteCode: data.inviteCode,
        studentsCount: data.studentsCount ?? 0,
        activeStudentsCount: data.activeStudentsCount ?? 0,
        isArchived: data.isArchived ?? false,
        // Per-class opt-in for the Virtual Lab. Drives the in-class lab entry
        // points (teacher "Start Lab" card + student "Join Live Lab"); the lab
        // API also re-checks this server-side, so this is purely for the UI gate.
        labEnabled: data.labEnabled === true,
        // Institute classes set instituteId + teacherIds[] (all subject teachers);
        // independent-teacher classes leave instituteId null. Callers use these to
        // tell the two shapes apart and to know every teacher of a class.
        instituteId: data.instituteId ?? null,
        teacherIds: Array.isArray(data.teacherIds) ? data.teacherIds : [],
        // Section / subject / schedule (new model; absent on legacy classes).
        universityId: data.universityId ?? null,
        sectionId: data.sectionId ?? null,
        sectionName: data.sectionName ?? null,
        subject: data.subject ?? null,
        groupIds: Array.isArray(data.groupIds) ? data.groupIds : [],
        groupNames: Array.isArray(data.groupNames) ? data.groupNames : [],
        groupCodes: Array.isArray(data.groupCodes) ? data.groupCodes : [],
        room: data.room ?? null,
        meetings: Array.isArray(data.meetings) ? data.meetings : [],
        createdAt: toIsoDate(data.createdAt),
        updatedAt: toIsoDate(data.updatedAt),
    };
}

export async function bumpClassCounts(classId: string, deltas: {
    studentsCount?: number;
    activeStudentsCount?: number;
}): Promise<void> {
    const update: Record<string, any> = { updatedAt: Timestamp.now() };
    if (deltas.studentsCount !== undefined) {
        update.studentsCount = FieldValue.increment(deltas.studentsCount);
    }
    if (deltas.activeStudentsCount !== undefined) {
        update.activeStudentsCount = FieldValue.increment(deltas.activeStudentsCount);
    }
    if (Object.keys(update).length === 1) return;
    await adminDb.collection("classes").doc(classId).set(update, { merge: true });
}

export { generateInviteCode as generateClassInviteCode };
