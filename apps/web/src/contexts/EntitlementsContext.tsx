"use client";

/**
 * Client-side entitlements provider.
 *
 * Fetches the caller's resolved entitlements from `/api/subscription/me`
 * once per auth change and caches them in React context. Every gated page
 * reads from here via `useEntitlements()` instead of fetching again.
 *
 *   - Anonymous users get the free plan (or all-access in launch mode).
 *   - Sign-in / sign-out triggers a refetch.
 *   - `refresh()` is exposed for after-checkout flows.
 *
 * Convenience helpers:
 *   - `hasFeature(feature)` — true under any plan (incl. launch mode) that
 *     grants the feature. Use this to gate UI.
 *   - `isPremium` — true ONLY when the user is on a paid, active plan.
 *     Use this for the "Premium" badge / billing copy. Does NOT return
 *     true in launch mode (when enforcement is off) — that's deliberate.
 */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import type {
    EntitlementFeature,
    ResolvedEntitlements,
} from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

interface EntitlementsContextValue {
    entitlements: ResolvedEntitlements | null;
    loading: boolean;
    /** True after at least one fetch has resolved (success or failure). */
    ready: boolean;
    /** Does the active plan grant this feature? Always true in launch mode. */
    hasFeature: (feature: EntitlementFeature) => boolean;
    /** True only when the user is on a paid, active plan (NOT in launch mode). */
    isPremium: boolean;
    /** Force a refetch — call this after checkout/grant. */
    refresh: () => Promise<void>;
}

const EntitlementsContext = createContext<EntitlementsContextValue | undefined>(undefined);

interface Props {
    children: ReactNode;
}

export function EntitlementsProvider({ children }: Props) {
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const [entitlements, setEntitlements] = useState<ResolvedEntitlements | null>(null);
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);
    // Guards against overlapping fetches when auth churns on mount.
    const inFlightRef = useRef(false);

    const fetchEntitlements = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setLoading(true);
        try {
            const res = firebaseUser
                ? await teacherFetch(firebaseUser, "/api/subscription/me")
                : await fetch("/api/subscription/me");
            const data = await res.json();
            if (res.ok && data?.entitlements) {
                // Normalise the date so Date helpers work client-side.
                const e = data.entitlements as ResolvedEntitlements;
                if (e.expiresAt && typeof e.expiresAt === "string") {
                    e.expiresAt = new Date(e.expiresAt);
                }
                setEntitlements(e);
            } else {
                setEntitlements(null);
            }
        } catch {
            // Fail open — the server gates still enforce; UI just won't show paywalls.
            setEntitlements(null);
        } finally {
            inFlightRef.current = false;
            setLoading(false);
            setReady(true);
        }
    }, [firebaseUser]);

    // Refetch on auth change (sign-in / sign-out / token refresh).
    useEffect(() => {
        if (authLoading) return;
        fetchEntitlements();
    }, [authLoading, fetchEntitlements]);

    const hasFeature = useCallback(
        (feature: EntitlementFeature) => {
            if (!entitlements) return false;
            return Boolean(entitlements.features?.[feature]);
        },
        [entitlements]
    );

    // Strict premium check, sourced from `isPaid` on the server resolver —
    // true iff the user has an active subscription on a paid (non-free)
    // plan. Independent of the kill switch, so `access: "premium"` gates
    // work correctly during launch mode too.
    const isPremium = Boolean(entitlements?.isPaid);

    const value: EntitlementsContextValue = {
        entitlements,
        loading,
        ready,
        hasFeature,
        isPremium,
        refresh: fetchEntitlements,
    };

    return (
        <EntitlementsContext.Provider value={value}>
            {children}
        </EntitlementsContext.Provider>
    );
}

export function useEntitlements(): EntitlementsContextValue {
    const ctx = useContext(EntitlementsContext);
    if (!ctx) {
        throw new Error("useEntitlements must be used within an EntitlementsProvider");
    }
    return ctx;
}
