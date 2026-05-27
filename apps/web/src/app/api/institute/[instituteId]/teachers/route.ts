import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin, bumpInstituteCounts } from "@/lib/server/institutes";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

function serializeRow(doc: FirebaseFirestore.DocumentSnapshot) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        teacherId: data.teacherId || doc.id,
        email: data.email || "",
        name: data.name || null,
        status: data.status || "invited",
        invitedAt: toIsoDate(data.invitedAt),
        invitedBy: data.invitedBy || "",
        joinedAt: toIsoDate(data.joinedAt),
        removedAt: toIsoDate(data.removedAt),
        // Expose the claim token on invited rows so the institute admin can
        // copy the /claim/{token} URL from the roster. Real-teacher rows
        // (status=active) carry no token. Null when missing so the client
        // can render conditionally without `data.claimToken === undefined`
        // confusion.
        claimToken: typeof data.claimToken === "string" && data.claimToken ? data.claimToken : null,
    };
}

export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const snap = await adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("teachers")
            .get();
        const teachers = snap.docs.map(serializeRow);
        teachers.sort((a, b) => {
            const aT = a.invitedAt ? Date.parse(a.invitedAt) : 0;
            const bT = b.invitedAt ? Date.parse(b.invitedAt) : 0;
            return bT - aT;
        });
        return NextResponse.json({ teachers });
    } catch (error: any) {
        console.error("List institute teachers failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/**
 * Invite a teacher to the institute. Two modes:
 *   1. If a teacher with this email already exists → mark them active and
 *      stamp `instituteId` on their teacher doc immediately.
 *   2. Otherwise create an "invited" placeholder; the teacher claims it
 *      later via /api/institute/join.
 */
export async function POST(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => ({}));
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

        // Seat check
        const subscription = auth.institute.subscription || {};
        const seats: number = subscription.seats || 5;
        const rosterSnap = await adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("teachers")
            .get();
        const activeCount = rosterSnap.docs.filter((d) => (d.data() || {}).status !== "removed").length;
        if (activeCount >= seats) {
            return NextResponse.json(
                { error: `Seat limit reached (${seats}). Upgrade your plan to add more.` },
                { status: 402 }
            );
        }

        // Already invited?
        const existingByEmail = rosterSnap.docs.find((d) => (d.data() || {}).email === email);
        if (existingByEmail) {
            return NextResponse.json(
                { error: "This email is already on the roster", existing: serializeRow(existingByEmail) },
                { status: 409 }
            );
        }

        // Find an existing teacher account with this email.
        const userSnap = await adminDb.collection("users").where("email", "==", email).limit(1).get();
        const userId = userSnap.empty ? null : userSnap.docs[0].id;
        const teacherDocSnap = userId ? await adminDb.collection("teachers").doc(userId).get() : null;

        const now = Timestamp.now();
        const docId = userId || `invite:${email}`;

        const wasTeacher = Boolean(teacherDocSnap?.exists);
        if (wasTeacher && teacherDocSnap?.data()?.instituteId && teacherDocSnap.data()?.instituteId !== params.instituteId) {
            return NextResponse.json(
                { error: "This teacher is already part of another institute" },
                { status: 409 }
            );
        }

        const data = {
            teacherId: userId || docId,
            email,
            name: name || (teacherDocSnap?.data()?.profile?.name ?? null),
            status: wasTeacher ? "active" : "invited",
            invitedAt: now,
            invitedBy: auth.userId,
            joinedAt: wasTeacher ? now : null,
            removedAt: null,
        };

        await adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("teachers")
            .doc(docId)
            .set(data);

        if (wasTeacher && userId) {
            // Stamp the teacher doc with their employer so rules see the link.
            await adminDb
                .collection("teachers")
                .doc(userId)
                .set({ instituteId: params.instituteId, updatedAt: now }, { merge: true });
            await bumpInstituteCounts(params.instituteId, {
                teacherCount: 1,
                activeTeacherCount: 1,
            });
        } else {
            await bumpInstituteCounts(params.instituteId, { teacherCount: 1 });
        }

        return NextResponse.json({
            teacher: { id: docId, ...data, invitedAt: now.toDate().toISOString(), joinedAt: wasTeacher ? now.toDate().toISOString() : null, removedAt: null },
        });
    } catch (error: any) {
        console.error("Invite institute teacher failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
