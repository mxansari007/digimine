"use client";

/**
 * Role selection — the gate that turns a freshly-authenticated, role-less
 * user into a `customer` / `teacher` / `institute_admin`. Reached via the
 * login flow whenever `getRedirectPath` detects an orphan (signed-in but
 * `role === null`).
 *
 *  - Student: writes `role=customer` and lets the snapshot-driven useEffect
 *    forward to `next` (or `/dashboard`). We deliberately do NOT call
 *    `router.push` inline after `updateDoc`, because the destination layout
 *    runs immediately and reads `user.role` before the Firestore snapshot
 *    listener propagates — it would see the stale `null`, bounce them back
 *    here, and the screen would appear "stuck". Waiting for the local state
 *    to reflect the write keeps everything in sync.
 *
 *  - Teacher / Institute: navigate straight to the onboarding wizard, which
 *    writes the role atomically alongside the role-specific subdocument
 *    (teachers/{uid}, institutes/{instituteId}). We thread `?next=` through
 *    so future onboarding-end logic can return them to where they came from.
 *
 *  - `?next=`: untrusted input; we sanitize via `safeNext` to allow only
 *    same-origin relative paths and block open-redirect payloads.
 *
 * The auth layout already renders the brand header + gradient background,
 * so this file only contributes the centered content block.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { doc, setDoc } from "firebase/firestore";

import { useAuthContext } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase/client";
import { signOut as firebaseSignOut } from "@/lib/firebase/auth";

function safeNext(raw: string | null): string | null {
    if (!raw) return null;
    if (!raw.startsWith("/") || raw.startsWith("//")) return null;
    return raw;
}

type RoleChoice = "student" | "teacher" | "institute";

type RoleOption = {
    id: RoleChoice;
    title: string;
    blurb: string;
    accent: "primary" | "amber" | "emerald";
    bullets: string[];
    icon: (p: { className?: string }) => JSX.Element;
};

const StudentIcon = ({ className = "" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6" />
        <path d="M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
    </svg>
);
const TeacherIcon = ({ className = "" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M9 7h6M9 11h6" />
    </svg>
);
const InstituteIcon = ({ className = "" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <path d="M5 21V8l7-5 7 5v13" />
        <path d="M9 21v-6h6v6" />
        <path d="M10 9h.01M14 9h.01M10 12h.01M14 12h.01" />
    </svg>
);

const ROLE_OPTIONS: RoleOption[] = [
    {
        id: "student",
        title: "I'm a Student",
        blurb: "Practice, learn, and crack placements.",
        accent: "primary",
        icon: StudentIcon,
        bullets: ["DSA + SQL practice", "Mock tests & quizzes", "Articles + roadmaps"],
    },
    {
        id: "teacher",
        title: "I'm a Teacher",
        blurb: "Publish content and earn.",
        accent: "amber",
        icon: TeacherIcon,
        bullets: ["Sell courses & tests", "Track your students", "Get paid monthly"],
    },
    {
        id: "institute",
        title: "I run an Institute",
        blurb: "Manage your batches end-to-end.",
        accent: "emerald",
        icon: InstituteIcon,
        bullets: ["Onboard teachers", "Institute-wide tests", "Track batches"],
    },
];

const ACCENT_STYLES: Record<RoleOption["accent"], { ring: string; chip: string; icon: string }> = {
    primary: {
        ring: "hover:border-primary-300 hover:shadow-primary-100/50",
        chip: "bg-primary-50 text-primary-700",
        icon: "text-primary-600",
    },
    amber: {
        ring: "hover:border-amber-300 hover:shadow-amber-100/50",
        chip: "bg-amber-50 text-amber-700",
        icon: "text-amber-600",
    },
    emerald: {
        ring: "hover:border-emerald-300 hover:shadow-emerald-100/50",
        chip: "bg-emerald-50 text-emerald-700",
        icon: "text-emerald-600",
    },
};

export default function RoleSelectPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = useMemo(() => safeNext(searchParams.get("next")), [searchParams]);

    const { user, firebaseUser, loading, isAuthenticated } = useAuthContext();
    const [picking, setPicking] = useState<RoleChoice | null>(null);
    const [error, setError] = useState("");

    // Snapshot-driven redirect: triggers in two scenarios:
    //   1. Already-roled user lands here directly  → bounce to home/next.
    //   2. We just wrote role=customer above       → snapshot fires, this
    //      fires, we navigate. Means the destination layout sees the fresh
    //      role and doesn't bounce us back to this page.
    useEffect(() => {
        if (loading) return;
        if (!isAuthenticated) {
            router.push("/login");
            return;
        }
        if (user?.role) {
            if (user.role === "teacher") router.push(next || "/teacher/dashboard");
            else if (user.role === "institute_admin") router.push(next || "/institute/dashboard");
            else router.push(next || "/dashboard");
        }
    }, [loading, isAuthenticated, user, next, router]);

    const selectRole = async (role: RoleChoice) => {
        if (!firebaseUser || picking) return;
        setPicking(role);
        setError("");
        try {
            if (role === "teacher") {
                // Persist the choice so a sign-out / sign-in mid-onboarding
                // resumes at the right page instead of dumping the user back
                // here. Firestore rules let owners update any field except
                // `role`, so this merge write is safe from the client.
                await setDoc(
                    doc(db, "users", firebaseUser.uid),
                    { onboardingStep: "teacher:phone", updatedAt: new Date() },
                    { merge: true }
                );
                const q = next ? `?next=${encodeURIComponent(next)}` : "";
                router.push(`/teacher/onboarding/phone${q}`);
                return;
            }
            if (role === "institute") {
                await setDoc(
                    doc(db, "users", firebaseUser.uid),
                    { onboardingStep: "institute:phone", updatedAt: new Date() },
                    { merge: true }
                );
                const q = next ? `?next=${encodeURIComponent(next)}` : "";
                router.push(`/institute/onboarding${q}`);
                return;
            }

            // Student → server-side promotion (Firestore rules block self-edit
            // of the `role` field for non-bootstrap-admins). The route writes
            // role=customer via Admin SDK; the snapshot listener then fires
            // and the useEffect above forwards to `next || /dashboard`.
            const token = await firebaseUser.getIdToken();
            // Bound the request so a hung connection can't leave the user
            // staring at a "Setting up…" spinner forever — an abort surfaces a
            // retryable error (caught below) instead of silently hanging.
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            let res: Response;
            try {
                res = await fetch("/api/auth/role-select", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ role: "student" }),
                    signal: controller.signal,
                });
            } catch (fetchErr) {
                if ((fetchErr as Error)?.name === "AbortError") {
                    throw new Error("That took too long. Check your connection and try again.");
                }
                throw fetchErr;
            } finally {
                clearTimeout(timeout);
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Failed (${res.status}).`);
            }
            // Don't router.push here — see file header. The snapshot will
            // fire shortly with role=customer and the redirect useEffect
            // above will navigate us to `next || /dashboard`.
            //
            // Defensive fallback: if the snapshot is delayed (network
            // hiccup, listener disconnected), do a HARD navigation after
            // 3s. router.push would race the redirect effect and the
            // (dashboard) layout guard — which sees role=null and bounces
            // back to /role-select, looping the user. window.location.href
            // re-establishes auth from scratch so the role lands before
            // the layout guard runs.
            const target = next || "/dashboard";
            window.setTimeout(() => {
                if (typeof window !== "undefined" && window.location.pathname === "/role-select") {
                    window.location.href = target;
                }
            }, 3000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
            setPicking(null);
        }
    };

    if (loading || !isAuthenticated || user?.role) {
        // While auth is resolving — or while the snapshot-driven redirect is
        // about to fire — keep the page quiet rather than flash a half-state.
        return (
            <div className="text-sm text-slate-500" aria-busy>
                Loading…
            </div>
        );
    }

    const firstName = user?.firstName || user?.displayName?.split(" ")[0] || null;

    return (
        <div className="w-full max-w-5xl">
            <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary-600">
                    One last step
                </p>
                <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                    {firstName ? `Welcome, ${firstName}.` : "Welcome to PlacementRanker."}
                </h1>
                <p className="mx-auto mt-3 max-w-xl text-slate-600">
                    Pick how you&apos;ll use PlacementRanker. You can&apos;t change this later
                    without contacting support — choose carefully.
                </p>
            </div>

            {error && (
                <div
                    role="alert"
                    className="mx-auto mt-6 max-w-md rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700"
                >
                    {error}
                </div>
            )}

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {ROLE_OPTIONS.map((opt) => {
                    const styles = ACCENT_STYLES[opt.accent];
                    const Icon = opt.icon;
                    const isPicking = picking === opt.id;
                    const otherPicking = !!picking && !isPicking;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => selectRole(opt.id)}
                            disabled={!!picking}
                            aria-busy={isPicking}
                            className={`group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all ${styles.ring} hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm`}
                        >
                            <div
                                className={`flex h-12 w-12 items-center justify-center rounded-xl ${styles.chip}`}
                            >
                                <Icon className={`h-6 w-6 ${styles.icon}`} />
                            </div>

                            <h2 className="mt-5 font-display text-lg font-bold text-slate-900">
                                {opt.title}
                            </h2>
                            <p className="mt-1 text-sm text-slate-600">{opt.blurb}</p>

                            <ul className="mt-5 space-y-2 text-sm text-slate-600">
                                {opt.bullets.map((b) => (
                                    <li key={b} className="flex items-start gap-2">
                                        <svg
                                            className={`mt-0.5 h-4 w-4 shrink-0 ${styles.icon}`}
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            aria-hidden
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4L8.5 12.1l6.8-6.8a1 1 0 011.4 0z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                        <span>{b}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-6 flex items-center justify-between text-sm font-semibold text-slate-700">
                                <span className="inline-flex items-center gap-1.5">
                                    {isPicking ? "Setting up…" : "Continue"}
                                    {!isPicking && (
                                        <span
                                            aria-hidden
                                            className="transition-transform group-hover:translate-x-0.5"
                                        >
                                            →
                                        </span>
                                    )}
                                </span>
                                {isPicking && (
                                    <span
                                        className={`h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${styles.icon}`}
                                        aria-hidden
                                    />
                                )}
                            </div>

                            {otherPicking && (
                                <div
                                    aria-hidden
                                    className="pointer-events-none absolute inset-0 rounded-2xl bg-white/40"
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            <p className="mt-8 text-center text-xs text-slate-500">
                Signed in as <span className="font-medium text-slate-700">{firebaseUser?.email}</span>.
                Wrong account?{" "}
                <button
                    type="button"
                    className="font-medium text-primary-700 hover:underline"
                    onClick={async () => {
                        try {
                            await firebaseSignOut();
                        } finally {
                            router.push("/login");
                        }
                    }}
                >
                    Sign out
                </button>
            </p>
        </div>
    );
}
