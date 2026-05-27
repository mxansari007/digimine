import { adminDb } from "@/lib/firebase/admin";
import { getTeachingEntitlements } from "@/lib/server/teachingEntitlements";
import type { TeacherUsage, TeachingLimits } from "@digimine/types";

interface LimitCheckResult {
    allowed: boolean;
    message?: string;
}

/**
 * Server-side enforcement for the per-plan caps configured by admins on
 * `subscriptionPlans/{id}.teachingLimits` (admin UI: /admin/subscription).
 *
 * Resolves the teacher's plan through the same path the teacher Usage
 * page uses (`lib/server/teachingEntitlements.ts`), so what teachers see
 * matches what gets blocked.
 *
 *   - -1 in any limit → unlimited (don't block)
 *   - missing plan / missing limits → unlimited (don't block) so legacy
 *     accounts without a configured plan keep working until admins set
 *     caps on the plan doc
 *
 * Subscription-status gating (active/grace/expired) still runs first so
 * an expired teacher can't create content even if their plan's numeric
 * limits are unlimited.
 */
export async function checkPlanLimits(
    teacherId: string,
    action:
        | "create_quiz"
        | "create_test"
        | "create_contest"
        | "create_course"
        | "create_question"
        | "enroll_student"
        | "create_class"
): Promise<LimitCheckResult> {
    const teacherRef = adminDb.collection("teachers").doc(teacherId);
    const teacherSnap = await teacherRef.get();

    if (!teacherSnap.exists) {
        return { allowed: false, message: "Teacher not found." };
    }

    const teacher = teacherSnap.data()!;
    const subscription = teacher.subscription;
    const usage: TeacherUsage = teacher.usage || ({} as TeacherUsage);

    // Student enrollment is always allowed regardless of subscription status
    // (freemium) — only the student count limit applies.
    if (action === "enroll_student") {
        const limits = await resolveLimits(teacherId);
        return enforce(limits.maxStudents, usage.currentStudents || 0, "This classroom is full. Ask your teacher to upgrade.");
    }

    // Free / expired plans cannot create content.
    if (subscription?.status !== "active" && subscription?.status !== "trial" && subscription?.status !== "grace_period") {
        return { allowed: false, message: "Your subscription has expired. Please renew to continue." };
    }
    if (subscription.status === "grace_period") {
        return { allowed: false, message: "Your subscription is in grace period. Renew now to create new content." };
    }

    const limits = await resolveLimits(teacherId);

    switch (action) {
        case "create_class":
            return enforce(
                limits.maxClasses,
                await countClasses(teacherId),
                "Upgrade your plan to create more classes."
            );
        case "create_quiz":
            return enforce(limits.maxQuizzes, usage.currentQuizzes || 0, "Upgrade your plan to create more quizzes.");
        case "create_test":
            return enforce(limits.maxTests, usage.currentTests || 0, "Upgrade your plan to create more test series.");
        case "create_contest":
            return enforce(limits.maxContests, usage.currentContests || 0, "Upgrade your plan to create more contests.");
        case "create_course":
            return enforce(limits.maxCourses, usage.currentCourses || 0, "Upgrade your plan to create more courses.");
        case "create_question":
            return enforce(
                limits.maxQuestions,
                usage.currentQuestions || 0,
                "Upgrade your plan to add more questions."
            );
    }

    return { allowed: true };
}

function enforce(max: number, current: number, message: string): LimitCheckResult {
    if (max === -1) return { allowed: true };
    if (current >= max) return { allowed: false, message };
    return { allowed: true };
}

async function resolveLimits(teacherId: string): Promise<TeachingLimits> {
    const ent = await getTeachingEntitlements(teacherId);
    if (!ent.ok) {
        // Not a teaching role — should be unreachable from this middleware
        // (callers gate by teacherId). Fail open rather than blocking
        // legitimate test-suite or migration code that probes the helper.
        return {
            maxClasses: -1,
            maxStudents: -1,
            maxTests: -1,
            maxQuizzes: -1,
            maxContests: -1,
            maxCourses: -1,
            maxQuestions: -1,
            pistonConcurrency: -1,
        };
    }
    return ent.resolved.teachingLimits;
}

async function countClasses(teacherId: string): Promise<number> {
    const snap = await adminDb
        .collection("classes")
        .where("teacherId", "==", teacherId)
        .count()
        .get();
    return snap.data().count || 0;
}
