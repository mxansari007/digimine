"use client";

/**
 * Step 3 of teacher onboarding — collect profile details, create the
 * teacher doc on the server, then wait for the client's user snapshot to
 * reflect role="teacher" before navigating to the dashboard.
 *
 * Why the wait matters (this was a real bug): the teacher layout guard
 * checks `isTeacher` immediately on route change. After we POST to
 * `/api/teacher/onboard step=profile`, the server flips
 * `users/{uid}.role` to "teacher" — but the client's Firestore onSnapshot
 * listener doesn't fire instantly (typical propagation: 100–500ms). If we
 * navigated immediately, the guard would see role=null, redirect away,
 * and the user would land on a blank page until they manually reloaded.
 *
 * The fix: stay on this page (which is under the onboarding whitelist,
 * so the guard doesn't kick us out) and render a polished "finalising"
 * screen until `user?.role === "teacher"` shows up. Only then navigate.
 * Fallback: if the snapshot somehow takes more than 8 s, hard-navigate
 * anyway — the dashboard will re-resolve on its own.
 */
import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { FileUpload } from "@digimine/shared";
import { useAuthContext } from "@/contexts/AuthContext";
import { storage } from "@/lib/firebase/client";
import { teacherFetch } from "@/lib/api/teacherFetch";
import {
    OnboardingShell,
    Stepper,
    StepHeader,
    FormField,
    textInputClass,
} from "@/components/onboarding";

const STEPS = ["Phone", "Profile"];

function generateInviteCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "TEACH_";
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

