/**
 * Resolves teaching-side feature entitlements for a given user.
 *
 * Different role from the student entitlements layer
 * (`lib/server/entitlements.ts`): that one resolves
 * EntitlementFeature (practice_premium, mock_tests, etc.) for
 * end-user students. THIS module resolves TeachingFeature
 * (question_bank_template_download, markdown_import,
 * ai_question_generation) for teachers and institute admins.
 *
 * Resolution path:
 *   1. Look up the user's role.
 *   2. For role=teacher, read teachers/{uid}.subscription.planCode
 *      (also accepts subscription.planId for legacy).
 *   3. For role=institute_admin, find the institute they admin
 *      and read institutes/{id}.subscription.planCode / .planId.
 *   4. Look up subscriptionPlans where code == planCode AND
 *      roleScope == <user's role scope>. If found and active,
 *      return the plan's teachingFeatures map.
 *   5. Otherwise return {} (all locked).
 *
 * This means: ANY teaching-side gate is locked until (a) the
 * admin creates a plan in /admin/subscription with the right
 * code + ticks the feature, AND (b) the user has that plan
 * recorded on their account. This is intentional — it makes the
 * gate operationally explicit rather than fail-open.
 */
import { adminDb } from "@/lib/firebase/admin";
import {
    UNLIMITED_TEACHING_LIMITS,
    type TeachingFeature,
    type TeachingFeatureMap,
    type TeachingLimits,
} from "@digimine/types";

/**
 * Read a TeachingLimits map off a raw plan doc. Missing or non-numeric
 * fields fall back to -1 (unlimited) — that's intentional so legacy
 * plans without the field don't suddenly start blocking writes. Admins
 * opt INTO caps by setting positive numbers.
 */
function readTeachingLimits(raw: any): TeachingLimits {
    if (!raw || typeof raw !== "object") return { ...UNLIMITED_TEACHING_LIMITS };
    const num = (k: keyof TeachingLimits): number =>
        typeof raw[k] === "number" && Number.isFinite(raw[k]) ? raw[k] : -1;
    return {
        maxClasses: num("maxClasses"),
        maxStudents: num("maxStudents"),
        maxTests: num("maxTests"),
        maxQuizzes: num("maxQuizzes"),
        maxContests: num("maxContests"),
        maxCourses: num("maxCourses"),
        maxQuestions: num("maxQuestions"),
        pistonConcurrency: num("pistonConcurrency"),
    };
}

export type TeachingPlanScope = "teacher" | "institute";

interface ResolvedTeachingPlan {
    /** The user's role scope for matching plans. */
    scope: TeachingPlanScope;
    /** Stable code on the user's subscription doc (or null if none). */
    planCode: string | null;
    /** The matched plan, if any. */
    planId: string | null;
    planName: string | null;
    teachingFeatures: TeachingFeatureMap;
    /** Numeric usage caps. -1 means unlimited. */
    teachingLimits: TeachingLimits;
    /**
     * Daily AI-question cap copied from the matched plan.
     * `null` = no cap; `0` = effectively disabled.
     */
    aiQuestionsPerDay: number | null;
}

export type TeachingEntitlements =
    | { ok: true; resolved: ResolvedTeachingPlan }
    | { ok: false; reason: "not_teaching_role" };

function readPlanCodeFromSubscription(sub: any): string | null {
    if (!sub || typeof sub !== "object") return null;
    if (typeof sub.planCode === "string" && sub.planCode) return sub.planCode;
    if (typeof sub.planId === "string" && sub.planId) return sub.planId;
    return null;
}

