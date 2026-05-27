"use client";

/**
 * Full-page chrome for any onboarding step. Provides:
 *   - Soft gradient background (slate → blue) for warmth without screaming
 *   - PlacementRanker logo header so the user knows where they are
 *   - Centered content slot (the caller renders their card)
 *   - Footer with trust copy + a "Need help?" link
 *
 * Pages compose their layout inside this shell:
 *
 *   <OnboardingShell>
 *       <Stepper steps={steps} current={0} />
 *       <Card>...form...</Card>
 *   </OnboardingShell>
 *
 * The shell deliberately keeps the inner column narrow (max-w-xl) so
 * forms stay tight and readable on desktop without filling the viewport.
 */
import type { FC, ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@digimine/ui";

export interface OnboardingShellProps {
    children: ReactNode;
    /** Optional max-width override; defaults to xl. Useful for the profile
     *  step which needs a slightly wider card for the form. */
    maxWidth?: "md" | "lg" | "xl" | "2xl";
}

const MAX_WIDTH: Record<NonNullable<OnboardingShellProps["maxWidth"]>, string> = {
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
};

export const OnboardingShell: FC<OnboardingShellProps> = ({ children, maxWidth = "xl" }) => {
    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50">
            {/* Decorative blobs — softly anchor the eye without distracting */}
            <div
                aria-hidden
                className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary-100 opacity-50 blur-3xl"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-indigo-100 opacity-40 blur-3xl"
            />

            <div className="relative flex min-h-screen flex-col">
                {/* Header */}
                <header className="px-6 pt-8 sm:px-10">
                    <Link
                        href="/"
                        className="inline-flex items-center transition-opacity hover:opacity-80"
                        aria-label="Back to PlacementRanker home"
                    >
                        <Logo />
                    </Link>
                </header>

                {/* Centered content area */}
                <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
                    <div className={`w-full ${MAX_WIDTH[maxWidth]}`}>{children}</div>
                </main>

                {/* Footer */}
                <footer className="px-6 pb-6 sm:px-10">
                    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200/70 pt-4 text-xs text-slate-500 sm:flex-row">
                        <div className="flex items-center gap-2">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-3.5 w-3.5"
                                aria-hidden
                            >
                                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <span>Encrypted end-to-end · OTP verified</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link href="/terms" className="hover:text-slate-700">
                                Terms
                            </Link>
                            <Link href="/privacy" className="hover:text-slate-700">
                                Privacy
                            </Link>
                            <Link href="/support" className="hover:text-slate-700">
                                Need help?
                            </Link>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};
