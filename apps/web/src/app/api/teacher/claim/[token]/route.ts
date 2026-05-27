/**
 * Teacher claim flow — the token-based onramp for new teacher accounts
 * created by an institute admin via the bulk-invite UI.
 *
 *   GET  /api/teacher/claim/[token]
 *     Public read. Verifies the token + returns the invite's email +
 *     institute name so the claim page can pre-fill the form.
 *     200 { valid: true, email, instituteId, instituteName }
 *     404 { valid: false, reason: "not_found" | "expired" | "already_claimed" }
 *
 *   POST /api/teacher/claim/[token]
 *     Public write. Body: { firstName, lastName, password }
 *     - Verifies the token (same checks as GET)
 *     - Confirms no Firebase Auth user exists with the invite's email (the
 *       invite goes stale if the teacher signed up via the public form in
 *       the meantime — we refuse to overwrite their account).
 *     - Creates the Firebase Auth user with the chosen password
 *     - Writes users/{uid} (role=teacher) + teachers/{uid} (with stamped
 *       instituteId)
 *     - Flips the invite row to status=active, rebound to the real uid,
 *       invalidates the claim token
 *     - Bumps the institute's activeTeacherCount
 *     200 { ok: true, email } — the client signs the teacher in with the
 *     email + their just-chosen password and redirects to dashboard.
 *
 * Why no Bearer auth on these routes: the token itself IS the proof of
 * identity. It's a one-shot 30-day UUID that an institute admin created;
 * controlling the token is equivalent to controlling the email inbox.
 */
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { bumpInstituteCounts, getInstituteById } from "@/lib/server/institutes";

export const dynamic = "force-dynamic";

type InviteResolution =
    | {
          ok: true;
          inviteRef: FirebaseFirestore.DocumentReference;
          data: FirebaseFirestore.DocumentData;
          instituteId: string;
      }
    | { ok: false; status: number; reason: string; message: string };

