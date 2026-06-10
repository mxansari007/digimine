import { describe, it, expect, beforeEach, vi } from "vitest";

// Mutable scenario the mocks read from (hoisted so the vi.mock factories,
// which are hoisted above imports, can close over it).
const h = vi.hoisted(() => ({
    enforced: true as boolean,
    role: "teacher" as string,
    sub: { planCode: "teacher-pro" } as Record<string, unknown> | undefined,
    plans: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
    override: null as Record<string, unknown> | null,
}));

vi.mock("../userOverrides", () => ({
    getUserEntitlementOverride: () => Promise.resolve(h.override),
}));

// Replace the global-config read entirely — its internals don't matter here.
vi.mock("../entitlements", () => ({
    getGlobalConfig: () =>
        Promise.resolve({
            enforced: h.enforced,
            currency: "INR",
            freePlanCode: "free",
            promoBanner: null,
            updatedAt: new Date(0),
            updatedBy: null,
        }),
}));

vi.mock("@/lib/firebase/admin", () => ({
    adminDb: {
        collection: (name: string) => ({
            doc: () => ({
                get: () =>
                    Promise.resolve(
                        name === "users"
                            ? { exists: true, data: () => ({ role: h.role }) }
                            : name === "teachers"
                              ? { exists: true, data: () => ({ subscription: h.sub }) }
                              : { exists: false, data: () => ({}) }
                    ),
                collection: () => ({
                    where: () => ({
                        limit: () => ({ get: () => Promise.resolve({ empty: true, docs: [] }) }),
                    }),
                }),
            }),
            // subscriptionPlans lookups (.where("code"==).get() and the
            // .where("isFree"==).get() free-plan fallback) both land here.
            where: () => ({ get: () => Promise.resolve({ docs: h.plans, empty: h.plans.length === 0 }) }),
        }),
    },
}));

import { getTeachingEntitlements } from "../teachingEntitlements";

beforeEach(() => {
    h.enforced = true;
    h.role = "teacher";
    h.sub = { planCode: "teacher-pro" };
    h.plans = [];
    h.override = null;
});

describe("getTeachingEntitlements — launch mode", () => {
    it("grants ALL teaching features + unlimited limits + uncapped AI when the paywall is off", async () => {
        h.enforced = false;
        // A plan with AI explicitly OFF must be ignored in launch mode.
        h.plans = [
            { id: "p1", data: () => ({ roleScope: "teacher", isActive: true, teachingFeatures: { ai_question_generation: false } }) },
        ];

        const ent = await getTeachingEntitlements("u1");
        expect(ent.ok).toBe(true);
        if (!ent.ok) return;
        expect(ent.resolved.teachingFeatures.ai_question_generation).toBe(true);
        expect(ent.resolved.teachingFeatures.question_bank_template_download).toBe(true);
        expect(ent.resolved.teachingFeatures.question_bank_markdown_import).toBe(true);
        expect(ent.resolved.teachingLimits.maxQuizzes).toBe(-1);
        expect(ent.resolved.aiQuestionsPerDay).toBeNull(); // uncapped
        expect(ent.resolved.planCode).toBe("teacher-pro"); // user's code is preserved
    });

    it("does NOT bypass non-teaching roles, even in launch mode", async () => {
        h.enforced = false;
        h.role = "customer";
        const ent = await getTeachingEntitlements("u1");
        expect(ent.ok).toBe(false);
    });
});

describe("getTeachingEntitlements — enforced mode (control)", () => {
    it("respects the plan's AI toggle when the paywall is on", async () => {
        h.enforced = true;
        h.plans = [
            { id: "p1", data: () => ({ roleScope: "teacher", isActive: true, name: "Pro", teachingFeatures: { ai_question_generation: false }, teachingLimits: { maxQuizzes: 5 }, aiQuestionsPerDay: 0 }) },
        ];

        const ent = await getTeachingEntitlements("u1");
        expect(ent.ok).toBe(true);
        if (!ent.ok) return;
        // Launch-mode grant is conditional: with the paywall on, the plan's
        // own toggle wins, so AI stays off here.
        expect(ent.resolved.teachingFeatures.ai_question_generation).toBeFalsy();
        expect(ent.resolved.teachingLimits.maxQuizzes).toBe(5);
    });
});

describe("getTeachingEntitlements — per-user override", () => {
    it("grants a feature / raises a limit / lifts the AI cap beyond the plan", async () => {
        h.enforced = true;
        // Plan gives no AI and a maxQuizzes cap of 5.
        h.plans = [
            { id: "p1", data: () => ({ roleScope: "teacher", isActive: true, name: "Pro", teachingFeatures: { ai_question_generation: false }, teachingLimits: { maxQuizzes: 5 }, aiQuestionsPerDay: 0 }) },
        ];
        // Admin grants this one user AI + a higher quiz cap + unlimited AI/day.
        h.override = {
            teachingFeatures: { ai_question_generation: true },
            teachingLimits: { maxQuizzes: 50 },
            aiQuestionsPerDay: null,
        };

        const ent = await getTeachingEntitlements("u1");
        expect(ent.ok).toBe(true);
        if (!ent.ok) return;
        expect(ent.resolved.teachingFeatures.ai_question_generation).toBe(true);
        expect(ent.resolved.teachingLimits.maxQuizzes).toBe(50);
        expect(ent.resolved.aiQuestionsPerDay).toBeNull();
    });

    it("can revoke a feature the plan grants, for one user", async () => {
        h.enforced = true;
        h.plans = [
            { id: "p1", data: () => ({ roleScope: "teacher", isActive: true, teachingFeatures: { ai_question_generation: true } }) },
        ];
        h.override = { teachingFeatures: { ai_question_generation: false } };

        const ent = await getTeachingEntitlements("u1");
        if (!ent.ok) return;
        expect(ent.resolved.teachingFeatures.ai_question_generation).toBe(false);
    });

    it("leaves untouched keys inheriting the plan", async () => {
        h.enforced = true;
        h.plans = [
            { id: "p1", data: () => ({ roleScope: "teacher", isActive: true, teachingLimits: { maxQuizzes: 5, maxTests: 3 } }) },
        ];
        h.override = { teachingLimits: { maxQuizzes: 99 } };

        const ent = await getTeachingEntitlements("u1");
        if (!ent.ok) return;
        expect(ent.resolved.teachingLimits.maxQuizzes).toBe(99); // overridden
        expect(ent.resolved.teachingLimits.maxTests).toBe(3); // inherited from plan
    });
});
