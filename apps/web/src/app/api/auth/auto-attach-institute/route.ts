/**
 * POST /api/auth/auto-attach-institute
 *
 * Called by the signup / Google-sign-in flow right after a new student
 * account is created. Scans across all institutes' `student_invites`
 * subcollections for a pending row matching this user's email; if found,
 * flips the row to active, rebinds it to the user's uid, and stamps
 * `users/{uid}.instituteId` so the dashboard guards / sidebar see the
 * relationship immediately.
 *
 * No-op when:
 *   - No pending invite exists for the user's email
 *   - User is not a student (role !== "customer" / null)
 *   - User is already linked to an institute
 *
 * Auth: Bearer Firebase ID token (the just-signed-up user).
 *
 * Why server-side: requires the cross-institute collectionGroup query
 * which Firestore rules don't let unauthenticated clients run, and we
 * need admin SDK to bypass for the write to `users/{uid}`.
 */
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const auth = req.headers.get("authorization") || "";
        const match = auth.match(/^Bearer\s+(.+)$/i);
        if (!match) {
            return NextResponse.json({ error: "Sign in first." }, { status: 401 });
        }
        const decoded = await adminAuth.verifyIdToken(match[1]);
        const uid = decoded.uid;
        const email = (decoded.email || "").toLowerCase();
        if (!email) {
            return NextResponse.json({ attached: false, reason: "no_email" });
        }

        // Bail if user is already linked.
        const userSnap = await adminDb.collection("users").doc(uid).get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};
        if (userData.instituteId) {
            return NextResponse.json({
                attached: false,
                reason: "already_linked",
                instituteId: userData.instituteId,
            });
        }
        // Only auto-attach students; teachers / admins go through their
        // own onboarding flows.
        const role = userData.role ?? null;
        if (role !== null && role !== "customer") {
            return NextResponse.json({ attached: false, reason: "wrong_role" });
        }

        // Look across all institutes' student_invites for a pending row
        // matching this email.
        const pendingId = `pending:${email}`;
        const matches = await adminDb
            .collectionGroup("student_invites")
            .where("email", "==", email)
            .where("status", "==", "invited")
            .limit(1)
            .get();
        if (matches.empty) {
            return NextResponse.json({ attached: false, reason: "no_invite" });
        }
        const inviteDoc = matches.docs[0];
        // Path: institutes/{instituteId}/student_invites/{docId}
        const instituteId = inviteDoc.ref.parent.parent?.id;
        if (!instituteId) {
            return NextResponse.json({ attached: false, reason: "bad_path" });
        }

        const now = Timestamp.now();

        // Rebind the invite from `pending:{email}` → real uid + flip to active.
        const newRosterRef = adminDb
            .collection("institutes")
            .doc(instituteId)
            .collection("student_invites")
            .doc(uid);
        const batch = adminDb.batch();
        batch.set(newRosterRef, {
            studentId: uid,
            email,
            name: userData.displayName || null,
            status: "active",
            invitedAt: inviteDoc.data()?.invitedAt || now,
            invitedBy: inviteDoc.data()?.invitedBy || null,
            joinedAt: now,
        });
        if (inviteDoc.id !== uid) {
            batch.delete(inviteDoc.ref);
        }
        // Skip the user-doc write if the old pending doc id matched — the
        // pending row was never actually keyed by the user uid.
        batch.set(
            adminDb.collection("users").doc(uid),
            {
                instituteId,
                updatedAt: now,
            },
            { merge: true }
        );
        await batch.commit();

        return NextResponse.json({
            attached: true,
            instituteId,
            // For analytics / debugging — was the email pre-registered as
            // `pending:{email}` or did we find a stale active row?
            wasPending: inviteDoc.id === pendingId,
        });
    } catch (error) {
        const e = error as Error;
        console.error("[auth/auto-attach-institute] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to attach to institute" },
            { status: 500 }
        );
    }
}
