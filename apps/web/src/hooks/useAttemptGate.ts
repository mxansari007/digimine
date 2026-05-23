"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { ROLE_SELECT_PATH } from "@/lib/auth/redirects";

/**
 * Guard hook for any "attempt" surface: practice problem solving, quiz
 * sessions, test series attempts, contest pages. The hook does NOT block
 * anonymous reads of these pages (browsing is fine) — it kicks in only when
 * the user has signed in but has no committed role yet.
 *
 * Why this exists:
 *   A signed-in but role-less user can otherwise hit submit/start actions
 *   on an attempt page and produce orphan rows (submissions tied to a
 *   user without a profile role). We funnel them through `/role-select`
 *   first so they finish onboarding, then return them right back to the
 *   attempt page via `?next=`.
 *
 * Behaviour:
 *   - Loading / unauthenticated → no-op (existing login CTAs handle that).
 *   - Authenticated but `user.role` is null → router.replace to
 *     `/role-select?next=<currentPath+search>` (replace so the browser
 *     back button doesn't trap the user in a loop).
 *   - Authenticated with a role → no-op.
 *
 * Returns the current gate status so callers can also block rendering
 * gated UI until the role is known.
 */
export function useAttemptGate(): {
    /** True while auth is still resolving. Show a skeleton if relevant. */
    loading: boolean;
    /** True if the caller is signed in AND has a committed role. */
    ready: boolean;
    /** True if the caller is signed in but has no role yet (about to redirect). */
    redirecting: boolean;
} {
    const router = useRouter();
    const pathname = usePathname() ?? "/";
    const searchParams = useSearchParams();
    const { user, firebaseUser, loading } = useAuthContext();

    const search = searchParams.toString();
    const fullPath = search ? `${pathname}?${search}` : pathname;

    const signedInRoleless = !!firebaseUser && !loading && !user?.role;

    useEffect(() => {
        if (loading) return;
        if (!firebaseUser) return; // anonymous — let the page's own CTAs handle
        if (user?.role) return; // already has a role
        // Orphan: signed-in but role-less. Send them through role-select with
        // `next=` so we can drop them right back here after they pick a role
        // (or complete teacher / institute onboarding).
        const next = encodeURIComponent(fullPath);
        router.replace(`${ROLE_SELECT_PATH}?next=${next}`);
    }, [loading, firebaseUser, user?.role, fullPath, router]);

    return {
        loading,
        ready: !!firebaseUser && !!user?.role,
        redirecting: signedInRoleless,
    };
}
