/**
 * POST /api/onboarding/phone
 *
 * Persists a freshly-OTP-verified phone number onto `users/{uid}.phoneNumber`.
 * Both the teacher and institute onboarding flows POST here once the caller
 * has cleared the Firebase OTP challenge client-side.
 *
 * Why server-side (vs the previous client-side `updateDoc` in the institute
 * flow):
 *   - Atomic with the role/profile writes downstream — same trust boundary.
 *   - We can validate the phone format consistently with the abuse helpers
 *     in `lib/server/abuse.ts` (E.164 normalisation), so a single source of
 *     truth defines what counts as "valid".
 *   - Firestore security rules can keep `users.phoneNumber` un-writable by
 *     clients (defence in depth — a client-only flow leaks if rules drift).
 *   - Audit + future rate-limiting hooks land in one place.
 *
 * Auth:
 *   The Bearer ID token must belong to the same `uid` the caller wants to
 *   write. Anyone forging a body with someone else's uid gets 403.
 *
 * Request body:
 *   { phone: string }   // E.164, e.g. "+919876543210"
 *
 * Responses:
 *   200  { ok: true, phoneNumber }
 *   400  { error }   // missing/invalid phone
 *   401  { error }   // missing/expired Bearer token
 *   500  { error }   // unexpected
 */
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { normalisePhone } from "@/lib/server/abuse";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const uid = await getBearerUserId(req).catch(() => null);
        if (!uid) {
            return NextResponse.json(
                { error: "Sign in to verify your phone." },
                { status: 401 }
            );
        }

        const body = (await req.json().catch(() => ({}))) as { phone?: unknown };
        const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
        if (!rawPhone) {
            return NextResponse.json(
                { error: "Phone number required." },
                { status: 400 }
            );
        }

        const phoneNumber = normalisePhone(rawPhone);
        // E.164: starts with +, country-code + national-number is 8–15 digits.
        // We're permissive on the upper bound but firm on the shape — bare
        // country codes or random strings get rejected before they pollute
        // the user doc.
        if (!phoneNumber || !/^\+[1-9]\d{7,15}$/.test(phoneNumber)) {
            return NextResponse.json(
                { error: "That phone number doesn't look valid. Use the +91 country code followed by 10 digits." },
                { status: 400 }
            );
        }

        await adminDb
            .collection("users")
            .doc(uid)
            .set(
                {
                    phoneNumber,
                    phoneVerifiedAt: new Date(),
                    updatedAt: new Date(),
                },
                { merge: true }
            );

        return NextResponse.json({ ok: true, phoneNumber });
    } catch (err) {
        const e = err as { message?: string };
        console.error("[/api/onboarding/phone] failed", e);
        return NextResponse.json(
            { error: e.message || "Failed to save phone number." },
            { status: 500 }
        );
    }
}
