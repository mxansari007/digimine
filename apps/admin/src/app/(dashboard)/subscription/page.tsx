"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, InfoTip } from "@digimine/ui";
import { X } from "lucide-react";
import {
    ENTITLEMENT_FEATURES,
    ENTITLEMENT_QUOTAS,
    TEACHING_FEATURES,
    TEACHING_LIMITS,
    UNLIMITED_TEACHING_LIMITS,
    formatINR,
    type AiProvider,
    type AiProviderConfig,
    type AppSubscriptionPlan,
    type PlanRoleScope,
    type PromoCode,
    type PromoType,
    type SubscriptionGlobalConfig,
    type TeachingFeature,
    type TeachingLimitKey,
    type TeachingLimits,
} from "@digimine/types";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    deletePlan,
    deletePromo,
    getAiProviderConfig,
    getSubscriptionConfig,
    listPlans,
    listPromos,
    savePlan,
    saveAiProviderConfig,
    savePromo,
    saveSubscriptionConfig,
} from "@/lib/firestore/subscription";

const ROLE_TABS: { key: PlanRoleScope; label: string; blurb: string }[] = [
    { key: "student", label: "Student", blurb: "Consumer subscriptions — feature flags + quotas apply." },
    { key: "teacher", label: "Teacher", blurb: "Plans teachers pick on /pricing/teacher." },
    { key: "institute", label: "Institute", blurb: "Plans institutes pick on /pricing/institute. Seat-cap matters here." },
];

