"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar, DashboardShell } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firebase/auth";
import { PageLoading } from "@/components/common";
import { instituteNav, portalSwitchNav } from "@/components/layout/sidebarNav";
import { EmailVerificationGate } from "@/components/auth/EmailVerificationGate";
import { ThemeToggle } from "@/components/theme";

/**
 * Institute admin layout. Mirrors the teacher layout shape but resolves the
 * caller's institute via /api/institute/me. New admins land on the
 * onboarding wizard until they create one.
 */
export default function InstituteLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <EmailVerificationGate>
            <InstituteLayoutInner>{children}</InstituteLayoutInner>
        </EmailVerificationGate>
    );
}

function InstituteLayoutInner({ children }: { children: React.ReactNode }) {
    const { user, firebaseUser, isAuthenticated, loading, portals } = useAuthContext();
    const router = useRouter();
    const pathname = usePathname() ?? "";

    const isOnboardingPath = pathname.startsWith("/institute/onboarding");

    const [resolving, setResolving] = useState(true);
    const [hasInstitute, setHasInstitute] = useState(false);

    useEffect(() => {
        if (loading) return;
        if (!isAuthenticated) {
            router.push("/login?redirect=/institute/dashboard");
            return;
        }
        if (!firebaseUser) return;

        (async () => {
            try {
                const token = await firebaseUser.getIdToken();
                const res = await fetch("/api/institute/me", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                // When the request SUCCEEDS, trust its answer outright: a 200
                // with institute:null genuinely means "no institute" (e.g. it
                // was deleted) and the user should be routed out — we must not
                // admit them on a stale role or the dashboard would crash
                // fetching a non-existent institute. (The post-create
                // consistency lag that used to return a false null is fixed at
                // the source in findInstituteForAdmin, which now reads the
                // strongly-consistent users.instituteId.) Only when the request
                // itself FAILS (401 token blip, 500, network) do we fall back
                // to trusting role so a transient hiccup can't bounce an
                // established admin into the onboarding wizard.
                const ok = res.ok
                    ? Boolean(data?.institute)
                    : user?.role === "institute_admin";
                setHasInstitute(ok);

                if (ok && isOnboardingPath) {
                    router.replace("/institute/dashboard");
                } else if (!ok && !isOnboardingPath) {
                    router.replace("/institute/onboarding");
                }
            } catch {
                // Network error reaching /api/institute/me — don't strand a
                // real admin on the onboarding wizard. Trust the role if we
                // have it; only a non-admin (or unknown role) gets routed out.
                if (user?.role === "institute_admin") {
                    setHasInstitute(true);
                } else {
                    setHasInstitute(false);
                    if (!isOnboardingPath) {
                        router.replace("/institute/onboarding");
                    }
                }
            } finally {
                setResolving(false);
            }
        })();
    }, [firebaseUser, isAuthenticated, isOnboardingPath, loading, router, user?.role]);

    if (loading || resolving) return <PageLoading />;

    // Onboarding renders bare — no sidebar — so the wizard isn't framed.
    if (isOnboardingPath) return <>{children}</>;

    if (!hasInstitute) return null;

    const handleSignOut = async () => {
        try {
            await signOut();
            router.push("/login");
        } catch (err) {
            console.error("Sign out failed:", err);
        }
    };

    return (
        <DashboardShell
            role="institute"
            sidebar={({ isOpen, onClose, collapsed, onToggleCollapsed }) => (
                <AppSidebar
                    role="institute"
                    pathname={pathname}
                    nav={[...instituteNav, ...portalSwitchNav(portals, "institute")]}
                    user={user}
                    LinkComponent={Link}
                    onSignOut={handleSignOut}
                    brandHref="/institute/dashboard"
                    isOpen={isOpen}
                    onClose={onClose}
                    collapsed={collapsed}
                    onToggleCollapsed={onToggleCollapsed}
                    footerExtra={<ThemeToggle side="top" align="start" />}
                />
            )}
        >
            {children}
        </DashboardShell>
    );
}