async function resolveInvite(token: string): Promise<InviteResolution> {
    if (!token || typeof token !== "string" || token.length < 16) {
        return { ok: false, status: 400, reason: "invalid_token", message: "Invalid claim link." };
    }
    // The invite lives at institutes/{id}/teachers/{docId} with a
    // `claimToken` field. CollectionGroup query finds it without knowing
    // the parent institute id up front.
    const snap = await adminDb
        .collectionGroup("teachers")
        .where("claimToken", "==", token)
        .limit(1)
        .get();
    if (snap.empty) {
        return {
            ok: false,
            status: 404,
            reason: "not_found",
            message: "This claim link is invalid or has already been used.",
        };
    }
    const doc = snap.docs[0];
    const data = doc.data() || {};
    if (data.status !== "invited") {
        return {
            ok: false,
            status: 410,
            reason: "already_claimed",
            message: "This invite has already been claimed. Please sign in instead.",
        };
    }
    const expiresAt = data.claimTokenExpiresAt;
    const expiresMs =
        expiresAt && typeof expiresAt.toMillis === "function" ? expiresAt.toMillis() : 0;
    if (expiresMs > 0 && expiresMs <= Date.now()) {
        return {
            ok: false,
            status: 410,
            reason: "expired",
            message: "This claim link has expired. Ask your institute admin to send a fresh one.",
        };
    }
    // Path: institutes/{instituteId}/teachers/{docId}
    const pathParts = doc.ref.path.split("/");
    const instituteId = pathParts[1];
    return { ok: true, inviteRef: doc.ref, data, instituteId };
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
    try {
        const resolved = await resolveInvite(params.token);
        if (!resolved.ok) {
            return NextResponse.json(
                { valid: false, reason: resolved.reason, message: resolved.message },
                { status: resolved.status }
            );
        }
        const institute = await getInstituteById(resolved.instituteId);
        return NextResponse.json({
            valid: true,
            email: resolved.data.email,
            instituteId: resolved.instituteId,
            instituteName: institute?.name || "Your institute",
        });
    } catch (error) {
        const e = error as Error;
        console.error("[teacher/claim GET] failed:", e);
        return NextResponse.json(
            { valid: false, reason: "internal_error", message: e.message },
            { status: 500 }
        );
    }
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
    try {
        const resolved = await resolveInvite(params.token);
        if (!resolved.ok) {
            return NextResponse.json(
                { ok: false, reason: resolved.reason, error: resolved.message },
                { status: resolved.status }
            );
        }

        const body = (await req.json().catch(() => ({}))) as {
            firstName?: string;
            lastName?: string;
            password?: string;
        };
        const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
        const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";

        if (!firstName) {
            return NextResponse.json({ error: "First name is required." }, { status: 400 });
        }
        if (!password || password.length < 8) {
            return NextResponse.json(
                { error: "Password must be at least 8 characters." },
                { status: 400 }
            );
        }

        const email = String(resolved.data.email || "").toLowerCase();
        if (!email) {
            return NextResponse.json(
                { error: "Invite is missing an email — contact your admin." },
                { status: 422 }
            );
        }

        // Refuse to clobber an existing Firebase Auth account. If the teacher
        // signed up via the public form in the time between admin sending
        // the invite and them clicking the link, they should use the
        // existing-teacher join flow (/teacher → /institute join via invite
        // code) instead.
        try {
            const existing = await adminAuth.getUserByEmail(email);
            if (existing) {
                return NextResponse.json(
                    {
                        error:
                            "An account with this email already exists. Sign in with your existing password — your admin can re-link you.",
                        code: "account_exists",
                    },
                    { status: 409 }
                );
            }
        } catch {
            /* user not found — expected; continue */
        }

        const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
        const userRecord = await adminAuth.createUser({
            email,
            password,
            emailVerified: true, // The claim token IS the email verification.
            displayName: displayName || email,
        });
        const uid = userRecord.uid;
        const now = Timestamp.now();

        // Write the user doc (role=teacher) and a fresh teacher doc keyed
        // off the new uid. Teacher doc includes the stamped instituteId so
        // Firestore rules and dashboard queries treat them as part of the
        // institute immediately.
        const trialEndMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
        const batch = adminDb.batch();
        batch.set(adminDb.collection("users").doc(uid), {
            email,
            displayName: displayName || email,
            firstName,
            lastName,
            role: "teacher",
            createdAt: now,
            updatedAt: now,
        });
        batch.set(adminDb.collection("teachers").doc(uid), {
            userId: uid,
            instituteId: resolved.instituteId,
            profile: {
                name: displayName || email,
                institute: "",
                phone: "",
                bio: "",
                avatarUrl: null,
                subjects: [],
            },
            inviteCode: `TEACH_${uid.slice(0, 6).toUpperCase()}`,
            subscription: {
                planId: "institute_seat",
                status: "active",
                startedAt: now,
                expiresAt: Timestamp.fromMillis(trialEndMs),
                gracePeriodEndsAt: null,
                autoRenew: false,
                planPrice: 0,
            },
            stats: {
                totalStudents: 0,
                totalQuizzes: 0,
                totalTests: 0,
                totalContests: 0,
                totalCourses: 0,
            },
            isVerified: true,
            createdAt: now,
            updatedAt: now,
        });

        // Rebind the invite row from the synthetic `invite:{email}` docId
        // to the real uid + flip to active. We write the new row first then
        // delete the old one so the institute admin never sees a gap.
        const newRosterRef = adminDb
            .collection("institutes")
            .doc(resolved.instituteId)
            .collection("teachers")
            .doc(uid);
        batch.set(newRosterRef, {
            teacherId: uid,
            email,
            name: displayName || email,
            status: "active",
            invitedAt: resolved.data.invitedAt || now,
            invitedBy: resolved.data.invitedBy || null,
            joinedAt: now,
            removedAt: null,
            claimToken: null,
            claimTokenExpiresAt: null,
        });
        // If the invite row was the synthetic one, delete it.
        if (resolved.inviteRef.id !== uid) {
            batch.delete(resolved.inviteRef);
        }
        await batch.commit();

        // Activate-teacher bump (the row count was already incremented at
        // invite time — only flip the active counter now).
        await bumpInstituteCounts(resolved.instituteId, { activeTeacherCount: 1 });

        return NextResponse.json({
            ok: true,
            email,
            uid,
            instituteId: resolved.instituteId,
        });
    } catch (error) {
        const e = error as Error;
        console.error("[teacher/claim POST] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to claim invite." },
            { status: 500 }
        );
    }
}