async function resolveScopeForUser(
    userId: string
): Promise<{ scope: TeachingPlanScope; planCode: string | null } | null> {
    const userSnap = await adminDb.collection("users").doc(userId).get();
    if (!userSnap.exists) return null;
    const role = userSnap.data()?.role;

    if (role === "teacher") {
        const tSnap = await adminDb.collection("teachers").doc(userId).get();
        const tData = tSnap.data();
        const ownPlanCode = readPlanCodeFromSubscription(tData?.subscription);

        // Institute affiliation: a teacher attached to an institute (via the
        // bulk-invite / claim flow) gets their entitlements through the
        // INSTITUTE'S plan when they don't have their own paid plan. This
        // matches how seats work — the institute pays once and every active
        // teacher seat shares the institute's teachingFeatures + AI quota.
        // Their own subscription still wins if set (e.g. a freelance teacher
        // who later joined an institute keeps their personal Pro plan).
        if (!ownPlanCode && tData?.instituteId) {
            const iSnap = await adminDb.collection("institutes").doc(tData.instituteId).get();
            const institutePlanCode = readPlanCodeFromSubscription(iSnap.data()?.subscription);
            if (institutePlanCode) {
                // Match against teacher-scoped plans (the teacher's UI is
                // teacher-shaped); but the planCode itself resolves an
                // institute-scoped plan. Adjust scope to "institute" so the
                // plan-lookup below finds the right roleScope row.
                return { scope: "institute", planCode: institutePlanCode };
            }
        }
        return { scope: "teacher", planCode: ownPlanCode };
    }

    if (role === "institute_admin") {
        // Find the institute this user administrates. Mirrors
        // institutes.ts:findInstituteForAdmin's collectionGroup query.
        const adminSnap = await adminDb
            .collectionGroup("admins")
            .where("userId", "==", userId)
            .limit(1)
            .get();
        if (adminSnap.empty) return { scope: "institute", planCode: null };
        const path = adminSnap.docs[0].ref.path.split("/");
        const instituteId = path[1];
        const iSnap = await adminDb.collection("institutes").doc(instituteId).get();
        const planCode = readPlanCodeFromSubscription(iSnap.data()?.subscription);
        return { scope: "institute", planCode };
    }

    return null;
}

export async function getTeachingEntitlements(
    userId: string
): Promise<TeachingEntitlements> {
    const scoped = await resolveScopeForUser(userId);
    if (!scoped) return { ok: false, reason: "not_teaching_role" };

    if (!scoped.planCode) {
        return {
            ok: true,
            resolved: {
                scope: scoped.scope,
                planCode: null,
                planId: null,
                planName: null,
                teachingFeatures: {},
                teachingLimits: { ...UNLIMITED_TEACHING_LIMITS },
                aiQuestionsPerDay: 0,
            },
        };
    }

    // Match subscriptionPlans by code + roleScope. Existing plans
    // may not have a roleScope field; the deserializer defaults
    // those to "student", which means a teacher-coded plan without
    // an explicit roleScope won't match here — that's intentional
    // (operational explicitness).
    const plansSnap = await adminDb
        .collection("subscriptionPlans")
        .where("code", "==", scoped.planCode)
        .get();
    const match = plansSnap.docs.find((d) => {
        const data = d.data() || {};
        const rs = data.roleScope === "teacher" || data.roleScope === "institute"
            ? data.roleScope
            : "student";
        return rs === scoped.scope && data.isActive !== false;
    });
    if (!match) {
        return {
            ok: true,
            resolved: {
                scope: scoped.scope,
                planCode: scoped.planCode,
                planId: null,
                planName: null,
                teachingFeatures: {},
                teachingLimits: { ...UNLIMITED_TEACHING_LIMITS },
                aiQuestionsPerDay: 0,
            },
        };
    }
    const data = match.data() || {};
    return {
        ok: true,
        resolved: {
            scope: scoped.scope,
            planCode: scoped.planCode,
            planId: match.id,
            planName: typeof data.name === "string" ? data.name : null,
            teachingFeatures: (data.teachingFeatures as TeachingFeatureMap) || {},
            teachingLimits: readTeachingLimits(data.teachingLimits),
            aiQuestionsPerDay:
                typeof data.aiQuestionsPerDay === "number"
                    ? data.aiQuestionsPerDay
                    : null,
        },
    };
}

export function hasTeachingFeature(
    map: TeachingFeatureMap,
    feature: TeachingFeature
): boolean {
    return Boolean(map[feature]);
}
