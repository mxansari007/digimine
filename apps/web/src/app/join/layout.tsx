"use client";

/**
 * The class-join flow is authenticated but lives outside the role route-groups,
 * so it needs its own email-verification gate: an unverified password user is
 * redirected to /verify-email before they can join a class.
 */
import type { ReactNode } from "react";
import { EmailVerificationGate } from "@/components/auth/EmailVerificationGate";

export default function JoinLayout({ children }: { children: ReactNode }) {
  return <EmailVerificationGate>{children}</EmailVerificationGate>;
}
