import { adminDb } from "@/lib/firebase/admin";
import type { PlanLimits, TeacherUsage } from "@digimine/types";

interface LimitCheckResult {
    allowed: boolean;
    message?: string;
}

export async function checkPlanLimits(
    teacherId: string,
    action: "create_quiz" | "create_test" | "create_contest" | "create_course" | "create_question" | "enroll_student"
): Promise<LimitCheckResult> {
    const teacherRef = adminDb.collection("teachers").doc(teacherId);
    const teacherSnap = await teacherRef.get();

    if (!teacherSnap.exists) {
        return { allowed: false, message: "Teacher not found." };
    }

    const teacher = teacherSnap.data()!;
    const subscription = teacher.subscription;
    const usage: TeacherUsage = teacher.usage || {};

    // Student enrollment is always allowed regardless of subscription status (freemium).
    // Only the student count limit applies.
    if (action === "enroll_student") {
        const planRef = adminDb.collection("subscription_plans").doc(subscription.planId);
        const planSnap = await planRef.get();

        // Fallback defaults if plan doc is missing
        const maxStudents = planSnap.exists ? (planSnap.data()!.limits.maxStudents as number) : 50;

        if (maxStudents !== -1 && usage.currentStudents >= maxStudents) {
            return { allowed: false, message: "This classroom is full. Ask your teacher to upgrade." };
        }
        return { allowed: true };
    }

    // Free/expired plans cannot create content
    if (subscription.status !== "active" && subscription.status !== "grace_period") {
        return { allowed: false, message: "Your subscription has expired. Please renew to continue." };
    }

    // Grace period: can view but not create
    if (subscription.status === "grace_period") {
        return { allowed: false, message: "Your subscription is in grace period. Renew now to create new content." };
    }

    const planRef = adminDb.collection("subscription_plans").doc(subscription.planId);
    const planSnap = await planRef.get();

    if (!planSnap.exists) {
        return { allowed: false, message: "Subscription plan not found." };
    }

    const limits: PlanLimits = planSnap.data()!.limits;

    switch (action) {
        case "create_quiz":
            if (limits.maxQuizzes !== -1 && usage.currentQuizzes >= limits.maxQuizzes) {
                return { allowed: false, message: "Upgrade to Pro to create more quizzes." };
            }
            break;
        case "create_test":
            if (limits.maxTests !== -1 && usage.currentTests >= limits.maxTests) {
                return { allowed: false, message: "Upgrade to Pro to create more test series." };
            }
            break;
        case "create_contest":
            if (limits.maxContests !== -1 && usage.currentContests >= limits.maxContests) {
                return { allowed: false, message: "Upgrade to Pro to create more contests." };
            }
            break;
        case "create_course":
            if (limits.maxCourses !== -1 && usage.currentCourses >= limits.maxCourses) {
                return { allowed: false, message: "Upgrade to Pro to create more courses." };
            }
            break;
        case "create_question":
            if (limits.maxQuestions !== -1 && usage.currentQuestions >= limits.maxQuestions) {
                return { allowed: false, message: "Upgrade to Pro to add more questions." };
            }
            break;
    }

    return { allowed: true };
}
