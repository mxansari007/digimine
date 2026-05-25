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
import { teacherFetch } from "@/lib/api/teacherFetch";
import { usePhoneOtp } from "@/lib/auth/usePhoneOtp";

export default function PhoneOnboardingPage() {
    const router = useRouter();
    const { firebaseUser, isAuthenticated, loading: authLoading } = useAuthContext();

    const otp = usePhoneOtp();

    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.push("/login");
    }, [authLoading, isAuthenticated, router]);

    const onVerify = async () => {
        const result = await otp.verifyOtp();
        if (!result) return; // error already set on the hook

        // Uniqueness check + server-side phone-on-user write live in the
        // teacher onboard endpoint.
        const res = await teacherFetch(firebaseUser, "/api/teacher/onboard", {
            method: "POST",
            body: JSON.stringify({ step: "phone", phone: otp.phone, uid: firebaseUser?.uid }),
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            otp.setOtp(""); // let them retry the same OTP with a different number
            // Surface server-side rejection (e.g. phone already in use).
            // The hook's `error` is reserved for OTP-level failures; for
            // server errors we route through a window alert until we have
            // a shared toast.
            window.alert(d?.error || "We couldn't save that phone number. Please try again.");
            return;
        }
        router.push(`/teacher/onboarding/payment?phone=${encodeURIComponent(otp.phone)}`);
    };

    if (authLoading || !isAuthenticated) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-100">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
            <Card className="w-full max-w-md p-8">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Verify Your Phone</h1>
                    <p className="mt-1 text-gray-500">Step 1 of 3</p>
                </div>

                <div className="space-y-4">
                    <div className="phone-input-unified relative flex items-stretch rounded-xl border border-gray-300 bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
                        <PhoneInput
                            defaultCountry="in"
                            value={otp.phone}
                            onChange={(p) => otp.setPhone(p)}
                            disabled={otp.step === "otp"}
                            className="!w-full"
                        />
                    </div>

                    {otp.isDevMode && (
                        <div className="text-xs text-center text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                            🛠️ Dev Mode: OTP verification is mocked. Any 6-digit code will work.
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
                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                value={otp.otp}
                                onChange={(e) => otp.setOtp(e.target.value.replace(/\D/g, ""))}
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-2xl text-center tracking-widest focus:ring-2 focus:ring-primary-500"
                                placeholder="000000"
                            />
                            <Button
                                variant="primary"
                                className="w-full"
                                onClick={onVerify}
                                isLoading={otp.verifying}
                                disabled={otp.otp.length !== 6}
                            >
                                Verify OTP
                            </Button>

                            {/* Resend OTP — 30s server-enforced cooldown. The
                                button stays disabled until `countdown` ticks
                                to 0; abuse is bounded server-side via
                                /api/onboarding/otp-send. */}
                            <button
                                type="button"
                                onClick={otp.sendOtp}
                                disabled={otp.countdown > 0 || otp.sending}
                                className="w-full text-sm text-primary-600 hover:text-primary-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                            >
                                {otp.sending
                                    ? "Sending..."
                                    : otp.countdown > 0
                                    ? `Resend OTP in ${otp.countdown}s`
                                    : "Resend OTP"}
                            </button>

                            <button
                                type="button"
                                onClick={otp.changeNumber}
                                className="w-full text-gray-500 text-sm hover:text-gray-700"
                            >
                                ← Change number
                            </button>
                        </div>
                    )}

                    {/* The invisible reCAPTCHA host MUST stay mounted in the
                        layout flow. Do not wrap in a conditional or set
                        display:none — Firebase needs a real DOM node to
                        mount its iframe into. */}
                    <div {...otp.recaptchaHostProps} />
                </div>

                {otp.error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm whitespace-pre-wrap">
                        {otp.error}
                    </div>
                )}

                <div className="flex justify-center gap-2 mt-6">
                    <div className="h-1.5 w-12 bg-primary-500 rounded-full" />
                    <div className="h-1.5 w-12 bg-gray-300 rounded-full" />
                    <div className="h-1.5 w-12 bg-gray-300 rounded-full" />
                </div>
            </Card>
        </div>
    );
}
