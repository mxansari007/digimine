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

export async function listTeacherClasses(teacherId: string): Promise<any[]> {
    const snap = await adminDb
        .collection("classes")
        .where("teacherId", "==", teacherId)
        .get();
    return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
            const aTime = (a.createdAt?.toMillis?.() || 0);
            const bTime = (b.createdAt?.toMillis?.() || 0);
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
