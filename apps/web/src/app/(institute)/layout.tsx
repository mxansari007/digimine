"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar, DashboardShell } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firebase/auth";
import { PageLoading } from "@/components/common";
import { instituteNav } from "@/components/layout/sidebarNav";
import { EmailVerificationGate } from "@/components/auth/EmailVerificationGate";

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
    const { user, firebaseUser, isAuthenticated, loading } = useAuthContext();
    const router = useRouter();
    const pathname = usePathname() ?? "";

    const isOnboardingPath = pathname.startsWith("/institute/onboarding");
    const isPhoneStepPath = pathname.startsWith("/institute/onboarding/phone");

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
                // `/api/institute/me` returns `{institute: null}` for genuine
                // not-an-admin AND for transient failures (401 token blip, 500).
                // If the user doc already says they're an institute_admin, trust
                // it rather than bouncing an established admin into the
                // onboarding wizard over a momentary hiccup.
                const ok =
                    (res.ok && Boolean(data?.institute)) ||
                    user?.role === "institute_admin";
                setHasInstitute(ok);

                // Abuse-prevention: every new institute admin must verify
                // their phone before they can reach the create-institute
                // wizard. Skip the gate if (a) they already have an
                // institute, or (b) they already have a phone on their
                // user doc (e.g. existing teacher).
                const needsPhoneStep = !ok && !user?.phoneNumber;

                if (ok && isOnboardingPath) {
                    router.replace("/institute/dashboard");
                } else if (!ok && needsPhoneStep && !isPhoneStepPath) {
                    router.replace("/institute/onboarding/phone");
                } else if (!ok && !needsPhoneStep && isPhoneStepPath) {
                    router.replace("/institute/onboarding");
                } else if (!ok && !isOnboardingPath) {
                    router.replace(needsPhoneStep ? "/institute/onboarding/phone" : "/institute/onboarding");
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
                        router.replace(
                            user?.phoneNumber ? "/institute/onboarding" : "/institute/onboarding/phone"
                        );
                    }
                }
            } finally {
                setResolving(false);
            }
        })();
    }, [firebaseUser, isAuthenticated, isOnboardingPath, isPhoneStepPath, loading, router, user?.phoneNumber, user?.role]);

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
                    nav={instituteNav}
                    user={user}
                    LinkComponent={Link}
                    onSignOut={handleSignOut}
                    brandHref="/institute/dashboard"
                    isOpen={isOpen}
                    onClose={onClose}
                    collapsed={collapsed}
                    onToggleCollapsed={onToggleCollapsed}
                />
            )}
        >
            {children}
        </DashboardShell>
    );
}
