import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, toIsoDate } from "@/lib/server/classroomAccess";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_PREFIX = "INS-";

export function generateInstituteInviteCode(): string {
    let code = INVITE_PREFIX;
    for (let i = 0; i < 8; i++) {
        code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
    }
    return code;
}

export async function allocateUniqueInstituteInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateInstituteInviteCode();
        const existing = await adminDb
            .collection("institutes")
            .where("inviteCode", "==", code)
            .limit(1)
            .get();
        if (existing.empty) return code;
    }
    return `${INVITE_PREFIX}${Date.now().toString(36).toUpperCase()}`;
}

export async function getInstituteById(instituteId: string): Promise<any | null> {
    if (!instituteId) return null;
    const snap = await adminDb.collection("institutes").doc(instituteId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
}

export async function getInstituteByInviteCode(inviteCode: string): Promise<any | null> {
    if (!inviteCode) return null;
    const snap = await adminDb
        .collection("institutes")
        .where("inviteCode", "==", inviteCode)
        .limit(1)
        .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
}

export async function isInstituteAdmin(instituteId: string, userId: string): Promise<boolean> {
    if (!instituteId || !userId) return false;
    const snap = await adminDb
        .collection("institutes")
        .doc(instituteId)
        .collection("admins")
        .doc(userId)
        .get();
    return snap.exists;
}

/**
 * Resolve the institute a teacher belongs to (or null when independent).
 */
export async function getTeacherInstituteId(teacherId: string): Promise<string | null> {
    if (!teacherId) return null;
    const snap = await adminDb.collection("teachers").doc(teacherId).get();
    if (!snap.exists) return null;
    const id = snap.data()?.instituteId;
    return typeof id === "string" && id ? id : null;
}

export async function isInstituteAdminForTeacher(
    teacherId: string,
    userId: string
): Promise<boolean> {
    const instituteId = await getTeacherInstituteId(teacherId);
    if (!instituteId) return false;
    return isInstituteAdmin(instituteId, userId);
}

export type InstituteAdminAuth =
    | { ok: true; userId: string; institute: any }
    | { ok: false; status: number; error: string };

export async function assertInstituteAdmin(
    req: Request,
    instituteId: string
): Promise<InstituteAdminAuth> {
    const userId = await getBearerUserId(req).catch(() => null);
    if (!userId) return { ok: false, status: 401, error: "Sign in" };
    if (!instituteId) return { ok: false, status: 400, error: "instituteId required" };
    const institute = await getInstituteById(instituteId);
    if (!institute) return { ok: false, status: 404, error: "Institute not found" };
    const isAdmin = await isInstituteAdmin(instituteId, userId);
    if (!isAdmin) return { ok: false, status: 403, error: "You are not an admin of this institute" };
    return { ok: true, userId, institute };
}

/**
 * Find the institute the caller administrates. There can be at most one
 * (UI assumes "your institute" — single ownership). Returns null when the
 * user doesn't admin any institute.
 */
export async function findInstituteForAdmin(userId: string): Promise<any | null> {
    if (!userId) return null;

    // Fast, strongly-consistent path: the owner's user doc records their
    // instituteId (written atomically with role at creation). A direct doc
    // read never lags, so the dashboard resolves immediately after onboarding
    // — unlike the collectionGroup query below, whose index is only eventually
    // consistent and can return empty for a few seconds post-creation, which
    // used to bounce a brand-new admin straight back into the onboarding loop.
    const userSnap = await adminDb.collection("users").doc(userId).get();
    const instituteId = userSnap.exists
        ? (userSnap.data()?.instituteId as string | undefined)
        : undefined;
    if (instituteId) {
        const inst = await getInstituteById(instituteId);
        if (inst) return inst;
    }

    // Fallback: covers co-admins added without the user-doc pointer.
    const snap = await adminDb
        .collectionGroup("admins")
        .where("userId", "==", userId)
        .limit(1)
        .get();
    if (snap.empty) return null;
    // Path: institutes/{instituteId}/admins/{userId}
    const path = snap.docs[0].ref.path.split("/");
    return getInstituteById(path[1]);
}

/**
 * Get the teacher ids affiliated with an institute (active only by default).
 */
export async function listInstituteTeacherIds(
    instituteId: string,
    options: { includeInvited?: boolean } = {}
): Promise<string[]> {
    const snap = await adminDb
        .collection("institutes")
        .doc(instituteId)
        .collection("teachers")
        .get();
    const ids: string[] = [];
    snap.docs.forEach((d) => {
        const data = d.data() || {};
        const status = data.status || "active";
        if (status === "active") ids.push(data.teacherId || d.id);
        else if (options.includeInvited && status === "invited") ids.push(data.teacherId || d.id);
    });
    return ids;
}

export function serializeInstitute(doc: any) {
    if (!doc) return null;
    const data = doc.data ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        name: data.name || "",
        slug: data.slug || "",
        description: data.description ?? null,
        ownerId: data.ownerId || "",
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        website: data.website ?? null,
        address: data.address ?? null,
        inviteCode: data.inviteCode || "",
        branding: {
            logoUrl: data.branding?.logoUrl ?? null,
            primaryColor: data.branding?.primaryColor ?? null,
            tagline: data.branding?.tagline ?? null,
        },
        subscription: data.subscription
            ? {
                  ...data.subscription,
                  startedAt: toIsoDate(data.subscription.startedAt),
                  expiresAt: toIsoDate(data.subscription.expiresAt),
                  gracePeriodEndsAt: toIsoDate(data.subscription.gracePeriodEndsAt),
              }
            : null,
        stats: {
            teacherCount: data.stats?.teacherCount ?? 0,
            activeTeacherCount: data.stats?.activeTeacherCount ?? 0,
            classCount: data.stats?.classCount ?? 0,
            studentCount: data.stats?.studentCount ?? 0,
        },
        isArchived: Boolean(data.isArchived),
        createdAt: toIsoDate(data.createdAt),
        updatedAt: toIsoDate(data.updatedAt),
    };
}

/**
 * Bump aggregate counters on the institute doc.
 */
export async function bumpInstituteCounts(
    instituteId: string,
    deltas: { teacherCount?: number; activeTeacherCount?: number; classCount?: number; studentCount?: number }
): Promise<void> {
    const update: Record<string, any> = { updatedAt: Timestamp.now() };
    if (deltas.teacherCount !== undefined) update["stats.teacherCount"] = FieldValue.increment(deltas.teacherCount);
    if (deltas.activeTeacherCount !== undefined)
        update["stats.activeTeacherCount"] = FieldValue.increment(deltas.activeTeacherCount);
    if (deltas.classCount !== undefined) update["stats.classCount"] = FieldValue.increment(deltas.classCount);
    if (deltas.studentCount !== undefined) update["stats.studentCount"] = FieldValue.increment(deltas.studentCount);
    if (Object.keys(update).length === 1) return;
    await adminDb.collection("institutes").doc(instituteId).update(update);
}
