/**
 * Per-user entitlement overrides — admin-authored grants that layer on TOP
 * of whatever a user's subscription plan resolves to. This lets an admin
 * give (or revoke) any individual capability for a specific user, bypassing
 * the plan entirely.
 *
 * Stored at `userEntitlementOverrides/{uid}`. Read on every entitlement
 * resolution (student + teaching) and merged so only the keys the admin set
 * win; everything else inherits the plan.
 */
import { adminDb } from "@/lib/firebase/admin";
import { isOverrideActive, type UserEntitlementOverride } from "@digimine/types";

const COLLECTION = "userEntitlementOverrides";

export async function getUserEntitlementOverride(
    userId: string
): Promise<UserEntitlementOverride | null> {
    if (!userId) return null;
    try {
        const snap = await adminDb.collection(COLLECTION).doc(userId).get();
        if (!snap.exists) return null;
        const d = snap.data() || {};
        const override: UserEntitlementOverride = {
            userId,
            features:
                d.features && typeof d.features === "object" ? d.features : undefined,
            quotas: d.quotas && typeof d.quotas === "object" ? d.quotas : undefined,
            teachingFeatures:
                d.teachingFeatures && typeof d.teachingFeatures === "object"
                    ? d.teachingFeatures
                    : undefined,
            teachingLimits:
                d.teachingLimits && typeof d.teachingLimits === "object"
                    ? d.teachingLimits
                    : undefined,
            aiQuestionsPerDay:
                typeof d.aiQuestionsPerDay === "number" || d.aiQuestionsPerDay === null
                    ? d.aiQuestionsPerDay
                    : undefined,
            note: typeof d.note === "string" ? d.note : undefined,
            expiresAt: d.expiresAt?.toDate ? d.expiresAt.toDate() : d.expiresAt ?? null,
            grantedBy: typeof d.grantedBy === "string" ? d.grantedBy : undefined,
            updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : undefined,
        };
        // Expired overrides are inert.
        if (!isOverrideActive(override)) return null;
        return override;
    } catch (e) {
        // Fail-open: an override-read hiccup must never break entitlement
        // resolution for the whole user.
        console.warn("[userOverrides] read failed:", (e as Error)?.message);
        return null;
    }
}
