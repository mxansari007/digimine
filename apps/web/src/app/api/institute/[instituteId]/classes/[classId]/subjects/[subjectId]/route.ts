/**
 * Single-subject mutations.
 *
 *   PATCH /api/institute/[instituteId]/classes/[classId]/subjects/[subjectId]
 *     Body: { name?: string, teacherId?: string, order?: number }
 *     Update any subset. Re-syncs class denormalisation after the write.
 *     When teacherId changes, also keeps the OLD teacher's
 *     `teachingClassIds` array in sync (removes if they no longer teach
 *     anything else in this class).
 *
 *   DELETE /api/institute/[instituteId]/classes/[classId]/subjects/[subjectId]
 *     Removes the subject. Same teacher-cleanup logic.
 *
 * Access: caller must be admin of the institute that owns this class.
 */
import { NextResponse } from "next/server";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";

export const dynamic = "force-dynamic";

async function assertClassUnderInstitute(
    instituteId: string,
    classId: string
): Promise<
    | { ok: true; classRef: FirebaseFirestore.DocumentReference }
    | { ok: false; status: number; error: string }
> {
    const classRef = adminDb.collection("classes").doc(classId);
    const snap = await classRef.get();
    if (!snap.exists) return { ok: false, status: 404, error: "Class not found." };
    const data = snap.data() || {};
    if (data.instituteId && data.instituteId !== instituteId) {
        return { ok: false, status: 403, error: "This class doesn't belong to your institute." };
    }
    return { ok: true, classRef };
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

/**
 * If the given teacher no longer teaches ANY subject in this class, remove
 * the classId from their `teachingClassIds` denormalised array.
 */
async function maybePruneTeachingClass(
    teacherId: string,
    classRef: FirebaseFirestore.DocumentReference
) {
    const remaining = await classRef
        .collection("subjects")
        .where("teacherId", "==", teacherId)
        .limit(1)
        .get();
    if (!remaining.empty) return;
    await adminDb
        .collection("teachers")
        .doc(teacherId)
        .set(
            {
                teachingClassIds: FieldValue.arrayRemove(classRef.id),
                updatedAt: Timestamp.now(),
            },
            { merge: true }
        );
}

// ─── PATCH ────────────────────────────────────────────────────────────

export async function PATCH(
    req: Request,
    { params }: { params: { instituteId: string; classId: string; subjectId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const guard = await assertClassUnderInstitute(params.instituteId, params.classId);
        if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

        const subjectRef = guard.classRef.collection("subjects").doc(params.subjectId);
        const subjectSnap = await subjectRef.get();
        if (!subjectSnap.exists) {
            return NextResponse.json({ error: "Subject not found." }, { status: 404 });
        }
        const previous = subjectSnap.data() || {};

        const body = (await req.json().catch(() => ({}))) as {
            name?: string;
            teacherId?: string;
            order?: number;
        };
        const update: Record<string, unknown> = { updatedAt: Timestamp.now() };

        if (typeof body.name === "string") {
            const name = body.name.trim();
            if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
            if (name.length > 80)
                return NextResponse.json({ error: "Name is too long." }, { status: 400 });

            // Dedupe within the class (excluding this subject itself).
            if (name !== previous.name) {
                const dup = await guard.classRef
                    .collection("subjects")
                    .where("name", "==", name)
                    .limit(1)
                    .get();
                if (!dup.empty && dup.docs[0].id !== params.subjectId) {
                    return NextResponse.json(
                        { error: `A subject named "${name}" already exists in this class.` },
                        { status: 409 }
                    );
                }
            }
            update.name = name;
        }

        let prevTeacherId: string | null = null;
        if (typeof body.teacherId === "string" && body.teacherId.trim()) {
            const newTeacherId = body.teacherId.trim();
            if (newTeacherId !== previous.teacherId) {
                const teacher = await fetchTeacherFromInstitute(
                    params.instituteId,
                    newTeacherId
                );
                if (!teacher) {
                    return NextResponse.json(
                        { error: "That teacher isn't an active member of this institute." },
                        { status: 422 }
                    );
                }
                prevTeacherId = previous.teacherId || null;
                update.teacherId = newTeacherId;
                update.teacherName = teacher.name;
                update.teacherEmail = teacher.email;
            }
        }

        if (typeof body.order === "number" && Number.isFinite(body.order)) {
            update.order = body.order;
        }

        await subjectRef.set(update, { merge: true });
        await syncClassDenorm(guard.classRef);

        // Add the classId to the NEW teacher's teaching list (idempotent),
        // and prune the OLD teacher if they no longer teach anything here.
        if (typeof update.teacherId === "string") {
            await adminDb
                .collection("teachers")
                .doc(update.teacherId as string)
                .set(
                    {
                        teachingClassIds: FieldValue.arrayUnion(params.classId),
                        updatedAt: Timestamp.now(),
                    },
                    { merge: true }
                );
            if (prevTeacherId && prevTeacherId !== update.teacherId) {
                await maybePruneTeachingClass(prevTeacherId, guard.classRef);
            }
        }

        const fresh = await subjectRef.get();
        const data = fresh.data() || {};
        return NextResponse.json({
            subject: {
                id: fresh.id,
                name: data.name || "",
                teacherId: data.teacherId || "",
                teacherName: data.teacherName || "",
                teacherEmail: data.teacherEmail || "",
                order: typeof data.order === "number" ? data.order : 0,
            },
        });
    } catch (error) {
        const e = error as Error;
        console.error("[subjects PATCH] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to update subject" },
            { status: 500 }
        );
    }
}

// ─── DELETE ───────────────────────────────────────────────────────────

export async function DELETE(
    req: Request,
    { params }: { params: { instituteId: string; classId: string; subjectId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const guard = await assertClassUnderInstitute(params.instituteId, params.classId);
        if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

        const subjectRef = guard.classRef.collection("subjects").doc(params.subjectId);
        const subjectSnap = await subjectRef.get();
        if (!subjectSnap.exists) {
            return NextResponse.json({ error: "Subject not found." }, { status: 404 });
        }
        const teacherId = subjectSnap.data()?.teacherId || null;

        await subjectRef.delete();
        await syncClassDenorm(guard.classRef);
        if (teacherId) {
            await maybePruneTeachingClass(teacherId, guard.classRef);
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        const e = error as Error;
        console.error("[subjects DELETE] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to delete subject" },
            { status: 500 }
        );
    }
}
