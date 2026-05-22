"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import {
    RecaptchaVerifier,
    signInWithPhoneNumber,
    type ConfirmationResult,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { Card, Button } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { auth, db } from "@/lib/firebase/client";

/**
 * Phone OTP gate for new institute admins. Mirrors the teacher phone
 * onboarding step. Writes the verified phone to users/{uid}.phoneNumber
 * so the institute register endpoint can pick it up.
 *
 * Anti-abuse details:
 *   - 30s resend cooldown.
 *   - Invisible reCAPTCHA via Firebase.
 *   - Dev-mode bypass on localhost only (any 6-digit OTP).
 */
export default function InstitutePhoneOnboardingPage() {
    const router = useRouter();
    const { firebaseUser, user, isAuthenticated, loading: authLoading } = useAuthContext();
    const [phone, setPhone] = useState(user?.phoneNumber || "");
    const [otp, setOtp] = useState("");
    const [step, setStep] = useState<"phone" | "otp">("phone");
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [countdown, setCountdown] = useState(0);

    const isDevMode = typeof window !== "undefined" && window.location.hostname === "localhost";

    const containerId = useRef(`recaptcha-${useId()}-${Date.now()}`);
    const verifierRef = useRef<RecaptchaVerifier | null>(null);

    // If the user is already a paying teacher (and therefore phone-verified),
    // their phoneNumber is already on the user doc — skip straight to the
    // institute wizard.
    useEffect(() => {
        if (!authLoading && user?.phoneNumber) {
            router.replace("/institute/onboarding");
        }
    }, [authLoading, user?.phoneNumber, router]);

    useEffect(() => {
        if (countdown <= 0) return;
        const t = setInterval(() => {
            setCountdown((p) => {
                if (p <= 1) {
                    clearInterval(t);
                    return 0;
                }
                return p - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, [countdown]);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.push("/login?redirect=/institute/onboarding/phone");
    }, [authLoading, isAuthenticated, router]);

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
        if (!container) throw new Error("reCAPTCHA container not found");
        if (verifierRef.current) return verifierRef.current;
        const verifier = new RecaptchaVerifier(auth, containerId.current, {
            size: "invisible",
            callback: () => {
                /* solved */
            },
            "expired-callback": () => setError("reCAPTCHA expired. Try again."),
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
                const mockConfirm = async () => {
                    /* dev */
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
            if (err.code === "auth/invalid-phone-number") msg = "Invalid phone number format. Use +91 ...";
            else if (err.code === "auth/quota-exceeded") msg = "SMS quota exceeded. Try again later.";
            else if (err.code === "auth/captcha-check-failed")
                msg = "reCAPTCHA verification failed. Refresh and try again.";
            setError(msg);
        }
        setSending(false);
    }, [phone, isDevMode, getOrCreateVerifier]);

    const verifyOtp = useCallback(async () => {
        if (!firebaseUser || !confirmationResult || otp.length < 6) {
            setError("Enter the 6-digit OTP.");
            return;
        }
        setVerifying(true);
        setError("");
        try {
            await confirmationResult.confirm(otp);
            // Persist the verified phone to the user doc — the institute
            // register endpoint reads it from there.
            await updateDoc(doc(db, "users", firebaseUser.uid), {
                phoneNumber: phone,
                updatedAt: new Date(),
            });
            router.push("/institute/onboarding");
        } catch (err: any) {
            setError(err.message || "Invalid OTP.");
        }
        setVerifying(false);
    }, [confirmationResult, otp, firebaseUser, phone, router]);

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
                    <h1 className="font-display mt-3 text-2xl font-bold text-slate-900">Verify your phone</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        We&apos;ll text you a one-time code. This step prevents bulk signup abuse.
                    </p>
                </div>

                <Card className="p-6">
                    <div className="phone-input-unified relative flex items-stretch rounded-xl border border-gray-300 bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
                        <PhoneInput
                            defaultCountry="in"
                            value={phone}
                            onChange={(p) => setPhone(p)}
                            disabled={step === "otp"}
                            className="!w-full"
                        />
                    </div>

                    {isDevMode && (
                        <div className="mt-3 text-xs text-center text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                            🛠 Dev mode: OTP is mocked on localhost. Any 6-digit code works.
                        </div>
                    )}

                    {step === "phone" && (
                        <div className="mt-4">
                            <Button
                                variant="primary"
                                className="w-full"
                                onClick={sendOtp}
                                isLoading={sending}
                                disabled={countdown > 0}
                            >
                                {countdown > 0 ? `Resend in ${countdown}s` : "Send OTP"}
                            </Button>
                            <div id={containerId.current} style={{ display: "none" }} />
                        </div>
                    )}

                    {step === "otp" && (
                        <div className="mt-4 space-y-4">
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
                                Verify & continue
                            </Button>
                            <button
                                onClick={() => {
                                    setStep("phone");
                                    setConfirmationResult(null);
                                    setOtp("");
                                    setError("");
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

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm whitespace-pre-wrap">
                            {error}
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
