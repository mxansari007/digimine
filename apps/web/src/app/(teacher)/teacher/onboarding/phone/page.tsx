"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { Card, Button } from "@digimine/ui";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { teacherFetch } from "@/lib/api/teacherFetch";

export default function PhoneOnboardingPage() {
    const router = useRouter();
    const { firebaseUser, isAuthenticated, loading: authLoading } = useAuthContext();
    const [phone, setPhone] = useState("");
    const [otp, setOtp] = useState("");
    const [step, setStep] = useState<"phone" | "otp">("phone");
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [countdown, setCountdown] = useState(0);

    // Dev mode: bypass Firebase phone auth on localhost for easier testing
    const isDevMode = typeof window !== "undefined" && window.location.hostname === "localhost";

    // Unique container ID so React Strict Mode / Fast Refresh never collides
    const containerId = useRef(`recaptcha-${useId()}-${Date.now()}`);
    const verifierRef = useRef<RecaptchaVerifier | null>(null);

    // 30-second cooldown timer to prevent OTP abuse
    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.push("/login");
    }, [authLoading, isAuthenticated, router]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            try {
                verifierRef.current?.clear();
            } catch {
                // ignore
            }
        };
    }, []);

    const getOrCreateVerifier = useCallback((): RecaptchaVerifier => {
        const container = document.getElementById(containerId.current);
        if (!container) {
            throw new Error("reCAPTCHA container not found");
        }

        // If we already have a verifier, reuse it (Firebase handles expiry internally)
        if (verifierRef.current) {
            return verifierRef.current;
        }

        const verifier = new RecaptchaVerifier(auth, containerId.current, {
            size: "invisible",
            callback: () => {
                // reCAPTCHA solved
            },
            "expired-callback": () => {
                setError("reCAPTCHA expired. Please try again.");
            },
        });

        verifierRef.current = verifier;
        return verifier;
    }, []);

    const sendOtp = useCallback(async () => {
        setError("");
        if (!phone || phone.length < 8) {
            setError("Enter a valid phone number.");
            return;
        }

        setSending(true);
        try {
            if (isDevMode) {
                // Dev bypass: simulate OTP send on localhost
                console.log("[DEV MODE] Bypassing Firebase phone auth. Any 6-digit OTP will work.");
                const mockConfirm = async (code: string) => {
                    console.log(`[DEV MODE] Mock OTP confirmed with code: ${code}`);
                };
                setConfirmationResult({ confirm: mockConfirm } as unknown as ConfirmationResult);
                setStep("otp");
                setCountdown(30);
                setSending(false);
                return;
            }

            const verifier = getOrCreateVerifier();
            const result = await signInWithPhoneNumber(auth, phone, verifier);
            setConfirmationResult(result);
            setStep("otp");
            setCountdown(30);
        } catch (err: any) {
            let msg = err.message || "Failed to send OTP.";
            if (err.code === "auth/invalid-app-credential") {
                msg = "Unable to send OTP right now. Please try again later or contact support.";
                console.error("Firebase auth/invalid-app-credential:", err);
            } else if (err.code === "auth/invalid-phone-number") {
                msg = "Invalid phone number format. Use +91 followed by 10 digits.";
            } else if (err.code === "auth/quota-exceeded") {
                msg = "SMS quota exceeded. Try again later.";
            } else if (err.code === "auth/captcha-check-failed") {
                msg = "reCAPTCHA verification failed. Please refresh and try again.";
            }
            setError(msg);
        }
        setSending(false);
    }, [phone, isDevMode, getOrCreateVerifier]);

    const verifyOtp = useCallback(async () => {
        if (!confirmationResult || otp.length < 6) {
            setError("Enter the 6-digit OTP.");
            return;
        }
        setVerifying(true);
        setError("");
        try {
            await confirmationResult.confirm(otp);
            const res = await teacherFetch(firebaseUser, "/api/teacher/onboard", {
                method: "POST",
                body: JSON.stringify({ step: "phone", phone, uid: firebaseUser?.uid }),
            });
            if (!res.ok) {
                const d = await res.json();
                setError(d.error);
                return;
            }
            router.push(`/teacher/onboarding/payment?phone=${encodeURIComponent(phone)}`);
        } catch (err: any) {
            setError(err.message || "Invalid OTP.");
        }
        setVerifying(false);
    }, [confirmationResult, otp, phone, firebaseUser, router]);

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
                            value={phone}
                            onChange={(phone) => setPhone(phone)}
                            disabled={step === "otp"}
                            className="!w-full"
                        />
                    </div>

                    {isDevMode && (
                        <div className="text-xs text-center text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                            🛠️ Dev Mode: OTP verification is mocked on localhost. Any 6-digit code will work.
                        </div>
                    )}

                    {step === "phone" && (
                        <>
                            <Button variant="primary" className="w-full" onClick={sendOtp} isLoading={sending} disabled={countdown > 0}>
                                {countdown > 0 ? `Resend in ${countdown}s` : "Send OTP"}
                            </Button>
                            {/* Unique invisible reCAPTCHA container per component mount */}
                            <div id={containerId.current} style={{ display: "none" }} />
                        </>
                    )}

                    {step === "otp" && (
                        <div className="space-y-4">
                            <input
                                type="text"
                                maxLength={6}
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-2xl text-center tracking-widest focus:ring-2 focus:ring-primary-500"
                                placeholder="000000"
                            />
                            <Button
                                variant="primary"
                                className="w-full"
                                onClick={verifyOtp}
                                isLoading={verifying}
                                disabled={otp.length !== 6}
                            >
                                Verify OTP
                            </Button>
                            <button
                                onClick={() => {
                                    setStep("phone");
                                    setConfirmationResult(null);
                                    setOtp("");
                                    setError("");
                                    // Clear and recreate verifier on number change
                                    try {
                                        verifierRef.current?.clear();
                                    } catch {
                                        // ignore
                                    }
                                    verifierRef.current = null;
                                }}
                                className="w-full text-gray-500 text-sm hover:text-gray-700"
                            >
                                ← Change number
                            </button>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm whitespace-pre-wrap">
                        {error}
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
