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
 *   2. LAUNCH MODE: if the paywall is off
 *      (`appConfig/subscription.enforced == false`) grant ALL teaching
 *      features + unlimited limits + uncapped AI — mirroring how the
 *      student entitlements layer opens up in launch mode. (Whether AI
 *      actually runs is still governed by the separate global AI provider
 *      switch + API key — launch mode lifts the PER-PLAN gate, not the
 *      operational kill-switch.)
 *   3. For role=teacher, read teachers/{uid}.subscription.planCode
 *      (also accepts subscription.planId for legacy).
 *   4. For role=institute_admin, find the institute they admin
 *      and read institutes/{id}.subscription.planCode / .planId.
 *   5. Look up subscriptionPlans where code == planCode AND
 *      roleScope == <user's role scope>. If found and active,
 *      return the plan's teachingFeatures map + teachingLimits.
 *   6. Otherwise fall back to the role scope's FREE plan
 *      (isFree == true, matching roleScope, active) so the limits
 *      the admin authored still govern access even when the user's
 *      planCode is missing, stale, or points at a deleted plan.
 *   7. Only when no free plan exists for the scope at all do we
 *      fail open (features locked, limits unlimited) — that keeps
 *      a fresh, un-seeded environment from blocking everyone.
 *
 * This means: once the paywall is ENFORCED, any teaching-side gate is
 * locked until (a) the admin creates a plan in /admin/subscription with
 * the right code + ticks the feature, AND (b) the user has that plan
 * recorded on their account. This is intentional — it makes the gate
 * operationally explicit rather than fail-open.
 */
import { adminDb } from "@/lib/firebase/admin";
import {
    TEACHING_FEATURES,
    UNLIMITED_TEACHING_LIMITS,
    type TeachingFeature,
    type TeachingFeatureMap,
    type TeachingLimits,
    type UserEntitlementOverride,
} from "@digimine/types";
import { getGlobalConfig } from "./entitlements";
import { getUserEntitlementOverride } from "./userOverrides";

/**
 * Every teaching feature ON — the launch-mode (paywall-off) grant. Mirrors
 * how the student entitlements layer hands out all features when
 * `appConfig/subscription.enforced` is false.
 */
const ALL_TEACHING_FEATURES_ON: TeachingFeatureMap = TEACHING_FEATURES.reduce(
    (acc, f) => {
        acc[f.key] = true;
        return acc;
    },
    {} as TeachingFeatureMap
);

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

/**
 * Layer a per-user admin override on top of the plan-resolved teaching
 * entitlements. Only the keys the admin set win — so a grant can unlock a
 * teaching feature / raise a limit / lift the AI cap the plan doesn't give,
 * for this user only. `aiQuestionsPerDay` is overridden only when the admin
 * explicitly set it (including to null = unlimited or 0 = disabled).
 */
