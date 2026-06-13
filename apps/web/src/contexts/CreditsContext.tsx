"use client";

/**
 * Client-side AI credits provider.
 *
 * Fetches the credit economy's public config (`/api/credits/config` →
 * whether metering is enabled) and, for a signed-in user, their wallet
 * balance (`/api/credits/wallet`). Mounted once near the root so the
 * header pill and every dashboard sidebar can read a single shared copy
 * instead of each fetching their own.
 *
 *   - `enabled` mirrors the admin master switch. When false, NO credit
 *     UI should render anywhere (AI features behave as before credits).
 *   - `balance` is null until the wallet resolves (or for anon users).
 *   - Sign-in / sign-out triggers a refetch; `refresh()` is exposed for
 *     after-purchase flows to update the balance immediately.
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
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

interface CreditsContextValue {
    /** Admin master switch — when false, hide all credit UI. */
    enabled: boolean;
    /** Wallet balance, or null while loading / for anonymous users. */
    balance: number | null;
    loading: boolean;
    /** True after at least one fetch has resolved. */
    ready: boolean;
    /** Force a refetch — call after a purchase to refresh the balance. */
    refresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextValue | undefined>(undefined);

export function CreditsProvider({ children }: { children: ReactNode }) {
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const [enabled, setEnabled] = useState(false);
    const [balance, setBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);
    const inFlightRef = useRef(false);

    const fetchCredits = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setLoading(true);
        try {
            const cfgRes = await fetch("/api/credits/config");
            const cfg = await cfgRes.json().catch(() => null);
            const on = Boolean(cfg?.enabled);
            setEnabled(on);

            // Only spend a request on the wallet when metering is on AND
            // someone's signed in — anon users have nothing to show.
            if (on && firebaseUser) {
                const walletRes = await teacherFetch(firebaseUser, "/api/credits/wallet");
                const wallet = await walletRes.json().catch(() => null);
                setBalance(typeof wallet?.balance === "number" ? wallet.balance : 0);
            } else {
                setBalance(null);
            }
        } catch {
            // Fail closed on the UI side — hide the pill rather than show a
            // broken balance. Server gates still enforce charges regardless.
            setEnabled(false);
            setBalance(null);
        } finally {
            inFlightRef.current = false;
            setLoading(false);
            setReady(true);
        }
    }, [firebaseUser]);

    useEffect(() => {
        if (authLoading) return;
        fetchCredits();
    }, [authLoading, fetchCredits]);

    const value: CreditsContextValue = {
        enabled,
        balance,
        loading,
        ready,
        refresh: fetchCredits,
    };

    return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function useCredits(): CreditsContextValue {
    const ctx = useContext(CreditsContext);
    if (!ctx) {
        throw new Error("useCredits must be used within a CreditsProvider");
    }
    return ctx;
}
