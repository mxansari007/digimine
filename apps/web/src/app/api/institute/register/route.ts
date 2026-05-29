import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    allocateUniqueInstituteInviteCode,
    findInstituteForAdmin,
    serializeInstitute,
} from "@/lib/server/institutes";
import {
    INSTITUTE_SIGNUP_CAP_24H,
    INSTITUTE_SIGNUP_CAP_7D,
    countRecentInstituteSignups,
    getRequestIp,
    getRequestUserAgent,
    getUserPhoneNumber,
    hashIp,
    isDisposableEmail,
    isInstituteOwnerPhoneTaken,
    isSuspiciousName,
    logInstituteSignupAttempt,
    normalisePhone,
} from "@/lib/server/abuse";

export const dynamic = "force-dynamic";

/**
 * Create a new institute. The caller becomes the founding owner-admin.
 * One user can own at most one institute — re-registration returns the
 * existing one rather than creating a duplicate.
 *
 * Abuse-prevention layers (see lib/server/abuse.ts for rationale):
 *   1. Phone verification — caller must have a verified phone on their
 *      user doc before they can create an institute.
 *   2. Phone deduplication — the verified phone can't already own a
 *      different institute.
 *   3. Disposable email blocklist — common throwaway domains rejected
 *      as the contact email.
 *   4. Velocity caps — per-IP, 3 / 24h and 5 / 7d.
 *   5. Suspicious-name flagger — logged but not blocked.
 *   6. Append-only audit log of every attempt.
 */
