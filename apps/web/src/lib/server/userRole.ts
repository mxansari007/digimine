/**
 * Server-side helpers for reasoning about the caller's role.
 *
 * Used by attempt-creation endpoints to decide whether a freshly-created
 * test / quiz / contest attempt should be flagged as a "preview" attempt.
 *
 * Preview attempts:
 *   - Are still stored under the user's id so they can review their results.
 *   - Carry an `isPreview: true` flag and `attemptedAs` annotation.
 *   - Are excluded from public leaderboards and teacher class analytics so
 *     a teacher who attempts their own content (or someone else's) doesn't
 *     pollute student-facing aggregates.
 */
import type { UserRole } from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";

export async function getUserRole(userId: string): Promise<UserRole | null> {
    if (!userId) return null;
    const snap = await adminDb.collection("users").doc(userId).get();
    if (!snap.exists) return null;
    const role = snap.data()?.role;
    return (role as UserRole | undefined) ?? null;
}

/**
 * True for any signed-in user who is not a regular customer — teachers,
 * institute admins, and platform admins. These users are attempting
 * public content in "preview" mode.
 */
export function isPreviewRole(role: UserRole | null | undefined): boolean {
    if (!role) return false;
    return role !== "customer";
}

/**
 * Resolve the preview-attempt overlay for a given user.
 *
 * Returns `null` for regular customers (no overlay needed) and an object
 * with the flags to merge into the attempt doc for everyone else.
 */
export async function previewAttemptOverlay(userId: string): Promise<{
    isPreview: true;
    attemptedAs: UserRole;
} | null> {
    const role = await getUserRole(userId);
    if (!isPreviewRole(role)) return null;
    return { isPreview: true, attemptedAs: role as UserRole };
}
