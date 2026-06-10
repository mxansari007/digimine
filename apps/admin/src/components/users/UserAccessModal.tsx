"use client";

import { useEffect, useState } from "react";
import { Button } from "@digimine/ui";
import {
    ENTITLEMENT_FEATURES,
    TEACHING_FEATURES,
    TEACHING_LIMITS,
    type User,
} from "@digimine/types";
import { authedFetch } from "@/lib/api";

type Tri = boolean | undefined; // undefined = inherit from plan

/**
 * Per-user access editor. Lets an admin grant or revoke any individual
 * capability for one user, layered on top of their subscription plan.
 * Backed by /api/admin/user-overrides/{uid}.
 */
export function UserAccessModal({ user, onClose }: { user: User; onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [features, setFeatures] = useState<Record<string, boolean>>({});
    const [teachingFeatures, setTeachingFeatures] = useState<Record<string, boolean>>({});
    const [teachingLimits, setTeachingLimits] = useState<Record<string, number>>({});
    const [aiCapMode, setAiCapMode] = useState<"inherit" | "set">("inherit");
    const [aiCap, setAiCap] = useState<string>("");
    const [note, setNote] = useState("");
    const [expiresAt, setExpiresAt] = useState("");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await authedFetch(`/api/admin/user-overrides/${user.id}`);
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                const o = data?.override;
                if (o) {
                    setFeatures(o.features || {});
                    setTeachingFeatures(o.teachingFeatures || {});
                    setTeachingLimits(o.teachingLimits || {});
                    if (typeof o.aiQuestionsPerDay === "number" || o.aiQuestionsPerDay === null) {
                        setAiCapMode("set");
                        setAiCap(o.aiQuestionsPerDay === null ? "" : String(o.aiQuestionsPerDay));
                    }
                    setNote(o.note || "");
                    setExpiresAt(o.expiresAt ? String(o.expiresAt).slice(0, 10) : "");
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message || "Failed to load");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [user.id]);

    const setTri = (
        map: Record<string, boolean>,
        setMap: (m: Record<string, boolean>) => void,
        key: string,
        value: Tri
    ) => {
        const next = { ...map };
        if (value === undefined) delete next[key];
        else next[key] = value;
        setMap(next);
    };

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            const payload: Record<string, unknown> = {
                features,
                teachingFeatures,
                teachingLimits,
                note,
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
            };
            if (aiCapMode === "set") {
                // Blank input means "unlimited" (null); a number caps it.
                payload.aiQuestionsPerDay = aiCap.trim() === "" ? null : Math.max(0, Number(aiCap) || 0);
            }
            const res = await authedFetch(`/api/admin/user-overrides/${user.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Save failed");
            onClose();
        } catch (e) {
            setError((e as Error).message || "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const clearAll = async () => {
        if (!confirm("Remove all overrides for this user? They'll inherit their plan again.")) return;
        setSaving(true);
        try {
            const res = await authedFetch(`/api/admin/user-overrides/${user.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to clear");
            onClose();
        } catch (e) {
            setError((e as Error).message || "Failed to clear");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
            <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Manage access</h3>
                        <p className="text-sm text-slate-500">
                            {user.displayName || "No name"} · {user.email}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                            Overrides win over the user&apos;s plan. &quot;Inherit&quot; leaves a capability to the plan.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
                </div>

                {loading ? (
                    <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
                ) : (
                    <div className="space-y-6">
                        <FeatureGroup
                            title="Student features"
                            items={ENTITLEMENT_FEATURES.map((f) => ({ key: f.key, label: f.label, blurb: f.blurb }))}
                            map={features}
                            onSet={(k, v) => setTri(features, setFeatures, k, v)}
                        />
                        <FeatureGroup
                            title="Teaching features"
                            items={TEACHING_FEATURES.map((f) => ({ key: f.key, label: f.label, blurb: f.blurb }))}
                            map={teachingFeatures}
                            onSet={(k, v) => setTri(teachingFeatures, setTeachingFeatures, k, v)}
                        />

                        <LimitsGroup limits={teachingLimits} setLimits={setTeachingLimits} />

                        <div className="rounded-xl border border-slate-200 p-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={aiCapMode === "set"}
                                    onChange={(e) => setAiCapMode(e.target.checked ? "set" : "inherit")}
                                />
                                Override daily AI-question cap
                            </label>
                            {aiCapMode === "set" && (
                                <div className="mt-2">
                                    <input
                                        type="number"
                                        min={0}
                                        value={aiCap}
                                        onChange={(e) => setAiCap(e.target.value)}
                                        placeholder="blank = unlimited, 0 = disabled"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block text-sm">
                                <span className="text-slate-600">Expires (optional)</span>
                                <input
                                    type="date"
                                    value={expiresAt}
                                    onChange={(e) => setExpiresAt(e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-slate-600">Note (optional)</span>
                                <input
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="e.g. comp account for partner"
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                />
                            </label>
                        </div>

                        {error && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
                        )}

                        <div className="flex items-center justify-between">
                            <Button variant="outline" size="sm" onClick={clearAll} disabled={saving}>
                                Clear all overrides
                            </Button>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                                <Button variant="primary" onClick={save} isLoading={saving}>Save</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function FeatureGroup({
    title,
    items,
    map,
    onSet,
}: {
    title: string;
    items: { key: string; label: string; blurb: string }[];
    map: Record<string, boolean>;
    onSet: (key: string, value: Tri) => void;
}) {
    return (
        <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
            <div className="space-y-1.5">
                {items.map((it) => {
                    const value: Tri = it.key in map ? map[it.key] : undefined;
                    return (
                        <div key={it.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-800">{it.label}</div>
                                <div className="truncate text-xs text-slate-400">{it.blurb}</div>
                            </div>
                            <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200 text-xs">
                                <Seg active={value === undefined} onClick={() => onSet(it.key, undefined)} label="Inherit" />
                                <Seg active={value === true} onClick={() => onSet(it.key, true)} label="Grant" tone="grant" />
                                <Seg active={value === false} onClick={() => onSet(it.key, false)} label="Deny" tone="deny" />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function LimitsGroup({
    limits,
    setLimits,
}: {
    limits: Record<string, number>;
    setLimits: (m: Record<string, number>) => void;
}) {
    const setOne = (key: string, value: number | undefined) => {
        const next = { ...limits };
        if (value === undefined) delete next[key];
        else next[key] = value;
        setLimits(next);
    };
    return (
        <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Teaching limits
            </p>
            <p className="mb-2 text-xs text-slate-400">
                Tick to override the plan&apos;s cap for this user. <span className="font-mono">-1</span> = unlimited.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
                {TEACHING_LIMITS.map((l) => {
                    const overridden = l.key in limits;
                    return (
                        <div
                            key={l.key}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                        >
                            <label className="flex min-w-0 items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={overridden}
                                    onChange={(e) => setOne(l.key, e.target.checked ? -1 : undefined)}
                                />
                                <span className="truncate font-medium text-slate-800" title={l.blurb}>
                                    {l.label}
                                </span>
                            </label>
                            <input
                                type="number"
                                disabled={!overridden}
                                value={overridden ? limits[l.key] : ""}
                                onChange={(e) =>
                                    setOne(l.key, e.target.value === "" ? -1 : Math.trunc(Number(e.target.value)))
                                }
                                placeholder="−1"
                                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function Seg({
    active,
    onClick,
    label,
    tone,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    tone?: "grant" | "deny";
}) {
    const activeCls =
        tone === "grant"
            ? "bg-emerald-600 text-white"
            : tone === "deny"
              ? "bg-rose-600 text-white"
              : "bg-slate-700 text-white";
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-2.5 py-1 font-medium transition-colors ${active ? activeCls : "bg-white text-slate-500 hover:bg-slate-50"}`}
        >
            {label}
        </button>
    );
}
