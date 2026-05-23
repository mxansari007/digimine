/**
 * Server-side role gate for attempt-style endpoints (practice submit, test
 * start, quiz start, contest enrollment).
 *
 * Client pages already run `useAttemptGate` which redirects signed-in but
 * role-less users to `/role-select?next=…` before they ever fire these
 * requests. This server check is defense-in-depth — it catches:
 *
 *   - Stale tabs opened before the client gate was deployed.
 *   - Hand-rolled cURL / fetch hits that bypass the UI entirely.
 *   - Race windows where the client navigated mid-flight.
 *
 * Returns the user's committed role (a non-null string) on success, or a
 * NextResponse 403 the caller should return immediately. Keeping the
 * response shape consistent (`code: "role_required"`, `redirectTo`) lets
 * client code show one CTA: "Finish setting up your account → /role-select".
 */
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export type RoleGateResult = { ok: true; role: string } | { ok: false; response: NextResponse };

export async function requireAssignedRole(userId: string): Promise<RoleGateResult> {
    try {
        const snap = await adminDb.collection("users").doc(userId).get();
        const role = (snap.data() || {}).role ?? null;
        if (!role) {
            return {
                ok: false,
                response: NextResponse.json(
                    {
                        error: "Finish setting up your account before continuing.",
                        code: "role_required",
                        redirectTo: "/role-select",
                    },
                    { status: 403 }
                ),
            };
        }
        return { ok: true, role: String(role) };
    } catch (err) {
        // Don't leak DB errors — treat as "could not verify" and refuse.
        console.error("[roleGate] lookup failed for", userId, err);
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Could not verify your account. Please try again." },
                { status: 500 }
            ),
        };
    }
}