export async function POST(req: Request) {
    const ip = getRequestIp(req);
    const ipHash = hashIp(ip);
    const userAgent = getRequestUserAgent(req);

    let userId: string | null = null;
    try {
        userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            await logInstituteSignupAttempt({
                userId: null,
                outcome: "error",
                reason: "unauthenticated",
                ipHash,
                userAgent,
            });
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        // 1. Already owns an institute — return it. No new creation, so we
        //    don't burn a velocity budget either.
        const existing = await findInstituteForAdmin(userId);
        if (existing) {
            await logInstituteSignupAttempt({
                userId,
                outcome: "duplicate",
                instituteId: existing.id,
                reason: "user already admins an institute",
                ipHash,
                userAgent,
            });
            return NextResponse.json({
                institute: serializeInstitute({ id: existing.id, ...existing }),
                created: false,
            });
        }

        const body = await req.json().catch(() => ({}));
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) {
            return NextResponse.json({ error: "Institute name is required" }, { status: 400 });
        }
        if (name.length > 120) {
            return NextResponse.json({ error: "Name too long" }, { status: 400 });
        }

        const slug = (typeof body.slug === "string" && body.slug.trim()) || slugify(name);
        const description = typeof body.description === "string" ? body.description.trim() : "";
        const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim() : "";
        const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone.trim() : "";
        const website = typeof body.website === "string" ? body.website.trim() : "";

        // 2. Phone gate — every institute owner must be OTP-verified.
        const ownerPhone = normalisePhone(await getUserPhoneNumber(userId));
        if (!ownerPhone) {
            await logInstituteSignupAttempt({
                userId,
                outcome: "rejected_phone_missing",
                reason: "users/{uid}.phoneNumber missing",
                name,
                contactEmail,
                ipHash,
                userAgent,
            });
            return NextResponse.json(
                { error: "Verify your phone first to register an institute.", code: "phone_required" },
                { status: 412 }
            );
        }

        // 3. Phone uniqueness across institutes.
        if (await isInstituteOwnerPhoneTaken(ownerPhone, userId)) {
            await logInstituteSignupAttempt({
                userId,
                outcome: "rejected_phone_reused",
                reason: "ownerPhone already owns another institute",
                name,
                contactEmail,
                ipHash,
                userAgent,
            });
            return NextResponse.json(
                {
                    error: "This phone number is already registered with another institute.",
                    code: "phone_in_use",
                },
                { status: 409 }
            );
        }

        // 4. Disposable email blocklist on the contact email.
        if (contactEmail && isDisposableEmail(contactEmail)) {
            await logInstituteSignupAttempt({
                userId,
                outcome: "rejected_disposable_email",
                reason: `disposable contact email: ${contactEmail}`,
                name,
                contactEmail,
                ipHash,
                userAgent,
            });
            return NextResponse.json(
                {
                    error: "Please use a long-term business email — disposable inboxes are not accepted.",
                    code: "disposable_email",
                },
                { status: 400 }
            );
        }

        // 5. Velocity check.
        const recent = await countRecentInstituteSignups(ipHash);
        if (recent.last24h >= INSTITUTE_SIGNUP_CAP_24H || recent.last7d >= INSTITUTE_SIGNUP_CAP_7D) {
            await logInstituteSignupAttempt({
                userId,
                outcome: "rejected_velocity",
                reason: `velocity exceeded: 24h=${recent.last24h}, 7d=${recent.last7d}`,
                name,
                contactEmail,
                ipHash,
                userAgent,
            });
            return NextResponse.json(
                {
                    error: "Too many signup attempts from this network. Try again later or contact support.",
                    code: "rate_limited",
                },
                { status: 429 }
            );
        }

        // 6. Suspicious-name flag — not a block, just a flag for review.
        const flagged = isSuspiciousName(name);

        // ── Create the institute ──────────────────────────────────────
        const inviteCode = await allocateUniqueInstituteInviteCode();
        const ref = adminDb.collection("institutes").doc();
        const now = Timestamp.now();

        const data = {
            name,
            slug,
            description: description || null,
            ownerId: userId,
            ownerPhone,
            contactEmail: contactEmail || null,
            contactPhone: contactPhone || null,
            website: website || null,
            address: null,
            inviteCode,
            branding: { logoUrl: null, primaryColor: null, tagline: null },
            subscription: {
                planId: "trial",
                status: "trial",
                startedAt: now,
                expiresAt: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000),
                gracePeriodEndsAt: null,
                seats: 5,
                autoRenew: false,
            },
            stats: {
                teacherCount: 0,
                activeTeacherCount: 0,
                classCount: 0,
                studentCount: 0,
            },
            // Trust + abuse signals tracked on the institute doc itself so
            // super_admin tooling can filter on them without a join.
            trust: {
                ownerPhoneVerified: true,
                flagged,
                ipHashAtSignup: ipHash,
                createdAtIp: ipHash,
            },
            isArchived: false,
            createdAt: now,
            updatedAt: now,
        };

        // All three writes — institute doc, founding admin row, and the user's
        // role promotion — go in ONE atomic batch. Previously these were three
        // separate awaited writes: if the 2nd or 3rd failed, an orphaned
        // institute was left behind with no admin row / unpromoted user, and a
        // retry couldn't find the admin row (so it created a DUPLICATE) yet the
        // route guards could never resolve the institute → permanent dead-end.
        // A batch is all-or-nothing, so a failure leaves zero state and the
        // user can simply retry cleanly.
        const userSnap = await adminDb.collection("users").doc(userId).get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};

        const batch = adminDb.batch();
        batch.set(ref, data);
        batch.set(ref.collection("admins").doc(userId), {
            userId,
            email: userData.email || "",
            name: userData.displayName || userData.name || "",
            role: "owner",
            addedAt: now,
            addedBy: userId,
        });
        batch.set(
            adminDb.collection("users").doc(userId),
            {
                role: "institute_admin",
                instituteId: ref.id,
                onboardingStep: "complete",
                updatedAt: now,
            },
            { merge: true }
        );
        await batch.commit();

        await logInstituteSignupAttempt({
            userId,
            outcome: "created",
            instituteId: ref.id,
            name,
            contactEmail,
            ipHash,
            userAgent,
            flagged,
        });

        return NextResponse.json({
            institute: serializeInstitute({ id: ref.id, ...data }),
            created: true,
        });
    } catch (error: any) {
        console.error("Institute register failed:", error);
        await logInstituteSignupAttempt({
            userId,
            outcome: "error",
            reason: error?.message || "unknown",
            ipHash,
            userAgent,
        });
        return NextResponse.json(
            { error: error?.message || "Failed to create institute" },
            { status: 500 }
        );
    }
}

function slugify(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60);
}
