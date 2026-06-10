"use client";

/**
 * Classroom is an authenticated area that lives outside the role route-groups,
 * so it needs its own email-verification gate: an unverified password user is
 * redirected to /verify-email, same as the teacher/institute/dashboard layouts.
 */
import type { ReactNode } from "react";
import { EmailVerificationGate } from "@/components/auth/EmailVerificationGate";

export default function ClassroomLayout({ children }: { children: ReactNode }) {
  return <EmailVerificationGate>{children}</EmailVerificationGate>;
}
