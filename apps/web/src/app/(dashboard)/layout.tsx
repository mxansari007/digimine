"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar, DashboardShell } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firebase/auth";
import { PageLoading } from "@/components/common";
import { userHomePath, ROLE_SELECT_PATH } from "@/lib/auth/redirects";
import { studentNav, portalSwitchNav, withCredits } from "@/components/layout/sidebarNav";
import { EmailVerificationGate } from "@/components/auth/EmailVerificationGate";
import { ThemeToggle } from "@/components/theme";
import { useCredits } from "@/contexts/CreditsContext";

/**
 * Results pages (test / quiz / contest) are user-scoped — anyone whose
 * userId matches the attempt can see it regardless of role. They live
 * inside this layout for historical reasons, but the layout MUST NOT
 * redirect non-customers away from them, otherwise a teacher or institute
 * admin who attempts a public test in preview mode gets bounced before
 * they ever see their score.
 *
 * Everything else under (dashboard) is the student experience and stays
 * gated to role === "customer".
 */
function isUniversalResultsPath(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard/tests/results/") ||
    pathname.startsWith("/dashboard/quizzes/results/") ||
    pathname.startsWith("/dashboard/contests/results/")
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EmailVerificationGate>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </EmailVerificationGate>
  );
}

function DashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user, loading, isAuthenticated, portals } = useAuthContext();
  const credits = useCredits();
  const isResultsPath = isUniversalResultsPath(pathname);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (!user) return;
    // Results pages are universal — let any signed-in role through.
    if (isResultsPath) return;
    // Anyone whose home isn't the student dashboard (teacher / admin /
    // role-less) is redirected away — admins to /admin, teachers to
    // /teacher/dashboard, role-less users to /role-select.
    if (user.role && user.role !== "customer") {
      router.push(userHomePath(user));
    } else if (!user.role) {
      router.push(ROLE_SELECT_PATH);
    }
  }, [loading, isAuthenticated, router, user, isResultsPath]);

  if (loading) return <PageLoading />;
  if (!isAuthenticated) return <PageLoading />;
  // Block the student-only UI from flashing while a role mismatch is being
  // resolved. The effect above will redirect on the next tick. Results
  // pages bypass this guard since they're role-agnostic.
  if (!isResultsPath && user && user.role !== "customer") return <PageLoading />;

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/login");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error signing out:", error);
    }
  };

  // Non-customer roles viewing a results page (teacher / institute admin
  // who just submitted a preview attempt) render in a minimal frame —
  // showing them the student sidebar would be confusing.
  if (isResultsPath && user && user.role && user.role !== "customer") {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="border-b border-slate-200 bg-white">
          <div className="container-page flex items-center justify-between py-3">
            <Link href={userHomePath(user)} className="text-sm font-medium text-primary-700 hover:underline">
              ← Back to {user.role === "teacher" ? "teacher" : user.role === "institute_admin" ? "institute" : "your"} dashboard
            </Link>
            <span className="chip-info text-xs">Preview result</span>
          </div>
        </div>
        <main className="container-page py-6">{children}</main>
      </div>
    );
  }

  return (
    <DashboardShell
      role="student"
      sidebar={({ isOpen, onClose, collapsed, onToggleCollapsed }) => (
        <AppSidebar
          role="student"
          pathname={pathname}
          nav={[
            ...withCredits(studentNav, credits.enabled, credits.balance, "My Plan"),
            ...portalSwitchNav(portals, "student"),
          ]}
          user={user}
          LinkComponent={Link}
          onSignOut={handleSignOut}
          brandHref="/dashboard"
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
