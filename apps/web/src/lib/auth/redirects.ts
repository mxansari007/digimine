/**
 * Centralized post-auth redirect logic. All sign-in/sign-up entry points
 * and dashboard layouts route through this so the rules stay consistent:
 *
 *   - no doc / no role           → /role-select
 *   - role === "teacher"         → /teacher/dashboard
 *   - role === "admin" / etc.    → /admin (handled by admin app subdomain)
 *   - role === "customer"        → /dashboard
 *
 * Note: `/role-select` lives under the `(auth)` route group, so it resolves
 * to `/role-select` at the URL level — not `/auth/role-select`.
 *
 * Callers pass either a `User` (from AuthContext) or a raw role string.
 */
import type { OnboardingStep, User, UserRole } from "@digimine/types";

export const ROLE_SELECT_PATH = "/role-select";

export function roleHomePath(role: UserRole | null | undefined): string {
    if (!role) return ROLE_SELECT_PATH;
    if (role === "teacher") return "/teacher/dashboard";
    if (role === "institute_admin") return "/institute/dashboard";
    if (role === "admin" || role === "super_admin") return "/admin";
    return "/dashboard";
}

/**
 * Returns the URL where a user with `onboardingStep` mid-flow should
 * resume. Returns `null` when the step is missing, unknown, or
 * `"complete"` — callers should fall back to `roleHomePath` /
 * `ROLE_SELECT_PATH` in that case.
 */
export function resumeOnboardingPath(
    step: OnboardingStep | null | undefined
): string | null {
    switch (step) {
        case "teacher:phone":
            return "/teacher/onboarding/phone";
        // Legacy step: the payment step was removed to reduce onboarding
        // friction. Any user whose doc still reads "teacher:payment" resumes
        // at the profile step instead of a now-deleted page.
        case "teacher:payment":
        case "teacher:profile":
            return "/teacher/onboarding/profile";
        case "institute:phone":
            return "/institute/onboarding/phone";
        case "institute:setup":
            return "/institute/onboarding";
        default:
            return null;
    }
}

export function userHomePath(
    user: Pick<User, "role" | "onboardingStep"> | null | undefined
): string {
    const resume = resumeOnboardingPath(user?.onboardingStep);
    if (resume) return resume;
    return roleHomePath(user?.role ?? null);
}
