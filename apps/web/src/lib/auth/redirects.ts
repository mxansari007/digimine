/**
 * Centralized post-auth redirect logic. All sign-in/sign-up entry points
 * and dashboard layouts route through this so the rules stay consistent:
 *
 *   - no doc / no role           → /auth/role-select
 *   - role === "teacher"         → /teacher/dashboard
 *   - role === "admin" / etc.    → /admin (handled by admin app subdomain)
 *   - role === "customer"        → /dashboard
 *
 * Callers pass either a `User` (from AuthContext) or a raw role string.
 */
import type { User, UserRole } from "@digimine/types";

export function roleHomePath(role: UserRole | null | undefined): string {
    if (!role) return "/auth/role-select";
    if (role === "teacher") return "/teacher/dashboard";
    if (role === "institute_admin") return "/institute/dashboard";
    if (role === "admin" || role === "super_admin") return "/admin";
    return "/dashboard";
}

export function userHomePath(user: Pick<User, "role"> | null | undefined): string {
    return roleHomePath(user?.role ?? null);
}