function applyTeachingOverride(
    base: ResolvedTeachingPlan,
    override: UserEntitlementOverride | null
): ResolvedTeachingPlan {
    if (!override) return base;
    return {
        ...base,
        teachingFeatures: { ...base.teachingFeatures, ...(override.teachingFeatures || {}) },
        teachingLimits: { ...base.teachingLimits, ...(override.teachingLimits || {}) },
        aiQuestionsPerDay:
            override.aiQuestionsPerDay !== undefined
                ? override.aiQuestionsPerDay
                : base.aiQuestionsPerDay,
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
    // "institute_seat" (written by the claim flow) is a seat MARKER, not a
    // plan code — it exists in no plan doc. Treating it as a personal plan
    // code blocked the institute-inheritance branch below, locking seat
    // teachers out of the features/limits their institute pays for.
    if (typeof sub.planId === "string" && sub.planId && sub.planId !== "institute_seat") {
        return sub.planId;
    }
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

/**
 * Resolve the FREE plan for a role scope. Used as the fallback when the
 * user's subscription has no planCode, or the planCode no longer matches
 * any active plan — so admin-authored free-tier limits still apply instead
 * of silently granting unlimited access. Returns null when the admin has
 * not created a free plan for the scope (fresh environment).
 */
async function findFreePlanForScope(
    scope: TeachingPlanScope
): Promise<ResolvedTeachingPlan | null> {
    const snap = await adminDb
        .collection("subscriptionPlans")
        .where("isFree", "==", true)
        .get();
    const matches = snap.docs.filter((d) => {
        const data = d.data() || {};
        const rs = data.roleScope === "teacher" || data.roleScope === "institute"
            ? data.roleScope
            : "student";
        return rs === scope && data.isActive !== false;
    });
    if (matches.length === 0) return null;
    matches.sort((a, b) => (a.data()?.sortOrder ?? 0) - (b.data()?.sortOrder ?? 0));
    const doc = matches[0];
    const data = doc.data() || {};
    return {
        scope,
        planCode: typeof data.code === "string" ? data.code : null,
        planId: doc.id,
        planName: typeof data.name === "string" ? data.name : null,
        teachingFeatures: (data.teachingFeatures as TeachingFeatureMap) || {},
        teachingLimits: readTeachingLimits(data.teachingLimits),
        aiQuestionsPerDay:
            typeof data.aiQuestionsPerDay === "number" ? data.aiQuestionsPerDay : 0,
    };
}

export async function getTeachingEntitlements(
    userId: string
): Promise<TeachingEntitlements> {
    const scoped = await resolveScopeForUser(userId);
    if (!scoped) return { ok: false, reason: "not_teaching_role" };

    // Read the per-user override once and apply it to whichever base the
    // resolution below settles on (plan match, free fallback, launch mode…).
    const override = await getUserEntitlementOverride(userId);
    const wrap = (resolved: ResolvedTeachingPlan): TeachingEntitlements => ({
        ok: true,
        resolved: applyTeachingOverride(resolved, override),
    });

    // Launch mode: paywall off → grant everything, exactly like the student
    // entitlements layer does. This is the missing link teachers hit when the
    // admin flips "launch mode" on expecting AI generation (and the rest) to
    // open up but it stayed plan-gated. The global AI provider switch + API
    // key are still required for AI to actually run (that's the operational
    // kill-switch, separate from the per-plan grant). Reads the SAME config
    // the student layer reads, so the two can never disagree on launch mode.
    const config = await getGlobalConfig();
    if (!config.enforced) {
        return wrap({
            scope: scoped.scope,
            planCode: scoped.planCode,
            planId: null,
            planName: null,
            teachingFeatures: { ...ALL_TEACHING_FEATURES_ON },
            teachingLimits: { ...UNLIMITED_TEACHING_LIMITS },
            aiQuestionsPerDay: null,
        });
    }

    if (!scoped.planCode) {
        // No plan recorded — give the admin-authored free tier for this
        // scope so its limits govern access; unlimited only when no free
        // plan exists (un-seeded environment).
        const free = await findFreePlanForScope(scoped.scope);
        if (free) return wrap(free);
        return wrap({
            scope: scoped.scope,
            planCode: null,
            planId: null,
            planName: null,
            teachingFeatures: {},
            teachingLimits: { ...UNLIMITED_TEACHING_LIMITS },
            aiQuestionsPerDay: 0,
        });
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
        // The subscription points at a plan code that no longer exists (or
        // was deactivated / re-scoped). Fall back to the scope's free plan
        // so the admin's authored limits still apply, instead of silently
        // granting unlimited access on a stale code.
        const free = await findFreePlanForScope(scoped.scope);
        if (free) return wrap(free);
        return wrap({
            scope: scoped.scope,
            planCode: scoped.planCode,
            planId: null,
            planName: null,
            teachingFeatures: {},
            teachingLimits: { ...UNLIMITED_TEACHING_LIMITS },
            aiQuestionsPerDay: 0,
        });
    }
    const data = match.data() || {};
    return wrap({
        scope: scoped.scope,
        planCode: scoped.planCode,
        planId: match.id,
        planName: typeof data.name === "string" ? data.name : null,
        teachingFeatures: (data.teachingFeatures as TeachingFeatureMap) || {},
        teachingLimits: readTeachingLimits(data.teachingLimits),
        aiQuestionsPerDay:
            typeof data.aiQuestionsPerDay === "number" ? data.aiQuestionsPerDay : null,
    });
}

export function hasTeachingFeature(
    map: TeachingFeatureMap,
    feature: TeachingFeature
): boolean {
    return Boolean(map[feature]);
}
