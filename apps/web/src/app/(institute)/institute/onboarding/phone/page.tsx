"use client";

/**
 * Phone OTP gate for new institute admins. The `/api/institute/register`
 * endpoint requires `users/{uid}.phoneNumber` to be set before it will
 * create an institute, so this page is the gate.
 *
 * OTP mechanics live in `usePhoneOtp`. The verified phone is persisted
 * via the shared `/api/onboarding/phone` route (server-side, mirrors the
 * teacher flow) rather than a client-side `updateDoc` — see that route's
 * doc-block for the rationale.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { Card, Button } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { usePhoneOtp } from "@/lib/auth/usePhoneOtp";

export default function InstitutePhoneOnboardingPage() {
    const router = useRouter();
    const { firebaseUser, user, isAuthenticated, loading: authLoading } = useAuthContext();

    const otp = usePhoneOtp();

    // If the user already has a verified phone (e.g. existing teacher
    // turning into an institute admin), skip the gate.
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

    // Pre-fill from the user profile if we already have one (e.g. they
    // started a flow earlier). Only runs once when user info loads.
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
            body: JSON.stringify({ phone: otp.phone }),
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            window.alert(d?.error || "We couldn't save that phone number. Please try again.");
            return;
        }
        router.push("/institute/onboarding");
    };

    if (authLoading || !isAuthenticated) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <p className="chip-primary inline-flex">Step 1 of 2</p>
                    <h1 className="font-display mt-3 text-2xl font-bold text-slate-900">
                        Verify your phone
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        We&apos;ll text you a one-time code. This step prevents bulk signup abuse.
                    </p>
                </div>

                <Card className="p-6">
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
                        <div className="mt-3 text-xs text-center text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                            🛠 Dev mode: OTP is mocked. Any 6-digit code works.
                        </div>
                    )}

                    {otp.step === "phone" && (
                        <div className="mt-4">
                            <Button
                                variant="primary"
                                className="w-full"
                                onClick={otp.sendOtp}
                                isLoading={otp.sending}
                                disabled={otp.countdown > 0}
                            >
                                {otp.countdown > 0 ? `Resend in ${otp.countdown}s` : "Send OTP"}
                            </Button>
                        </div>
                    )}

                    {otp.step === "otp" && (
                        <div className="mt-4 space-y-4">
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
                                Verify &amp; continue
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

                    {otp.error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm whitespace-pre-wrap">
                            {otp.error}
                        </div>
                    )}
                </Card>

                <div className="mt-6 flex justify-center gap-2">
                    <div className="h-1.5 w-12 bg-primary-500 rounded-full" />
                    <div className="h-1.5 w-12 bg-gray-300 rounded-full" />
                </div>
            </div>
        </div>
    );
}
