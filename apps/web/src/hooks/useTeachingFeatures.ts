"use client";

/**
 * Hook for teacher / institute pages that need to gate UI on the
 * admin-configurable teaching-feature catalog (template download,
 * markdown import, AI question generation).
 *
 * Single source of truth: hits /api/me/teaching-features once per
 * auth change. Returns:
 *   - `has(feature)` — true iff the user's plan unlocks it
 *   - `aiEnabled` — global kill-switch state (separate from per-plan
 *     gate; both must be true for AI generation to actually work)
 *   - `aiPublic` — non-secret AI provider details (model, cap)
 *   - `scope` / `planName` — useful for the upgrade copy
 *
 * Errors fail closed: on network failure we treat all features as
 * locked rather than fail-open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
    UNLIMITED_TEACHING_LIMITS,
    type TeachingFeature,
    type TeachingFeatureMap,
    type TeachingLimits,
} from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type AiPublic = {
    enabled: boolean;
    provider: string;
    model: string;
    maxQuestionsPerRequest: number;
};

type AiQuota = {
    /** Questions generated today (IST). */
    used: number;
    /** Plan's per-day cap. `null` = unlimited, `0` = disabled. */
    cap: number | null;
};

interface State {
    loading: boolean;
    error: string | null;
    scope: "teacher" | "institute" | null;
    /** Stable plan code on the user's subscription doc, e.g. "teacher-pro". */
    planCode: string | null;
    planName: string | null;
    map: TeachingFeatureMap;
    limits: TeachingLimits;
    ai: AiPublic;
    aiQuota: AiQuota;
}

const DEFAULT_AI: AiPublic = {
    enabled: false,
    provider: "deepseek",
    model: "deepseek-chat",
    maxQuestionsPerRequest: 10,
};

const DEFAULT_QUOTA: AiQuota = { used: 0, cap: 0 };

export function useTeachingFeatures() {
    const { firebaseUser } = useAuthContext();
    const [state, setState] = useState<State>({
        loading: true,
        error: null,
        scope: null,
        planCode: null,
        planName: null,
        map: {},
        limits: { ...UNLIMITED_TEACHING_LIMITS },
        ai: DEFAULT_AI,
        aiQuota: DEFAULT_QUOTA,
    });

    // Bumping this counter re-runs the fetch effect — used by `refresh()`
    // after an AI generation so the quota badge updates without reload.
    const [refreshTick, setRefreshTick] = useState(0);
    const cancelRef = useRef<{ cancelled: boolean } | null>(null);

    useEffect(() => {
        let cancelled = false;
        cancelRef.current = { cancelled: false };
        if (!firebaseUser) {
            setState({
                loading: false,
                error: null,
                scope: null,
                planCode: null,
                planName: null,
                map: {},
                limits: { ...UNLIMITED_TEACHING_LIMITS },
                ai: DEFAULT_AI,
                aiQuota: DEFAULT_QUOTA,
            });
            return;
        }
        (async () => {
            try {
                const res = await teacherFetch(firebaseUser, "/api/me/teaching-features");
                const data = await res.json();
                if (cancelled) return;
                if (!res.ok) {
                    setState((s) => ({ ...s, loading: false, error: data.error || "Failed" }));
                    return;
                }
                setState({
                    loading: false,
                    error: null,
                    scope: data.scope || null,
                    planCode: data.planCode || null,
                    planName: data.planName || null,
                    map: data.teachingFeatures || {},
                    limits: {
                        ...UNLIMITED_TEACHING_LIMITS,
                        ...(data.teachingLimits || {}),
                    },
                    ai: { ...DEFAULT_AI, ...(data.ai || {}) },
                    aiQuota: data.aiQuota
                        ? { used: data.aiQuota.used ?? 0, cap: data.aiQuota.cap ?? null }
                        : DEFAULT_QUOTA,
                });
            } catch (err) {
                if (cancelled) return;
                setState((s) => ({
                    ...s,
                    loading: false,
                    error: (err as Error).message || "Failed",
                }));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [firebaseUser, refreshTick]);

    const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

    const has = useCallback(
        (feature: TeachingFeature): boolean => Boolean(state.map[feature]),
        [state.map]
    );

    return {
        loading: state.loading,
        error: state.error,
        scope: state.scope,
        planCode: state.planCode,
        planName: state.planName,
        has,
        /** Numeric usage caps from the resolved plan. -1 = unlimited. */
        limits: state.limits,
        aiEnabled: state.ai.enabled,
        aiPublic: state.ai,
        aiQuota: state.aiQuota,
        upgradeHref:
            state.scope === "institute" ? "/pricing/institute" : "/pricing/teacher",
        /** Re-fetch teaching features (e.g. after an AI generation flips the quota). */
        refresh,
    };
}
