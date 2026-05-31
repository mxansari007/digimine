"use client";

/**
 * Phone OTP gate for new institute admins. The `/api/institute/register`
 * endpoint requires `users/{uid}.phoneNumber` to be set before it will
 * create an institute, so this page is the gate.
 *
 * OTP mechanics live in `usePhoneOtp`. The verified phone is persisted
 * via the shared `/api/onboarding/phone` route (server-side, mirrors the
 * teacher flow) rather than a client-side `updateDoc`.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { Card, Button } from "@digimine/ui";
import { Wrench } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { usePhoneOtp } from "@/lib/auth/usePhoneOtp";
import { OnboardingShell, Stepper, StepHeader } from "@/components/onboarding";

const STEPS = ["Phone", "Institute"];

export default function InstitutePhoneOnboardingPage() {
    const router = useRouter();
    const { firebaseUser, user, isAuthenticated, loading: authLoading } = useAuthContext();

    const otp = usePhoneOtp();

    useEffect(() => {
        if (!authLoading && user?.phoneNumber) {
            router.replace("/institute/onboarding");
        }
    }, [authLoading, user?.phoneNumber, router]);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.push("/login?redirect=/institute/onboarding/phone");
        }
    }, [authLoading, isAuthenticated, router]);

    // Pre-fill the phone field from the user profile if we already have one.
    useEffect(() => {
        if (user?.phoneNumber && !otp.phone) {
            otp.setPhone(user.phoneNumber);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.phoneNumber]);

    const onVerify = async () => {
        const result = await otp.verifyOtp();
        if (!result) return;

        const res = await teacherFetch(firebaseUser, "/api/onboarding/phone", {
            method: "POST",
            body: JSON.stringify({ phone: otp.phone, flow: "institute" }),
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            // The OTP confirmation is single-use — reset to the phone-entry step
            // so the user can request a fresh code or change the number, rather
            // than being stuck on a dead OTP field after a save error.
            otp.changeNumber();
            window.alert(d?.error || "We couldn't save that phone number. Please try again.");
            return;
        }
        router.push("/institute/onboarding");
    };

    if (authLoading || !isAuthenticated) {
        return (
            <OnboardingShell maxWidth="md">
                <div className="flex items-center justify-center py-20 text-sm text-slate-500">
                    Loading…
                </div>
            </OnboardingShell>
        );
    }

    return (
        <OnboardingShell maxWidth="md">
            <div className="mb-8">
                <Stepper steps={STEPS} current={0} />
            </div>

            <div className="mb-6">
                <StepHeader
                    title="Verify your phone"
                    subtitle="One-time OTP to prevent bulk signup abuse. Used only for account security."
                    icon={
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-6 w-6"
                            aria-hidden
                        >
                            <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
                            <path d="M12 18h.01" />
                        </svg>
                    }
                />
            </div>

            <Card className="overflow-hidden p-6 sm:p-8">
                <div className="space-y-4">
                    <div className="phone-input-unified relative flex items-stretch rounded-xl border border-slate-300 bg-white shadow-sm transition-all focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100">
                        <PhoneInput
                            defaultCountry="in"
                            value={otp.phone}
                            onChange={(p) => otp.setPhone(p)}
                            disabled={otp.step === "otp"}
                            className="!w-full"
                        />
                    </div>

                    {otp.isDevMode && (
                        <div className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-700 dark:text-amber-300">
                            <Wrench className="h-3.5 w-3.5" aria-hidden />
                            Dev mode — OTP is mocked. Any 6-digit code works.
                        </div>
                    )}

                    {otp.step === "phone" && (
                        <Button
                            variant="primary"
                            className="w-full"
                            onClick={otp.sendOtp}
                            isLoading={otp.sending}
                            disabled={otp.countdown > 0}
                        >
                            {otp.countdown > 0 ? `Resend in ${otp.countdown}s` : "Send OTP"}
                        </Button>
                    )}

                    {otp.step === "otp" && (
                        <div className="space-y-4">
                            <div>
                                <p className="mb-2 text-center text-xs text-slate-500">
                                    Enter the 6-digit code we just sent to{" "}
                                    <span className="font-medium text-slate-700">{otp.phone}</span>
                                </p>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={otp.otp}
                                    onChange={(e) => otp.setOtp(e.target.value.replace(/\D/g, ""))}
                                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-widest text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                                    placeholder="000000"
                                    autoFocus
                                />
                            </div>

                            <Button
                                variant="primary"
                                className="w-full"
                                onClick={onVerify}
                                isLoading={otp.verifying}
                                disabled={otp.otp.length !== 6}
                            >
                                Verify &amp; continue
                            </Button>

                            <div className="flex flex-col items-center gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={otp.sendOtp}
                                    disabled={otp.countdown > 0 || otp.sending}
                                    className="text-sm text-primary-600 transition-colors hover:text-primary-700 disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                    {otp.sending
                                        ? "Sending…"
                                        : otp.countdown > 0
                                          ? `Resend OTP in ${otp.countdown}s`
                                          : "Resend OTP"}
                                </button>
                                <button
                                    type="button"
                                    onClick={otp.changeNumber}
                                    className="text-sm text-slate-500 transition-colors hover:text-slate-700"
                                >
                                    ← Use a different number
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Invisible reCAPTCHA host. MUST stay mounted. */}
                    <div {...otp.recaptchaHostProps} />
                </div>

                {otp.error && (
                    <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-500/25 bg-rose-50 dark:bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
                        {otp.error}
                    </div>
                )}
            </Card>
        </OnboardingShell>
    );
}
