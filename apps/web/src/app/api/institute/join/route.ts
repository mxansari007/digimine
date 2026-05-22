import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    bumpInstituteCounts,
    getInstituteByInviteCode,
    serializeInstitute,
} from "@/lib/server/institutes";

export const dynamic = "force-dynamic";

/**
 * Teacher joins an institute via its invite code. Three scenarios:
 *   - A `pending:` row exists for this teacher's email → flip it to active
 *     and rebind the docId to the teacher's user id.
 *   - No existing row → create an "active" row directly.
 *   - Teacher already affiliated with another institute → 409.
 */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in" }, { status: 401 });
        const body = await req.json().catch(() => ({}));
        const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";
        if (!inviteCode) return NextResponse.json({ error: "Invite code required" }, { status: 400 });

        const institute = await getInstituteByInviteCode(inviteCode);
        if (!institute) return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
        if (institute.isArchived)
            return NextResponse.json({ error: "This institute is archived" }, { status: 410 });

        // Must be a teacher already (we don't auto-promote students).
        const teacherSnap = await adminDb.collection("teachers").doc(userId).get();
        if (!teacherSnap.exists) {
            return NextResponse.json(
                { error: "Only existing teachers can join an institute. Complete teacher onboarding first." },
                { status: 403 }
            );
        }
        const teacherData = teacherSnap.data() || {};
        if (teacherData.instituteId && teacherData.instituteId !== institute.id) {
            return NextResponse.json(
                { error: "You're already part of another institute. Leave it first." },
                { status: 409 }
            );
        }

        // Seat check
        const seats: number = institute.subscription?.seats || 5;
        const rosterSnap = await adminDb
            .collection("institutes")
            .doc(institute.id)
            .collection("teachers")
            .get();
        const activeCount = rosterSnap.docs.filter((d) => (d.data() || {}).status === "active").length;

        const userSnap = await adminDb.collection("users").doc(userId).get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};
        const email = (userData.email || teacherData.profile?.email || "").toLowerCase();
        const name = userData.displayName || teacherData.profile?.name || null;

        // Look for an existing invited row keyed by email
        const inviteRow = rosterSnap.docs.find((d) => {
            const data = d.data() || {};
            return data.email === email && data.status === "invited";
        });

        const rosterRef = adminDb
            .collection("institutes")
            .doc(institute.id)
            .collection("teachers")
            .doc(userId);
        const now = Timestamp.now();

        if (inviteRow) {
            // Replace the placeholder row keyed by `invite:<email>` with a proper one keyed by uid.
            const old = inviteRow.data() || {};
            await rosterRef.set({
                teacherId: userId,
                email,
                name,
                status: "active",
                invitedAt: old.invitedAt || now,
                invitedBy: old.invitedBy || institute.ownerId,
                joinedAt: now,
                removedAt: null,
            });
            // Remove the placeholder if the docId differs (i.e. it was the synthetic email one).
            if (inviteRow.id !== userId) {
                await inviteRow.ref.delete();
            }
            await bumpInstituteCounts(institute.id, { activeTeacherCount: 1 });
        } else {
            if (activeCount >= seats) {
                return NextResponse.json(
                    { error: "This institute is at its seat limit." },
                    { status: 402 }
                );
            }
            await rosterRef.set({
                teacherId: userId,
                email,
                name,
                status: "active",
                invitedAt: now,
                invitedBy: institute.ownerId,
                joinedAt: now,
                removedAt: null,
            });
            await bumpInstituteCounts(institute.id, {
                teacherCount: 1,
                activeTeacherCount: 1,
            });
        }

        await adminDb
            .collection("teachers")
            .doc(userId)
            .set({ instituteId: institute.id, updatedAt: now }, { merge: true });

        return NextResponse.json({
            ok: true,
            institute: serializeInstitute({ id: institute.id, ...institute }),
        });
    } catch (error: any) {
        console.error("Institute join failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
