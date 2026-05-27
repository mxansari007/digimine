/**
 * Subjects under an institute class.
 *
 *   GET  /api/institute/[instituteId]/classes/[classId]/subjects
 *     List all subjects taught in this class, ordered by `order` then by
 *     creation. Each subject row carries its assigned teacher (denormalised
 *     name/email so the UI doesn't need a follow-up roster lookup).
 *
 *   POST /api/institute/[instituteId]/classes/[classId]/subjects
 *     Body: { name: string, teacherId: string }
 *     Adds a new subject. Validates the teacher is an active member of the
 *     institute. Bumps `class.teacherIds` (a denormalised set used by
 *     future cross-class queries) and stamps `teacherName` from the
 *     roster doc so the UI is fast to read.
 *
 * Schema (class subcollection):
 *   classes/{classId}/subjects/{subjectId} = {
 *     name: string                     // e.g. "Mathematics"
 *     teacherId: string                // user id of the teacher
 *     teacherName: string              // denormalised display name
 *     teacherEmail: string             // denormalised
 *     order: number                    // sort order within class
 *     createdAt, updatedAt, createdBy: Timestamps + uid
 *   }
 *
 * Class denormalisation (kept in sync by this route + the [subjectId] route):
 *   classes/{classId}.teacherIds: string[]   // distinct teachers across subjects
 *   classes/{classId}.subjectCount: number   // count for cheap reads
 *
 * Access: caller must be admin of the institute that owns this class.
 */
import { NextResponse } from "next/server";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

interface SubjectPayload {
    id: string;
    name: string;
    teacherId: string;
    teacherName: string;
    teacherEmail: string;
    order: number;
    createdAt: string | null;
    updatedAt: string | null;
}

function serializeSubject(
    doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot
): SubjectPayload {
    const data = doc.data() || {};
    return {
        id: doc.id,
        name: data.name || "",
        teacherId: data.teacherId || "",
        teacherName: data.teacherName || "",
        teacherEmail: data.teacherEmail || "",
        order: typeof data.order === "number" ? data.order : 0,
        createdAt: toIsoDate(data.createdAt),
        updatedAt: toIsoDate(data.updatedAt),
    };
}

/**
 * Validates the class belongs to the given institute and that the caller
 * can manage it. Returns the class ref + data on success.
 */
async function assertClassUnderInstitute(
    instituteId: string,
    classId: string
): Promise<
    | { ok: true; classRef: FirebaseFirestore.DocumentReference; classData: FirebaseFirestore.DocumentData }
    | { ok: false; status: number; error: string }
> {
    const classRef = adminDb.collection("classes").doc(classId);
    const snap = await classRef.get();
    if (!snap.exists) return { ok: false, status: 404, error: "Class not found." };
    const data = snap.data() || {};
    if (data.instituteId && data.instituteId !== instituteId) {
        return { ok: false, status: 403, error: "This class doesn't belong to your institute." };
    }
    return { ok: true, classRef, classData: data };
}

async function fetchTeacherFromInstitute(
    instituteId: string,
    teacherId: string
): Promise<{ name: string; email: string } | null> {
    const snap = await adminDb
        .collection("institutes")
        .doc(instituteId)
        .collection("teachers")
        .doc(teacherId)
        .get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.status !== "active") return null;
    return {
        name: data.name || data.email || "Teacher",
        email: data.email || "",
    };
}

/** Rebuild the `teacherIds` array on the class from the live subjects. */
async function syncClassDenorm(classRef: FirebaseFirestore.DocumentReference) {
    const subjectsSnap = await classRef.collection("subjects").get();
    const teacherIds = Array.from(
        new Set(subjectsSnap.docs.map((d) => (d.data() || {}).teacherId).filter(Boolean))
    );
    await classRef.set(
        {
            teacherIds,
            subjectCount: subjectsSnap.size,
            updatedAt: Timestamp.now(),
        },
        { merge: true }
    );
}

// ─── GET ──────────────────────────────────────────────────────────────

export async function GET(
    req: Request,
    { params }: { params: { instituteId: string; classId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const guard = await assertClassUnderInstitute(params.instituteId, params.classId);
        if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

        const subjectsSnap = await guard.classRef.collection("subjects").get();
        const subjects = subjectsSnap.docs.map(serializeSubject);
        subjects.sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            const aT = a.createdAt ? Date.parse(a.createdAt) : 0;
            const bT = b.createdAt ? Date.parse(b.createdAt) : 0;
            return aT - bT;
        });
        return NextResponse.json({ subjects });
    } catch (error) {
        const e = error as Error;
        console.error("[subjects GET] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to load subjects" },
            { status: 500 }
        );
    }
}

// ─── POST (add subject) ───────────────────────────────────────────────

export async function POST(
    req: Request,
    { params }: { params: { instituteId: string; classId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const guard = await assertClassUnderInstitute(params.instituteId, params.classId);
        if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

        const body = (await req.json().catch(() => ({}))) as {
            name?: string;
            teacherId?: string;
        };
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const teacherId = typeof body.teacherId === "string" ? body.teacherId.trim() : "";

        if (!name) {
            return NextResponse.json({ error: "Subject name is required." }, { status: 400 });
        }
        if (name.length > 80) {
            return NextResponse.json({ error: "Subject name is too long." }, { status: 400 });
        }
        if (!teacherId) {
            return NextResponse.json({ error: "Pick a teacher for this subject." }, { status: 400 });
        }

        const teacher = await fetchTeacherFromInstitute(params.instituteId, teacherId);
        if (!teacher) {
            return NextResponse.json(
                { error: "That teacher isn't an active member of this institute." },
                { status: 422 }
            );
        }

        // Reject duplicate subject names within the same class (case-insensitive).
        const existing = await guard.classRef
            .collection("subjects")
            .where("name", "==", name)
            .limit(1)
            .get();
        if (!existing.empty) {
            return NextResponse.json(
                { error: `A subject named "${name}" already exists in this class.` },
                { status: 409 }
            );
        }

        // Append at the end — order = max + 1.
        const allSnap = await guard.classRef.collection("subjects").get();
        const nextOrder = allSnap.docs.reduce(
            (max, d) => Math.max(max, (d.data() || {}).order || 0),
            0
        ) + 1;

        const now = Timestamp.now();
        const ref = guard.classRef.collection("subjects").doc();
        await ref.set({
            name,
            teacherId,
            teacherName: teacher.name,
            teacherEmail: teacher.email,
            order: nextOrder,
            createdAt: now,
            updatedAt: now,
            createdBy: auth.userId,
        });

        await syncClassDenorm(guard.classRef);

        // Stamp the teacher's array of "classes I teach in" on their teacher
        // doc so cross-class queries can resolve cheaply.
        await adminDb
            .collection("teachers")
            .doc(teacherId)
            .set(
                {
                    teachingClassIds: FieldValue.arrayUnion(params.classId),
                    updatedAt: now,
                },
                { merge: true }
            );

        const fresh = await ref.get();
        return NextResponse.json({ subject: serializeSubject(fresh) });
    } catch (error) {
        const e = error as Error;
        console.error("[subjects POST] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to add subject" },
            { status: 500 }
        );
    }
}

