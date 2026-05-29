"use client";

/**
 * Step 1 of teacher onboarding — verify the teacher's phone number with a
 * Firebase OTP, then ping `/api/teacher/onboard` (step="phone") so the
 * server can run uniqueness checks against the `teachers` collection.
 *
 * The OTP mechanics live in `usePhoneOtp` — see that hook for why we no
 * longer cache the RecaptchaVerifier or hide the host with `display: none`.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { Card, Button } from "@digimine/ui";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { Wrench } from "lucide-react";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { usePhoneOtp } from "@/lib/auth/usePhoneOtp";
import {
    OnboardingShell,
    Stepper,
    StepHeader,
} from "@/components/onboarding";

const STEPS = ["Phone", "Profile"];

export default function PhoneOnboardingPage() {
    const router = useRouter();
    const { firebaseUser, user, isAuthenticated, loading: authLoading } = useAuthContext();

    const otp = usePhoneOtp();

    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.push("/login");
    }, [authLoading, isAuthenticated, router]);

    // If the phone step is already done (resume, browser-back, or a slow
    // redirect that left the user here), move them forward instead of letting
    // them re-verify — a second phone POST would 409 on the uniqueness check
    // and strand them. Honour the persisted onboardingStep / role.
    useEffect(() => {
        if (authLoading || !user) return;
        if (user.role === "teacher" || user.onboardingStep === "complete") {
            router.replace("/teacher/dashboard");
        } else if (user.onboardingStep === "teacher:profile" && user.phoneNumber) {
            // Only forward to the profile step if a verified phone actually
            // exists. Without the phoneNumber guard this fought the profile
            // page's empty-phone guard (which sends users back HERE when the
            // phone is missing) and the two ping-ponged in a redirect loop.
            // If the step says "profile" but no phone is on record, let the
            // user (re-)complete the phone step here, which sets it.
            router.replace("/teacher/onboarding/profile");
        }
    }, [authLoading, user?.role, user?.onboardingStep, router, user]);

    const onVerify = async () => {
        const result = await otp.verifyOtp();
        if (!result) return;

        const res = await teacherFetch(firebaseUser, "/api/teacher/onboard", {
            method: "POST",
            body: JSON.stringify({ step: "phone", phone: otp.phone, uid: firebaseUser?.uid }),
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            // The OTP confirmation is single-use — once verifyOtp() consumes it,
            // re-entering the same code can't work. Reset all the way back to the
            // phone-entry step so the user can pick a different number (e.g. on a
            // "already registered" 409) or request a fresh code, instead of being
            // stranded on a dead OTP field.
            otp.changeNumber();
            window.alert(d?.error || "We couldn't save that phone number. Please try again.");
            return;
        }
        router.push(`/teacher/onboarding/profile?phone=${encodeURIComponent(otp.phone)}`);
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
                    subtitle="We'll text you a 6-digit code to confirm it's really you. Used only for account security."
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
                        <div className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
                            <Wrench className="h-3.5 w-3.5" aria-hidden />
                            Dev mode — OTP verification is mocked. Any 6-digit code will work.
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

                    {/* Invisible reCAPTCHA host. MUST stay mounted in the
                        layout flow. Spread props from the hook — do NOT
                        override style with display:none. */}
                    <div {...otp.recaptchaHostProps} />
                </div>

                {otp.error && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                        {otp.error}
                    </div>
                )}
            </Card>
        </OnboardingShell>
    );
}
