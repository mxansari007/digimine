/**
 * POST /api/auth/role-select
 *
 * Promotes an orphan (role === null) user to a self-service `customer` role.
 *
 *  - Firestore rules forbid users from editing their own `role` field
 *    (see `firestore.rules` — `affectedKeys().hasAny(['role'])` is denied
 *    for non-bootstrap-admin updates). That's intentional: it prevents users
 *    from self-promoting to teacher / institute_admin / admin via the client
 *    SDK. But it also blocks the legitimate "I'm a student" path from
 *    `/role-select`, which is why this server route exists.
 *
 *  - Teacher and institute onboarding already bypass the rule via their own
 *    server endpoints (`/api/teacher/onboard`, `/api/institute/register`).
 *    This route is the matching gate for the student path.
 *
 *  - We only ever set role=customer here. Any other requested role is
 *    rejected. We also assert the current role is null so this endpoint
 *    cannot be replayed to clobber an existing role.
 *
 * Auth: Firebase ID token via `Authorization: Bearer <token>`.
 */
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const uid = await getBearerUserId(req).catch(() => null);
        if (!uid) {
            return NextResponse.json(
                { error: "Sign in to continue." },
                { status: 401 }
            );
        }

        const body = await req.json().catch(() => ({} as { role?: string }));
        const requested = (body as { role?: string }).role;

        // We only allow the student → customer self-assignment here. Teacher
        // and institute roles MUST go through their own onboarding routes so
        // the role-specific subdocuments are created atomically.
        if (requested !== "student") {
            return NextResponse.json(
                { error: "This endpoint only assigns the student role. Use the relevant onboarding flow for teacher or institute." },
                { status: 400 }
            );
        }

        const userRef = adminDb.collection("users").doc(uid);
        const snap = await userRef.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "User profile not found." },
                { status: 404 }
            );
        }

        const currentRole = (snap.data() || {}).role ?? null;
        if (currentRole && currentRole !== null) {
            // Idempotency: a duplicate POST after success should not error,
            // but it also should NOT silently overwrite a non-customer role.
            if (currentRole === "customer") {
                return NextResponse.json({ success: true, role: "customer" });
            }
            return NextResponse.json(
                { error: `Role already set to "${currentRole}". Cannot reassign.` },
                { status: 409 }
            );
        }

        await userRef.update({
            role: "customer",
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json({ success: true, role: "customer" });
    } catch (error) {
        console.error("[role-select] failed:", error);
        const message = error instanceof Error ? error.message : "Could not set role.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