function emptyPlan(roleScope: PlanRoleScope = "student"): Partial<AppSubscriptionPlan> {
    return {
        code: "",
        name: "",
        tagline: "",
        highlights: [],
        priceINR: 0,
        monthlyPriceINR: 0,
        annualPriceINR: null,
        compareAtINR: null,
        interval: "monthly",
        roleScope,
        seatCap: null,
        features: {},
        quotas: {},
        teachingFeatures: {},
        teachingLimits:
            roleScope === "teacher" || roleScope === "institute"
                ? { ...UNLIMITED_TEACHING_LIMITS }
                : undefined,
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
    const [activeRoleTab, setActiveRoleTab] = useState<PlanRoleScope>("student");
    const [aiConfig, setAiConfig] = useState<AiProviderConfig | null>(null);
    const [savingAi, setSavingAi] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [c, p, pr, ai] = await Promise.all([
                getSubscriptionConfig(),
                listPlans(),
                listPromos(),
                getAiProviderConfig(),
            ]);
            setConfig(c);
            setPlans(p);
            setPromos(pr);
            setAiConfig(ai);
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

    const saveAi = async () => {
        if (!aiConfig || !firebaseUser) return;
        setSavingAi(true);
        try {
            await saveAiProviderConfig(aiConfig, firebaseUser.uid);
            flash("AI provider settings saved.");
        } finally {
            setSavingAi(false);
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
                        <h2 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                            Paywall
                            <InfoTip label="What the paywall does">
                                The master switch for monetisation. When <strong>ON</strong>, every student
                                is limited to exactly what their plan grants. When <strong>OFF</strong> (launch
                                mode), the plans you build here are ignored and everyone gets everything free —
                                useful while you set things up.
                            </InfoTip>
                        </h2>
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
                        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                            Enforce plans
                            <InfoTip label="Enforce plans">
                                Toggles the paywall. ON = charge for premium; OFF = everything free for
                                everyone (launch mode). This is the same switch described on the left.
                            </InfoTip>
                        </span>
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
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Free plan code
                            <InfoTip label="What is the free plan code">
                                The <strong>code</strong> of the plan a student lands on when they have no
                                paid subscription (or it expired). It must exactly match the{" "}
                                <span className="font-mono">Code</span> of one of the plans below that you ticked
                                as <strong>&quot;Free plan&quot;</strong>. Default is <span className="font-mono">free</span>.
                                Leave blank to use <span className="font-mono">free</span>.
                            </InfoTip>
                        </span>
                        {/* Use ?? "" (not || "free") so the box can actually be cleared and
                            retyped — the old fallback snapped an empty value back to "free",
                            which made it feel locked. The placeholder still shows the default. */}
                        <input
                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                            value={config?.freePlanCode ?? ""}
                            onChange={(e) => setConfig((c) => (c ? { ...c, freePlanCode: e.target.value } : c))}
                            placeholder="free"
                        />
                        <span className="mt-1 block text-[11px] text-slate-400">
                            Defaults to <span className="font-mono">free</span> when empty.
                        </span>
                    </label>
                    <label className="block">
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Promo banner (optional)
                            <InfoTip label="Promo banner">
                                A short line shown across the top of the student membership page (e.g. a
                                seasonal offer). Leave blank to hide the banner entirely.
                            </InfoTip>
                        </span>
                        <input
                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                            value={config?.promoBanner || ""}
                            onChange={(e) => setConfig((c) => (c ? { ...c, promoBanner: e.target.value } : c))}
                            placeholder="Launch offer — use code LAUNCH50"
                        />
                    </label>
                </div>
                <div className="mt-4">
                    <Button variant="primary" onClick={saveConfig} isLoading={savingCfg}>Save global settings</Button>
                </div>
            </Card>

            {/* ── AI provider (kill-switch + key) ── */}
            <Card className={`p-6 ${aiConfig?.enabled ? "border-primary-200 bg-primary-50/30" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                            Question generation (AI)
                            <InfoTip label="AI question generation">
                                Lets teachers/institutes (whose plan includes the &quot;AI question
                                generation&quot; teaching feature) draft quiz/test questions from a prompt.
                                This card is the global kill-switch + API credentials — separate from the
                                student paywall above.
                            </InfoTip>
                        </h2>
                        <p className="mt-1 max-w-xl text-sm text-slate-600">
                            {aiConfig?.enabled ? (
                                <>
                                    AI question generation is <strong>ON</strong>. Teachers and
                                    institutes whose plan includes the &quot;AI question generation&quot;
                                    teaching feature can generate question drafts from a prompt.
                                </>
                            ) : (
                                <>
                                    AI question generation is <strong>OFF</strong> — teachers and
                                    institutes see &quot;currently unavailable&quot; even on plans
                                    that include the feature. Flip on once the API key is set and
                                    you&apos;ve confirmed it works.
                                </>
                            )}
                        </p>
                    </div>
                    <label className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-700">Enabled</span>
                        <button
                            type="button"
                            onClick={() =>
                                setAiConfig((c) => (c ? { ...c, enabled: !c.enabled } : c))
                            }
                            className={`relative h-7 w-12 rounded-full transition-colors ${
                                aiConfig?.enabled ? "bg-primary-600" : "bg-slate-300"
                            }`}
                        >
                            <span
                                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                                    aiConfig?.enabled ? "left-6" : "left-1"
                                }`}
                            />
                        </button>
                    </label>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Provider
                            <InfoTip label="Provider">
                                Which LLM vendor powers generation. The key + model below must belong to this
                                provider. (Student AI mock interviews also run through this provider.)
                            </InfoTip>
                        </span>
                        <select
                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            value={aiConfig?.provider || "deepseek"}
                            onChange={(e) =>
                                setAiConfig((c) =>
                                    c ? { ...c, provider: e.target.value as AiProvider } : c
                                )
                            }
                        >
                            <option value="deepseek">DeepSeek</option>
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Model
                            <InfoTip label="Model">
                                The exact model id to call, e.g. <span className="font-mono">deepseek-chat</span>{" "}
                                or <span className="font-mono">gpt-4o-mini</span>. Must be a model the selected
                                provider + key can access.
                            </InfoTip>
                        </span>
                        <input
                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                            value={aiConfig?.model || ""}
                            onChange={(e) =>
                                setAiConfig((c) => (c ? { ...c, model: e.target.value } : c))
                            }
                            placeholder="deepseek-chat"
                        />
                    </label>
                    <label className="block sm:col-span-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            API key
                        </span>
                        <input
                            type="password"
                            autoComplete="off"
                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                            value={aiConfig?.apiKey || ""}
                            onChange={(e) =>
                                setAiConfig((c) => (c ? { ...c, apiKey: e.target.value } : c))
                            }
                            placeholder="sk-..."
                        />
                        <span className="mt-1 block text-[11px] text-slate-500">
                            Stored in Firestore at <code>appConfig/aiProvider</code>. Only
                            server-side admin routes read it; the public /me endpoint redacts it.
                        </span>
                    </label>
                    <label className="block">
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Max questions per request
                            <InfoTip label="Max questions per request">
                                Caps how many questions a single generate call can produce — protects your
                                token spend from one teacher requesting hundreds at once.
                            </InfoTip>
                        </span>
                        <input
                            type="number"
                            min={1}
                            max={50}
                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            value={aiConfig?.maxQuestionsPerRequest ?? 10}
                            onChange={(e) =>
                                setAiConfig((c) =>
                                    c
                                        ? {
                                              ...c,
                                              maxQuestionsPerRequest: Math.max(
                                                  1,
                                                  Number(e.target.value) || 10
                                              ),
                                          }
                                        : c
                                )
                            }
                        />
                    </label>
                </div>
                <div className="mt-4">
                    <Button variant="primary" onClick={saveAi} isLoading={savingAi}>
                        Save AI settings
                    </Button>
                </div>
            </Card>

            {/* ── Plans (role-tabbed) ── */}
            <div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Plans</h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                            {ROLE_TABS.find((t) => t.key === activeRoleTab)?.blurb}
                        </p>
                    </div>
                    <Button variant="primary" onClick={() => setEditingPlan(emptyPlan(activeRoleTab))}>
                        + New {activeRoleTab} plan
                    </Button>
                </div>
                <div className="mt-3 flex gap-1 border-b border-slate-200">
                    {ROLE_TABS.map((t) => {
                        const count = plans.filter((p) => p.roleScope === t.key).length;
                        const active = activeRoleTab === t.key;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setActiveRoleTab(t.key)}
                                className={`relative -mb-px px-4 py-2 text-sm font-medium transition-colors ${
                                    active
                                        ? "border-b-2 border-primary-600 text-primary-700"
                                        : "text-slate-500 hover:text-slate-700"
                                }`}
                            >
                                {t.label}
                                <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {(() => {
                        const filtered = plans.filter((p) => p.roleScope === activeRoleTab);
                        if (filtered.length === 0) {
                            return (
                                <Card className="p-6 text-sm text-slate-500">
                                    No {activeRoleTab} plans yet. Click &quot;+ New {activeRoleTab} plan&quot; to create one.
                                </Card>
                            );
                        }
                        return filtered.map((p) => (
                            <Card key={p.id} className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-semibold text-slate-900">{p.name}</h3>
                                            {p.isFree && <span className="chip-neutral text-[10px]">Free</span>}
                                            {p.recommended && <span className="chip-info text-[10px]">Recommended</span>}
                                            {!p.isActive && <span className="chip-warning text-[10px]">Inactive</span>}
                                            {p.roleScope === "institute" && p.seatCap != null && (
                                                <span className="chip-neutral text-[10px]">
                                                    {p.seatCap} seats
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs font-mono text-slate-400">{p.code}</p>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {p.monthlyPriceINR > 0 ? `${formatINR(p.monthlyPriceINR)} / mo` : "Free"}
                                            {p.annualPriceINR != null && p.annualPriceINR > 0 && (
                                                <span className="ml-2 text-slate-500">· {formatINR(p.annualPriceINR)} / yr</span>
                                            )}
                                            {p.compareAtINR ? <span className="ml-2 text-xs text-slate-400 line-through">{formatINR(p.compareAtINR)}</span> : null}
                                        </p>
                                        {p.roleScope === "student" ? (
                                            <p className="mt-1 text-xs text-slate-500">
                                                {Object.entries(p.features).filter(([, v]) => v).length} features ·
                                                {" "}{ENTITLEMENT_FEATURES.filter((f) => p.features[f.key]).slice(0, 3).map((f) => f.label).join(", ")}
                                            </p>
                                        ) : p.highlights.length > 0 ? (
                                            <p className="mt-1 text-xs text-slate-500">
                                                {p.highlights.slice(0, 2).join(" · ")}
                                                {p.highlights.length > 2 ? ` · +${p.highlights.length - 2} more` : ""}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setEditingPlan(p)}>Edit</Button>
                                        <Button variant="ghost" size="sm" className="!text-rose-600" onClick={async () => {
                                            if (confirm(`Delete plan "${p.name}"?`)) { await deletePlan(p.id); load(); }
                                        }}>Delete</Button>
                                    </div>
                                </div>
                            </Card>
                        ));
                    })()}
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
    const teachingFeatures = draft.teachingFeatures || {};

    const setFeature = (k: string, v: boolean) => setDraft((d) => ({ ...d, features: { ...(d.features || {}), [k]: v } }));
    const setQuota = (k: string, v: number) => setDraft((d) => ({ ...d, quotas: { ...(d.quotas || {}), [k]: v } }));
    const setTeachingFeature = (k: TeachingFeature, v: boolean) =>
        setDraft((d) => ({ ...d, teachingFeatures: { ...(d.teachingFeatures || {}), [k]: v } }));
    const setTeachingLimit = (k: TeachingLimitKey, v: number) =>
        setDraft((d) => ({
            ...d,
            teachingLimits: {
                ...(d.teachingLimits || UNLIMITED_TEACHING_LIMITS),
                [k]: Number.isFinite(v) ? v : -1,
            },
        }));
    const teachingLimits: TeachingLimits =
        draft.teachingLimits || UNLIMITED_TEACHING_LIMITS;

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
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                        <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Role scope">
                        <select
                            className="field"
                            value={draft.roleScope || "student"}
                            onChange={(e) => setDraft({ ...draft, roleScope: e.target.value as PlanRoleScope })}
                        >
                            <option value="student">Student</option>
                            <option value="teacher">Teacher</option>
                            <option value="institute">Institute</option>
                        </select>
                    </Field>
                    <Field
                        label="Code (stable id)"
                        info={
                            <>
                                A permanent identifier for this plan (e.g. <span className="font-mono">pro</span>).
                                Used in checkout, promos, and the <strong>Free plan code</strong> setting — so
                                don&apos;t change it after launch. For your free tier, set this to match the
                                Free-plan-code in the Paywall card.
                            </>
                        }
                    >
                        <input className="field" value={draft.code || ""} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="pro" />
                    </Field>
                    <Field label="Name"><input className="field" value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Pro" /></Field>
                    <Field label="Tagline"><input className="field" value={draft.tagline || ""} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} /></Field>
                    <Field label="Monthly price (INR)">
                        <input
                            type="number"
                            className="field"
                            value={draft.monthlyPriceINR ?? 0}
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                setDraft({ ...draft, monthlyPriceINR: v, priceINR: v });
                            }}
                        />
                    </Field>
                    <Field label="Annual price (INR, blank = no annual option)">
                        <input
                            type="number"
                            className="field"
                            value={draft.annualPriceINR ?? ""}
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    annualPriceINR: e.target.value ? Number(e.target.value) : null,
                                })
                            }
                        />
                    </Field>
                    <Field
                        label="Compare-at monthly (INR, optional)"
                        info={
                            <>
                                The &quot;was&quot; price shown struck-through next to the real price to signal a
                                discount (e.g. show ₹999 crossed out above ₹499). Leave blank for no strike-through.
                            </>
                        }
                    >
                        <input type="number" className="field" value={draft.compareAtINR ?? ""} onChange={(e) => setDraft({ ...draft, compareAtINR: e.target.value ? Number(e.target.value) : null })} />
                    </Field>
                    <Field label="Badge (optional)"><input className="field" value={draft.badge || ""} onChange={(e) => setDraft({ ...draft, badge: e.target.value || null })} placeholder="Best value" /></Field>
                    <Field label="Sort order"><input type="number" className="field" value={draft.sortOrder ?? 0} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></Field>
                    {(draft.roleScope || "student") === "institute" && (
                        <Field label="Seat cap (blank = unlimited)">
                            <input
                                type="number"
                                className="field"
                                value={draft.seatCap ?? ""}
                                onChange={(e) =>
                                    setDraft({
                                        ...draft,
                                        seatCap: e.target.value ? Number(e.target.value) : null,
                                    })
                                }
                                placeholder="e.g. 25"
                            />
                        </Field>
                    )}
                </div>

                <Field
                    label="Highlights (one per line)"
                    info={
                        <>
                            The bullet list shown on this plan&apos;s public pricing card. For student plans, if
                            you leave this blank the card auto-lists the ticked features below instead. One line =
                            one bullet.
                        </>
                    }
                >
                    <textarea className="field" rows={3} value={(draft.highlights || []).join("\n")} onChange={(e) => setDraft({ ...draft, highlights: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
                </Field>

                <div className="flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draft.isFree)} onChange={(e) => setDraft({ ...draft, isFree: e.target.checked })} /> Free plan</label>
                    <InfoTip label="Free plan">
                        Marks this as a ₹0 default tier. New users and anyone without an active paid
                        subscription land here. Set the Paywall&apos;s <strong>Free plan code</strong> to this
                        plan&apos;s <span className="font-mono">Code</span> so the fallback resolves correctly.
                        You normally have exactly one free plan.
                    </InfoTip>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isActive !== false} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active</label>
                    <InfoTip label="Active">
                        Only active plans appear on the membership page. Untick to retire a plan without
                        deleting it (existing subscribers keep what they bought).
                    </InfoTip>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draft.recommended)} onChange={(e) => setDraft({ ...draft, recommended: e.target.checked })} /> Recommended</label>
                    <InfoTip label="Recommended">
                        Highlights this plan as the &quot;Most popular&quot; card and uses it as the
                        &quot;Premium&quot; column in the Free-vs-Premium comparison table.
                    </InfoTip>
                </div>

                {(draft.roleScope || "student") === "student" ? (
                    <>
                        <div>
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                                Features unlocked
                                <InfoTip label="Features unlocked">
                                    On/off capabilities this plan grants (premium problems, mock tests, AI
                                    interviews, etc.). Anything left unticked is locked for users on this plan.
                                    Your free plan typically has all of these <strong>off</strong>.
                                </InfoTip>
                            </p>
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
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                                Quotas (−1 = unlimited)
                                <InfoTip label="Quotas">
                                    Numeric caps per period for this plan — e.g. practice submissions per day,
                                    AI interviews per week. <span className="font-mono">-1</span> means unlimited;{" "}
                                    <span className="font-mono">0</span> blocks it entirely. These are what give the
                                    free tier a limited taste (a few submissions, one AI interview a week, etc.).
                                </InfoTip>
                            </p>
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
                    </>
                ) : (
                    <>
                        <Card className="border-amber-200 bg-amber-50/40 p-3 text-xs text-amber-800">
                            Student feature flags and quotas don&apos;t apply here. {draft.roleScope === "teacher" ? "Teacher" : "Institute"} plans use the <span className="font-semibold">Highlights</span>, {draft.roleScope === "institute" ? "Seat cap, " : ""}and <span className="font-semibold">Teaching features</span> below.
                        </Card>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                                Teaching features unlocked
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {TEACHING_FEATURES.map((f) => (
                                    <label
                                        key={f.key}
                                        className="flex items-start gap-2 text-sm"
                                    >
                                        <input
                                            type="checkbox"
                                            className="mt-0.5"
                                            checked={Boolean(teachingFeatures[f.key])}
                                            onChange={(e) =>
                                                setTeachingFeature(f.key, e.target.checked)
                                            }
                                        />
                                        <span>
                                            <span className="font-medium">{f.label}</span>
                                            <span className="block text-xs text-slate-400">
                                                {f.blurb}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <Field label="AI questions per day (blank = unlimited, 0 = disabled)">
                            <input
                                type="number"
                                min={0}
                                className="field"
                                value={draft.aiQuestionsPerDay ?? ""}
                                onChange={(e) =>
                                    setDraft({
                                        ...draft,
                                        aiQuestionsPerDay: e.target.value === ""
                                            ? null
                                            : Math.max(0, Number(e.target.value) || 0),
                                    })
                                }
                                placeholder="e.g. 50"
                            />
                            <p className="mt-1 text-xs text-slate-500">
                                Applies only when the AI question generation flag above is ticked. Counter resets at midnight IST.
                            </p>
                        </Field>

                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                                Teacher usage limits (−1 = unlimited)
                            </p>
                            <p className="mb-3 text-xs text-slate-500">
                                Enforced server-side on create/enroll. Rendered on the teacher{" "}
                                <span className="font-mono text-[11px]">/teacher/usage</span> page.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {TEACHING_LIMITS.map((l) => (
                                    <label key={l.key} className="block text-sm">
                                        <span className="text-slate-700">{l.label}</span>
                                        <input
                                            type="number"
                                            className="field mt-1"
                                            value={teachingLimits[l.key]}
                                            onChange={(e) =>
                                                setTeachingLimit(l.key, Number(e.target.value))
                                            }
                                        />
                                        <span className="mt-1 block text-[11px] text-slate-400">
                                            {l.blurb}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </>
                )}

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
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                        <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    </button>
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

function Field({
    label,
    info,
    children,
}: {
    label: string;
    info?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
                {info ? <InfoTip label={label}>{info}</InfoTip> : null}
            </span>
            <div className="mt-1.5">{children}</div>
        </label>
    );
}
