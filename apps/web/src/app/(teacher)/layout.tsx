"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar, DashboardShell } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firebase/auth";
import { userHomePath } from "@/lib/auth/redirects";
import { PageLoading } from "@/components/common";
import { teacherNav } from "@/components/layout/sidebarNav";
import { EmailVerificationGate } from "@/components/auth/EmailVerificationGate";
import { ThemeToggle } from "@/components/theme";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EmailVerificationGate>
      <TeacherLayoutInner>{children}</TeacherLayoutInner>
    </EmailVerificationGate>
  );
}

function TeacherLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, isTeacher, isInstituteAdmin, loading } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  // `/teacher/onboarding/*` is the only sub-tree of the teacher layout
  // that an authenticated-but-role-less user may visit — that's the
  // funnel that actually promotes them to role=teacher.
  const isOnboardingPath = pathname.startsWith("/teacher/onboarding");

  // Institute admins are allowed to traverse the teacher portal so they can
  // edit institute-owned content (where they're stamped as the author).
  // Their default sidebar is still the institute one; teachers see theirs.
  const allowed = isTeacher || isInstituteAdmin;

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.push("/login?redirect=/teacher/dashboard");
      return;
    }
    if (!user) return;
    if (isOnboardingPath) {
      if (isTeacher) router.push("/teacher/dashboard");
      return;
    }
    if (!allowed) {
      router.push(userHomePath(user));
    }
  }, [isAuthenticated, allowed, isTeacher, isOnboardingPath, loading, router, user]);

  if (loading) return <PageLoading />;

  // Onboarding renders bare — no sidebar — so role-less users can step
  // through the funnel before their teacher doc exists.
  if (isOnboardingPath) {
    return <>{children}</>;
  }

  if (!allowed) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/login");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Sign out failed:", err);
    }
  };

  return (
    <DashboardShell
      role="teacher"
      sidebar={({ isOpen, onClose, collapsed, onToggleCollapsed }) => (
        <AppSidebar
          role="teacher"
          pathname={pathname}
          nav={teacherNav}
          user={user}
          LinkComponent={Link}
          onSignOut={handleSignOut}
          brandHref="/teacher/dashboard"
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