export default function ProfileOnboardingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const { firebaseUser, user, isAuthenticated, loading: authLoading } = useAuthContext();

    // Phone comes from the phone step via the ?phone= query param on a normal
    // forward. But when a user RESUMES (logs back in mid-onboarding, landing
    // here straight from the resume redirect), that param is absent — so fall
    // back to the phone we persisted on their user doc during the phone step.
    // Without this, the profile would be saved with an empty phone.
    const phone = useMemo(
        () => searchParams.get("phone") || user?.phoneNumber || "",
        [searchParams, user?.phoneNumber]
    );

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [inviteCode] = useState(generateInviteCode());
    const [form, setForm] = useState({ institute: "", subjects: "", bio: "" });
    const [fallbackName, setFallbackName] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [finalising, setFinalising] = useState(false);

    // We already collected the user's full name at signup, so don't ask for
    // it again here. Prefer firstName+lastName from the users doc, fall back
    // to displayName from either the Firestore profile or Firebase Auth, and
    // only show an editable field if every source is empty (rare — usually
    // happens for Google-signin accounts that never set a display name).
    const derivedName = (() => {
        const combined = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
        if (combined) return combined;
        if (user?.displayName?.trim()) return user.displayName.trim();
        if (firebaseUser?.displayName?.trim()) return firebaseUser.displayName.trim();
        return "";
    })();
    const effectiveName = derivedName || fallbackName.trim();

    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.push("/login");
    }, [authLoading, isAuthenticated, router]);

    // ─── Bug fix: wait for user.role propagation before navigating ──────
    //
    // When `finalising` flips on after a successful POST, this effect
    // begins watching the auth context's `user.role`. As soon as the
    // Firestore onSnapshot listener picks up the server-side write and
    // role becomes "teacher", we redirect. If the listener stalls beyond
    // 8 s (network jitter / cache eviction), we navigate anyway — the
    // dashboard will resolve on its own once the snapshot lands.
    useEffect(() => {
        if (!finalising) return;
        if (user?.role === "teacher") {
            router.push("/teacher/dashboard");
            return;
        }
        // Hard fallback if the snapshot stalls. This MUST be a timer, not an
        // inline `elapsed > 8000` check — the effect only re-runs when its deps
        // change, so if the role snapshot never arrives the effect never fires
        // again and an inline check would never trip (the user would be stuck
        // on "Finishing setup…" forever). A full-page navigation remounts the
        // auth provider, so the dashboard re-resolves the fresh role itself.
        const t = setTimeout(() => {
            window.location.href = "/teacher/dashboard";
        }, 8000);
        return () => clearTimeout(t);
    }, [finalising, user?.role, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Guard: never save a teacher profile with an empty phone. If we got
        // here without one (skipped/abandoned the phone step), send them back
        // to complete it rather than persisting a blank number.
        if (!phone.trim()) {
            router.push("/teacher/onboarding/phone");
            return;
        }
        if (!firebaseUser || !effectiveName || !form.institute.trim()) {
            setError(
                !effectiveName
                    ? "We couldn't find your name — please add it below."
                    : "Institute is required."
            );
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            const res = await teacherFetch(firebaseUser, "/api/teacher/onboard", {
                method: "POST",
                body: JSON.stringify({
                    step: "profile",
                    uid: firebaseUser.uid,
                    name: effectiveName,
                    institute: form.institute.trim(),
                    phone,
                    bio: form.bio.trim(),
                    avatarUrl: avatarUrl || firebaseUser.photoURL || null,
                    subjects: form.subjects
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    inviteCode,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || "Failed to complete onboarding.");
                setSubmitting(false);
                return;
            }
            // Server wrote successfully — flip into the "finalising" state.
            // The effect above watches `user.role` and navigates when it
            // flips to "teacher" (with a timer fallback if it stalls).
            setFinalising(true);
        } catch (err) {
            setError((err as Error)?.message || "Failed to complete onboarding.");
            setSubmitting(false);
        }
    };

    const disabled = useMemo(
        () => submitting || finalising || !effectiveName || !form.institute.trim(),
        [submitting, finalising, effectiveName, form.institute]
    );

    // Friendly first-name greeting for the header. Falls back to "there".
    const firstName = (user?.firstName || derivedName.split(" ")[0] || "there").trim();

    if (authLoading || !isAuthenticated) {
        return (
            <OnboardingShell maxWidth="md">
                <div className="flex items-center justify-center py-20 text-sm text-slate-500">
                    Loading…
                </div>
            </OnboardingShell>
        );
    }

    // ─── Finalising state — shown between API success and navigation ────
    if (finalising) {
        return (
            <OnboardingShell maxWidth="md">
                <Card className="overflow-hidden p-10">
                    <div className="flex flex-col items-center text-center">
                        <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
                            <span className="absolute inset-0 animate-ping rounded-full bg-primary-200 opacity-60" />
                            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    className="h-8 w-8"
                                    aria-hidden
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </span>
                        </div>
                        <h2 className="font-display text-xl font-bold text-slate-900">
                            Finishing setup…
                        </h2>
                        <p className="mt-2 max-w-xs text-sm text-slate-500">
                            Provisioning your teacher account and starting your 7-day trial.
                        </p>
                        <div className="mt-6 flex w-full flex-col gap-2 text-left text-xs text-slate-500">
                            <FinaliseRow done label="Verified phone" />
                            <FinaliseRow done label="Profile saved" />
                            <FinaliseRow
                                done={user?.role === "teacher"}
                                label="Activating your dashboard"
                            />
                        </div>
                    </div>
                </Card>
            </OnboardingShell>
        );
    }

    return (
        <OnboardingShell maxWidth="2xl">
            <div className="mb-8">
                <Stepper steps={STEPS} current={1} />
            </div>

            <div className="mb-6">
                <StepHeader
                    title={`Welcome, ${firstName}`}
                    subtitle="A few quick details about your teaching and you're ready to invite students."
                />
            </div>

            <Card className="overflow-hidden p-6 sm:p-8">
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Identity confirmation — uses the name captured at signup. */}
                    {derivedName && (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            {(avatarUrl || firebaseUser?.photoURL) ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={avatarUrl || firebaseUser?.photoURL || ""}
                                    alt=""
                                    className="h-9 w-9 flex-shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                                />
                            ) : (
                                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold uppercase text-primary-700">
                                    {derivedName
                                        .split(" ")
                                        .map((s) => s[0])
                                        .filter(Boolean)
                                        .slice(0, 2)
                                        .join("")}
                                </span>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                    {derivedName}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                    {firebaseUser?.email}
                                </p>
                            </div>
                            <span className="hidden text-[11px] font-medium text-slate-400 sm:block">
                                From your signup
                            </span>
                        </div>
                    )}

                    {/* Fallback only when we genuinely don't have a name — e.g. a
                        Google sign-in with no display name set. */}
                    {!derivedName && (
                        <FormField label="Full name" required>
                            <input
                                type="text"
                                required
                                value={fallbackName}
                                onChange={(e) => setFallbackName(e.target.value)}
                                className={textInputClass}
                                placeholder="Dr. A. P. J. Abdul Kalam"
                                disabled={submitting}
                                autoFocus
                            />
                        </FormField>
                    )}

                    <FormField label="Institute" required>
                        <input
                            type="text"
                            required
                            value={form.institute}
                            onChange={(e) =>
                                setForm((p) => ({ ...p, institute: e.target.value }))
                            }
                            className={textInputClass}
                            placeholder="IIT Madras"
                            disabled={submitting}
                            autoFocus={!!derivedName}
                        />
                    </FormField>

                    <FormField label="Subjects" hint="Comma separated">
                        <input
                            type="text"
                            value={form.subjects}
                            onChange={(e) => setForm((p) => ({ ...p, subjects: e.target.value }))}
                            className={textInputClass}
                            placeholder="Physics, Mathematics"
                            disabled={submitting}
                        />
                    </FormField>

                    <FormField label="Bio" hint="Optional">
                        <textarea
                            rows={3}
                            value={form.bio}
                            onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                            className={`${textInputClass} resize-none`}
                            placeholder="Tell students a bit about yourself…"
                            disabled={submitting}
                        />
                    </FormField>

                    <FormField label="Profile photo" hint="Optional">
                        <FileUpload
                            label=""
                            path={`teachers/${firebaseUser?.uid || "draft"}/avatar`}
                            accept="image/*"
                            storage={storage}
                            existingUrl={avatarUrl || firebaseUser?.photoURL || undefined}
                            onUploadComplete={(url) => setAvatarUrl(url)}
                        />
                    </FormField>

                    {/* Note: a teacherInviteCode is generated silently and sent
                        to the server because the schema still requires one and
                        a couple of legacy endpoints read it. We deliberately
                        don't surface it in the UI — student joining happens
                        via class invite codes, not teacher invite codes, so
                        showing it here was just confusing noise. */}

                    {error && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-500">
                            Starts a 7-day free trial. No credit-card auto-charge.
                        </p>
                        <Button
                            variant="primary"
                            type="submit"
                            isLoading={submitting}
                            disabled={disabled}
                            className="sm:min-w-[200px]"
                        >
                            Complete setup
                        </Button>
                    </div>
                </form>
            </Card>
        </OnboardingShell>
    );
}

function FinaliseRow({ done, label }: { done: boolean; label: string }) {
    return (
        <div className="flex items-center gap-2">
            {done ? (
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-2.5 w-2.5"
                        aria-hidden
                    >
                        <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
                            clipRule="evenodd"
                        />
                    </svg>
                </span>
            ) : (
                <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
            )}
            <span className={done ? "text-slate-700" : "text-slate-500"}>{label}</span>
        </div>
    );
}
