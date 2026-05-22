"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@digimine/ui";
import {
    ENTITLEMENT_FEATURES,
    ENTITLEMENT_QUOTAS,
    formatINR,
    type AppSubscriptionPlan,
    type PromoCode,
    type PromoType,
    type SubscriptionGlobalConfig,
} from "@digimine/types";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    deletePlan,
    deletePromo,
    getSubscriptionConfig,
    listPlans,
    listPromos,
    savePlan,
    savePromo,
    saveSubscriptionConfig,
} from "@/lib/firestore/subscription";

function emptyPlan(): Partial<AppSubscriptionPlan> {
    return {
        code: "",
        name: "",
        tagline: "",
        highlights: [],
        priceINR: 0,
        compareAtINR: null,
        interval: "monthly",
        features: {},
        quotas: {},
        isFree: false,
        isActive: true,
        recommended: false,
        badge: null,
        sortOrder: 0,
    };
}

export default function SubscriptionManagerPage() {
    const { firebaseUser } = useAdminAuth();
    const [config, setConfig] = useState<SubscriptionGlobalConfig | null>(null);
    const [plans, setPlans] = useState<AppSubscriptionPlan[]>([]);
    const [promos, setPromos] = useState<PromoCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingCfg, setSavingCfg] = useState(false);
    const [editingPlan, setEditingPlan] = useState<(Partial<AppSubscriptionPlan> & { id?: string }) | null>(null);
    const [editingPromo, setEditingPromo] = useState<Partial<PromoCode> | null>(null);
    const [msg, setMsg] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [c, p, pr] = await Promise.all([getSubscriptionConfig(), listPlans(), listPromos()]);
            setConfig(c);
            setPlans(p);
            setPromos(pr);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const flash = (t: string) => {
        setMsg(t);
        setTimeout(() => setMsg(""), 3000);
    };

    const saveConfig = async () => {
        if (!config || !firebaseUser) return;
        setSavingCfg(true);
        try {
            await saveSubscriptionConfig(config, firebaseUser.uid);
            flash("Global settings saved.");
        } finally {
            setSavingCfg(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Subscription &amp; Monetisation</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Decide your freemium model: flip the paywall on/off, design plans, bundle content, and create promo
                    codes. Plans are read by the student membership page in real time.
                </p>
            </div>

            {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}

            {/* ── Global switch ── */}
            <Card className={`p-6 ${config?.enforced ? "" : "border-emerald-300 bg-emerald-50/40"}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Paywall</h2>
                        <p className="mt-1 text-sm text-slate-600 max-w-xl">
                            {config?.enforced ? (
                                <>Enforcement is <strong>ON</strong> — students get only what their plan allows.</>
                            ) : (
                                <>
                                    Launch mode — enforcement is <strong>OFF</strong>, so <strong>everyone gets full access
                                    for free</strong>. Build your plans first, then flip this on when you&apos;re ready to
                                    charge.
                                </>
                            )}
                        </p>
                    </div>
                    <label className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-700">Enforce plans</span>
                        <button
                            type="button"
                            onClick={() => setConfig((c) => (c ? { ...c, enforced: !c.enforced } : c))}
                            className={`relative h-7 w-12 rounded-full transition-colors ${config?.enforced ? "bg-primary-600" : "bg-slate-300"}`}
                        >
                            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${config?.enforced ? "left-6" : "left-1"}`} />
                        </button>
                    </label>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Free plan code</span>
                        <input
                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                            value={config?.freePlanCode || "free"}
                            onChange={(e) => setConfig((c) => (c ? { ...c, freePlanCode: e.target.value } : c))}
                            placeholder="free"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Promo banner (optional)</span>
                        <input
                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            value={config?.promoBanner || ""}
                            onChange={(e) => setConfig((c) => (c ? { ...c, promoBanner: e.target.value } : c))}
                            placeholder="🎉 Launch offer — use code LAUNCH50"
                        />
                    </label>
                </div>
                <div className="mt-4">
                    <Button variant="primary" onClick={saveConfig} isLoading={savingCfg}>Save global settings</Button>
                </div>
            </Card>

            {/* ── Plans ── */}
            <div>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">Plans</h2>
                    <Button variant="primary" onClick={() => setEditingPlan(emptyPlan())}>+ New plan</Button>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {plans.length === 0 && (
                        <Card className="p-6 text-sm text-slate-500">
                            No plans yet. Create at least a Free plan and one paid plan.
                        </Card>
                    )}
                    {plans.map((p) => (
                        <Card key={p.id} className="p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-slate-900">{p.name}</h3>
                                        {p.isFree && <span className="chip-neutral text-[10px]">Free</span>}
                                        {p.recommended && <span className="chip-info text-[10px]">Recommended</span>}
                                        {!p.isActive && <span className="chip-warning text-[10px]">Inactive</span>}
                                    </div>
                                    <p className="text-xs font-mono text-slate-400">{p.code} · {p.interval}</p>
                                    <p className="mt-1 text-sm text-slate-600">
                                        {p.priceINR > 0 ? formatINR(p.priceINR) : "Free"}
                                        {p.compareAtINR ? <span className="ml-2 text-xs text-slate-400 line-through">{formatINR(p.compareAtINR)}</span> : null}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {Object.entries(p.features).filter(([, v]) => v).length} features ·
                                        {" "}{ENTITLEMENT_FEATURES.filter((f) => p.features[f.key]).slice(0, 3).map((f) => f.label).join(", ")}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setEditingPlan(p)}>Edit</Button>
                                    <Button variant="ghost" size="sm" className="!text-rose-600" onClick={async () => {
                                        if (confirm(`Delete plan "${p.name}"?`)) { await deletePlan(p.id); load(); }
                                    }}>Delete</Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>

            {/* ── Promo codes ── */}
            <div>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">Promo codes</h2>
                    <Button variant="primary" onClick={() => setEditingPromo({ type: "percent", value: 10, oncePerUser: true, isActive: true, maxRedemptions: -1, applicablePlanCodes: [] })}>+ New code</Button>
                </div>
                <div className="mt-3 space-y-2">
                    {promos.length === 0 && <Card className="p-6 text-sm text-slate-500">No promo codes yet.</Card>}
                    {promos.map((pr) => (
                        <Card key={pr.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-semibold text-slate-900">{pr.code}</span>
                                    {!pr.isActive && <span className="chip-warning text-[10px]">Inactive</span>}
                                </div>
                                <p className="text-xs text-slate-500">
                                    {pr.type === "percent" && `${pr.value}% off`}
                                    {pr.type === "flat" && `${formatINR(pr.value)} off`}
                                    {pr.type === "free_months" && `${pr.value} free month(s)`}
                                    {pr.type === "free_plan" && `Grants plan: ${pr.grantsPlanCode}`}
                                    {" · "}
                                    {pr.redeemedCount}{pr.maxRedemptions >= 0 ? `/${pr.maxRedemptions}` : ""} used
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setEditingPromo(pr)}>Edit</Button>
                                <Button variant="ghost" size="sm" className="!text-rose-600" onClick={async () => {
                                    if (confirm(`Delete code "${pr.code}"?`)) { await deletePromo(pr.code); load(); }
                                }}>Delete</Button>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>

            {editingPlan && (
                <PlanEditor
                    plan={editingPlan}
                    onClose={() => setEditingPlan(null)}
                    onSaved={() => { setEditingPlan(null); load(); flash("Plan saved."); }}
                />
            )}
            {editingPromo && (
                <PromoEditor
                    promo={editingPromo}
                    planCodes={plans.map((p) => p.code)}
                    onClose={() => setEditingPromo(null)}
                    onSaved={() => { setEditingPromo(null); load(); flash("Promo saved."); }}
                />
            )}
        </div>
    );
}

// ─── Plan editor modal ───────────────────────────────────────────────

function PlanEditor({
    plan,
    onClose,
    onSaved,
}: {
    plan: Partial<AppSubscriptionPlan> & { id?: string };
    onClose: () => void;
    onSaved: () => void;
}) {
    const [draft, setDraft] = useState(plan);
    const [saving, setSaving] = useState(false);
    const features = draft.features || {};
    const quotas = draft.quotas || {};

    const setFeature = (k: string, v: boolean) => setDraft((d) => ({ ...d, features: { ...(d.features || {}), [k]: v } }));
    const setQuota = (k: string, v: number) => setDraft((d) => ({ ...d, quotas: { ...(d.quotas || {}), [k]: v } }));

    const save = async () => {
        if (!draft.code || !draft.name) { alert("Code and name are required"); return; }
        setSaving(true);
        try {
            await savePlan(draft);
            onSaved();
        } catch (e: any) {
            alert(e.message || "Failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
            <Card className="w-full max-w-2xl my-8 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">{draft.id ? "Edit plan" : "New plan"}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Code (stable id)"><input className="field" value={draft.code || ""} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="pro" /></Field>
                    <Field label="Name"><input className="field" value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Pro" /></Field>
                    <Field label="Tagline"><input className="field" value={draft.tagline || ""} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} /></Field>
                    <Field label="Interval">
                        <select className="field" value={draft.interval || "monthly"} onChange={(e) => setDraft({ ...draft, interval: e.target.value as any })}>
                            <option value="monthly">Monthly</option>
                            <option value="annual">Annual</option>
                            <option value="lifetime">Lifetime</option>
                        </select>
                    </Field>
                    <Field label="Price (INR)"><input type="number" className="field" value={draft.priceINR ?? 0} onChange={(e) => setDraft({ ...draft, priceINR: Number(e.target.value) })} /></Field>
                    <Field label="Compare-at (INR, optional)"><input type="number" className="field" value={draft.compareAtINR ?? ""} onChange={(e) => setDraft({ ...draft, compareAtINR: e.target.value ? Number(e.target.value) : null })} /></Field>
                    <Field label="Badge (optional)"><input className="field" value={draft.badge || ""} onChange={(e) => setDraft({ ...draft, badge: e.target.value || null })} placeholder="Best value" /></Field>
                    <Field label="Sort order"><input type="number" className="field" value={draft.sortOrder ?? 0} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></Field>
                </div>

                <Field label="Highlights (one per line)">
                    <textarea className="field" rows={3} value={(draft.highlights || []).join("\n")} onChange={(e) => setDraft({ ...draft, highlights: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
                </Field>

                <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draft.isFree)} onChange={(e) => setDraft({ ...draft, isFree: e.target.checked })} /> Free plan</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isActive !== false} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draft.recommended)} onChange={(e) => setDraft({ ...draft, recommended: e.target.checked })} /> Recommended</label>
                </div>

                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Features unlocked</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {ENTITLEMENT_FEATURES.map((f) => (
                            <label key={f.key} className="flex items-start gap-2 text-sm">
                                <input type="checkbox" className="mt-0.5" checked={Boolean(features[f.key])} onChange={(e) => setFeature(f.key, e.target.checked)} />
                                <span><span className="font-medium">{f.label}</span><span className="block text-xs text-slate-400">{f.blurb}</span></span>
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Quotas (−1 = unlimited)</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {ENTITLEMENT_QUOTAS.map((q) => (
                            <label key={q.key} className="block text-sm">
                                <span className="text-slate-700">{q.label}</span>
                                <input
                                    type="number"
                                    className="field mt-1"
                                    value={quotas[q.key] ?? q.freeDefault}
                                    onChange={(e) => setQuota(q.key, Number(e.target.value))}
                                />
                            </label>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={save} isLoading={saving}>Save plan</Button>
                </div>
            </Card>
        </div>
    );
}

// ─── Promo editor modal ──────────────────────────────────────────────

function PromoEditor({
    promo,
    planCodes,
    onClose,
    onSaved,
}: {
    promo: Partial<PromoCode>;
    planCodes: string[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [draft, setDraft] = useState(promo);
    const [saving, setSaving] = useState(false);

    const toLocal = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

    const save = async () => {
        if (!draft.code) { alert("Code is required"); return; }
        setSaving(true);
        try {
            await savePromo(draft);
            onSaved();
        } catch (e: any) {
            alert(e.message || "Failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
            <Card className="w-full max-w-xl my-8 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">Promo code</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Code"><input className="field font-mono uppercase" value={draft.code || ""} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} placeholder="LAUNCH50" /></Field>
                    <Field label="Type">
                        <select className="field" value={draft.type || "percent"} onChange={(e) => setDraft({ ...draft, type: e.target.value as PromoType })}>
                            <option value="percent">Percent off</option>
                            <option value="flat">Flat ₹ off</option>
                            <option value="free_months">Free months</option>
                            <option value="free_plan">Grant a plan free</option>
                        </select>
                    </Field>
                    {draft.type !== "free_plan" ? (
                        <Field label={draft.type === "percent" ? "Percent (0-100)" : draft.type === "flat" ? "₹ off" : "Months"}>
                            <input type="number" className="field" value={draft.value ?? 0} onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })} />
                        </Field>
                    ) : (
                        <Field label="Grants plan code">
                            <select className="field" value={draft.grantsPlanCode || ""} onChange={(e) => setDraft({ ...draft, grantsPlanCode: e.target.value })}>
                                <option value="">Select plan…</option>
                                {planCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </Field>
                    )}
                    <Field label="Max redemptions (−1 = ∞)"><input type="number" className="field" value={draft.maxRedemptions ?? -1} onChange={(e) => setDraft({ ...draft, maxRedemptions: Number(e.target.value) })} /></Field>
                    <Field label="Starts at"><input type="date" className="field" value={toLocal(draft.startsAt)} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value ? new Date(e.target.value) : null })} /></Field>
                    <Field label="Expires at"><input type="date" className="field" value={toLocal(draft.expiresAt)} onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value ? new Date(e.target.value) : null })} /></Field>
                </div>
                <Field label="Description"><input className="field" value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
                <Field label="Applicable plan codes (comma-sep, blank = any)">
                    <input className="field" value={(draft.applicablePlanCodes || []).join(", ")} onChange={(e) => setDraft({ ...draft, applicablePlanCodes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
                </Field>
                <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.oncePerUser !== false} onChange={(e) => setDraft({ ...draft, oncePerUser: e.target.checked })} /> Once per user</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isActive !== false} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active</label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={save} isLoading={saving}>Save code</Button>
                </div>
            </Card>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            <div className="mt-1.5">{children}</div>
        </label>
    );
}
