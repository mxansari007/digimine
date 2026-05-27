/**
 * POST /api/institute/[instituteId]/students/bulk
 *
 * Pre-register student emails to an institute. Mirrors the teacher bulk
 * invite shape but with simpler semantics — students don't get a claim
 * link, they just sign up normally and the email match auto-attaches
 * them to the institute (see `attachStudentInvitesForUser` server helper).
 *
 * Per-email outcome:
 *   - User exists with role="customer" / no role → "attached" (stamp
 *     users/{uid}.instituteId, write student_invites row status=active)
 *   - User exists with a non-student role (teacher / institute_admin /
 *     admin) → "skipped" reason=wrong_role
 *   - User exists + already linked to a different institute → "skipped"
 *     reason=already_other_institute
 *   - Email already on this institute's student_invites → "skipped"
 *     reason=already_on_roster
 *   - No matching user → "invited" (pending row; auto-attaches when the
 *     student signs up with that email)
 *
 * Response: { summary: {attached, invited, skipped, invalid}, results: [...] }
 *
 * Access: caller must be admin of the institute.
 */
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";

export const dynamic = "force-dynamic";

type Outcome = "attached" | "invited" | "skipped";

interface BulkStudentResultRow {
    email: string;
    outcome: Outcome;
    studentId?: string;
    reason?:
        | "wrong_role"
        | "already_other_institute"
        | "already_on_roster"
        | "invalid_email";
    message?: string;
}

function normaliseEmail(raw: unknown): string {
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : "";
}

function dedupe(list: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of list) {
        if (e && !seen.has(e)) {
            seen.add(e);
            out.push(e);
        }
    }
    return out;
}

const STUDENT_ROLES_ALLOWED = new Set<string | null | undefined>([
    "customer",
    null,
    undefined,
]);

export async function POST(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => ({}));
        const rawEmails = Array.isArray(body.emails) ? body.emails : [];
        if (rawEmails.length === 0) {
            return NextResponse.json({ error: "Provide at least one email." }, { status: 400 });
        }
        if (rawEmails.length > 500) {
            return NextResponse.json(
                { error: "Cap of 500 emails per batch. Split larger lists." },
                { status: 400 }
            );
        }

        const emails = dedupe(rawEmails.map(normaliseEmail).filter(Boolean));
        const invalidCount = rawEmails.length - emails.length;
        const results: BulkStudentResultRow[] = [];

        for (const raw of rawEmails) {
            const e = normaliseEmail(raw);
            if (!e) {
                results.push({
                    email: String(raw || "").slice(0, 80),
                    outcome: "skipped",
                    reason: "invalid_email",
                    message: "Not a valid email address",
                });
            }
        }

        // Snapshot the existing institute student_invites once.
        const invitesRef = adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("student_invites");
        const invitesSnap = await invitesRef.get();
        const existingByEmail = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        invitesSnap.docs.forEach((d) => {
            const data = d.data() || {};
            if (data.email) existingByEmail.set(String(data.email).toLowerCase(), d);
        });

        let attachedCount = 0;
        let invitedCount = 0;
        const now = Timestamp.now();

        for (const email of emails) {
            // Already invited?
            if (existingByEmail.has(email)) {
                results.push({
                    email,
                    outcome: "skipped",
                    reason: "already_on_roster",
                    message: "Already invited or already a student of this institute",
                });
                continue;
            }

            // Find existing user.
            const userSnap = await adminDb
                .collection("users")
                .where("email", "==", email)
                .limit(1)
                .get();
            const userId = userSnap.empty ? null : userSnap.docs[0].id;
            const userData = userSnap.empty ? null : userSnap.docs[0].data() || {};
            const existingRole = userData?.role ?? null;

            // Role conflict — user is a teacher / institute_admin / admin.
            if (userId && !STUDENT_ROLES_ALLOWED.has(existingRole)) {
                results.push({
                    email,
                    outcome: "skipped",
                    reason: "wrong_role",
                    message: `An account exists with this email but isn't a student (role=${existingRole}).`,
                });
                continue;
            }

            // Already linked to a different institute?
            if (
                userId &&
                userData?.instituteId &&
                userData.instituteId !== params.instituteId
            ) {
                results.push({
                    email,
                    outcome: "skipped",
                    reason: "already_other_institute",
                    message: "Student is already affiliated with another institute.",
                });
                continue;
            }

            if (userId) {
                // ── Attach existing student account ──
                await invitesRef.doc(userId).set({
                    studentId: userId,
                    email,
                    name: userData?.displayName || null,
                    status: "active",
                    invitedAt: now,
                    invitedBy: auth.userId,
                    joinedAt: now,
                });
                // Denormalise on the user doc so client-side lookups see it.
                await adminDb
                    .collection("users")
                    .doc(userId)
                    .set(
                        { instituteId: params.instituteId, updatedAt: now },
                        { merge: true }
                    );
                results.push({
                    email,
                    outcome: "attached",
                    studentId: userId,
                    message: "Linked existing student account to your institute",
                });
                attachedCount += 1;
                continue;
            }

            // ── Pending invite — auto-attaches when this email signs up ──
            // Doc id is `pending:{email}` so the auto-attach hook can find
            // it by either uid (after attach) or email (before).
            await invitesRef.doc(`pending:${email}`).set({
                studentId: `pending:${email}`,
                email,
                name: null,
                status: "invited",
                invitedAt: now,
                invitedBy: auth.userId,
                joinedAt: null,
            });
            results.push({
                email,
                outcome: "invited",
                message:
                    "Pending — auto-attaches when the student signs up with this email",
            });
            invitedCount += 1;
        }

        const summary = {
            attached: attachedCount,
            invited: invitedCount,
            skipped: results.filter((r) => r.outcome === "skipped").length,
            invalid: invalidCount,
        };

        return NextResponse.json({ summary, results });
    } catch (error) {
        const e = error as Error;
        console.error("[bulk student invite] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to invite students" },
            { status: 500 }
        );
    }
}
