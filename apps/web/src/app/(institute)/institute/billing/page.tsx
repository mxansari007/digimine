"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@digimine/ui";
import {
    INSTITUTE_BILLING_PLANS,
    formatINR,
    formatLimit,
    isLimitExceeded,
    usagePercent,
    type InstituteBillingPlan,
    type InstituteBillingPlanId,
    type InstituteBillingUsage,
} from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

type BillingContact = {
    name: string;
    email: string;
    phone: string | null;
    gstin: string | null;
    address: string | null;
};

type PlanChangeRequest = {
    id: string;
    kind: "upgrade" | "downgrade" | "renew" | "cancel";
    fromPlanId: InstituteBillingPlanId | null;
    toPlanId: InstituteBillingPlanId | null;
    status: "pending" | "approved" | "rejected" | "cancelled";
    requestedAt: string | null;
    notes: string | null;
};

type Invoice = {
    id: string;
    number: string;
    planId: InstituteBillingPlanId;
    periodStart: string | null;
    periodEnd: string | null;
    totalINR: number;
    status: "draft" | "issued" | "paid" | "overdue" | "cancelled";
    issuedAt: string | null;
    dueAt: string | null;
    paidAt: string | null;
    pdfUrl: string | null;
};

const USAGE_ROWS: Array<{
    key: keyof InstituteBillingUsage;
    label: string;
    limitKey: keyof InstituteBillingPlan["limits"];
}> = [
    { key: "teachers", label: "Teachers", limitKey: "teachers" },
    { key: "students", label: "Students", limitKey: "students" },
    { key: "classes", label: "Classes", limitKey: "classes" },
    { key: "questionBankItems", label: "Question bank items", limitKey: "questionBankItems" },
    { key: "centralizedContent", label: "Centralized content", limitKey: "centralizedContent" },
];

function statusChip(status: PlanChangeRequest["status"] | Invoice["status"]) {
    switch (status) {
        case "approved":
        case "paid":
            return "chip-success";
        case "pending":
        case "issued":
            return "chip-warning";
        case "overdue":
        case "rejected":
            return "chip-error";
        case "cancelled":
        case "draft":
        default:
            return "chip-neutral";
    }
}

function changeLabel(req: PlanChangeRequest): string {
    if (req.kind === "upgrade" || req.kind === "downgrade") {
        const fromName = req.fromPlanId ? INSTITUTE_BILLING_PLANS[req.fromPlanId]?.name : "—";
        const toName = req.toPlanId ? INSTITUTE_BILLING_PLANS[req.toPlanId]?.name : "—";
        return `${req.kind === "upgrade" ? "Upgrade" : "Downgrade"}: ${fromName} → ${toName}`;
    }
    if (req.kind === "renew") return "Renewal request";
    return "Cancellation request";
}

export default function InstituteBillingPage() {
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [planId, setPlanId] = useState<InstituteBillingPlanId>("trial");
    const [usage, setUsage] = useState<InstituteBillingUsage>({
        teachers: 0,
        students: 0,
        classes: 0,
        questionBankItems: 0,
        centralizedContent: 0,
    });
    const [catalog, setCatalog] = useState<InstituteBillingPlan[]>([]);
    const [contact, setContact] = useState<BillingContact>({
        name: "",
        email: "",
        phone: "",
        gstin: "",
        address: "",
    });
    const [pendingRequests, setPendingRequests] = useState<PlanChangeRequest[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingContact, setSavingContact] = useState(false);
    const [submittingChange, setSubmittingChange] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const currentPlan = INSTITUTE_BILLING_PLANS[planId];

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const me = await teacherFetch(firebaseUser, "/api/institute/me");
            const meData = await me.json();
            const id = meData?.institute?.id;
            if (!id) throw new Error("No institute");
            setInstituteId(id);

            const [billingRes, invoicesRes] = await Promise.all([
                teacherFetch(firebaseUser, `/api/institute/${encodeURIComponent(id)}/billing`),
                teacherFetch(firebaseUser, `/api/institute/${encodeURIComponent(id)}/billing/invoices`),
            ]);
            const billingData = await billingRes.json();
            const invoicesData = await invoicesRes.json();
            if (!billingRes.ok) throw new Error(billingData.error || "Failed");

            setPlanId(billingData.planId || "trial");
            setUsage(billingData.usage || usage);
            setCatalog(billingData.catalog || []);
            setPendingRequests(billingData.pendingRequests || []);
            if (billingData.billingContact) {
                setContact({
                    name: billingData.billingContact.name || "",
                    email: billingData.billingContact.email || "",
                    phone: billingData.billingContact.phone || "",
                    gstin: billingData.billingContact.gstin || "",
                    address: billingData.billingContact.address || "",
                });
            }
            setInvoices(invoicesData.invoices || []);
        } catch (err: any) {
            setError(err.message || "Failed");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const handleSaveContact = async () => {
        if (!firebaseUser || !instituteId) return;
        setSavingContact(true);
        setError("");
        setMessage("");
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/billing`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ contact }),
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setMessage("Billing contact updated.");
        } catch (err: any) {
            setError(err.message || "Failed");
        } finally {
            setSavingContact(false);
        }
    };

    const submitChange = async (kind: PlanChangeRequest["kind"], toPlanId?: InstituteBillingPlanId) => {
        if (!firebaseUser || !instituteId) return;
        const tag = `${kind}:${toPlanId ?? ""}`;
        setSubmittingChange(tag);
        setError("");
        setMessage("");
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/billing/plan-change`,
                {
                    method: "POST",
                    body: JSON.stringify({ kind, toPlanId }),
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setMessage("Request submitted. Our team will reach out within 1 business day.");
            await load();
        } catch (err: any) {
            setError(err.message || "Failed");
        } finally {
            setSubmittingChange(null);
        }
    };

    const cancelRequest = async (requestId: string) => {
        if (!firebaseUser || !instituteId) return;
        setSubmittingChange(`cancel:${requestId}`);
        setError("");
        setMessage("");
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/billing/plan-change/${encodeURIComponent(requestId)}`,
                { method: "DELETE" }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setMessage("Request cancelled.");
            await load();
        } catch (err: any) {
            setError(err.message || "Failed");
        } finally {
            setSubmittingChange(null);
        }
    };

    const hasPending = pendingRequests.length > 0;

    const sortedCatalog = useMemo(() => {
        const order: InstituteBillingPlanId[] = ["starter", "growth", "scale", "enterprise"];
        return [...catalog].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }, [catalog]);

    if (loading) {
        return <Card className="p-12 text-center text-sm text-gray-500">Loading billing…</Card>;
    }

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-bold text-gray-900">Billing & subscription</h1>
                    <HelpTutorial {...TUTORIALS.institute_billing} />
                </div>
                <p className="mt-1 text-gray-500">
                    Your current plan, usage, invoice history, and billing contact. Plan changes are reviewed by our team
                    so we can prorate seats and issue a proper GST invoice.
                </p>
            </div>

            {error && (
                <Card className="p-4 text-sm text-rose-700 border-rose-200 bg-rose-50">{error}</Card>
            )}
            {message && (
                <Card className="p-4 text-sm text-emerald-700 border-emerald-200 bg-emerald-50">{message}</Card>
            )}

            {/* Current plan + usage */}
            <Card className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="stat-label">Current plan</p>
                        <h2 className="mt-1 text-xl font-semibold text-gray-900">{currentPlan.name}</h2>
                        <p className="text-sm text-gray-500">{currentPlan.tagline}</p>
                    </div>
                    <div className="text-right">
                        <p className="stat-label">Billed annually</p>
                        <p className="mt-1 text-xl font-semibold text-gray-900">
                            {currentPlan.annualPriceINR > 0
                                ? formatINR(currentPlan.annualPriceINR)
                                : "Custom"}
                        </p>
                        {currentPlan.monthlyPriceINR > 0 && (
                            <p className="text-xs text-gray-500">
                                {formatINR(currentPlan.monthlyPriceINR)} / month equivalent
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-6 space-y-3">
                    {USAGE_ROWS.map((row) => {
                        const used = usage[row.key];
                        const limit = currentPlan.limits[row.limitKey] as number;
                        const pct = usagePercent(limit, used);
                        const exceeded = isLimitExceeded(limit, used);
                        const barColor = exceeded
                            ? "bg-rose-500"
                            : pct >= 80
                            ? "bg-amber-500"
                            : "bg-primary-500";
                        return (
                            <div key={row.key}>
                                <div className="flex items-baseline justify-between text-sm">
                                    <span className="text-gray-700">{row.label}</span>
                                    <span className={exceeded ? "text-rose-700 font-semibold" : "text-gray-500"}>
                                        {used.toLocaleString("en-IN")} / {formatLimit(limit)}
                                    </span>
                                </div>
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                    <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>

            {/* Pending requests */}
            {hasPending && (
                <Card intent="info" className="p-5">
                    <p className="font-semibold text-info-700">
                        Pending request — our team will reach out within 1 business day
                    </p>
                    <div className="mt-3 space-y-2">
                        {pendingRequests.map((req) => (
                            <div
                                key={req.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded border border-info-200 bg-white p-3 text-sm"
                            >
                                <div>
                                    <p className="font-medium text-gray-900">{changeLabel(req)}</p>
                                    <p className="text-xs text-gray-500">
                                        Submitted{" "}
                                        {req.requestedAt
                                            ? new Date(req.requestedAt).toLocaleDateString("en-IN")
                                            : ""}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={statusChip(req.status)}>{req.status}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => cancelRequest(req.id)}
                                        isLoading={submittingChange === `cancel:${req.id}`}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Plan catalog */}
            <div>
                <h2 className="text-lg font-semibold text-gray-900">Plans</h2>
                <p className="text-sm text-gray-500">Request a change and we&apos;ll send you an updated quote.</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {sortedCatalog.map((plan) => {
                        const isCurrent = plan.id === planId;
                        const isUpgrade =
                            currentPlan.annualPriceINR < plan.annualPriceINR ||
                            (currentPlan.annualPriceINR === 0 && plan.annualPriceINR > 0) ||
                            plan.id === "enterprise";
                        const tag = `${isUpgrade ? "upgrade" : "downgrade"}:${plan.id}`;
                        return (
                            <Card
                                key={plan.id}
                                className={`relative flex flex-col p-5 ${
                                    plan.recommended ? "border-primary-500 ring-1 ring-primary-200" : ""
                                }`}
                            >
                                {plan.recommended && (
                                    <span className="absolute -top-2 right-4 chip-info">Recommended</span>
                                )}
                                {isCurrent && (
                                    <span className="absolute -top-2 left-4 chip-success">Current</span>
                                )}
                                <p className="text-xs text-gray-500">{plan.tagline}</p>
                                <h3 className="mt-1 text-lg font-semibold text-gray-900">{plan.name}</h3>
                                <p className="mt-2 text-2xl font-bold text-gray-900">
                                    {plan.annualPriceINR > 0 ? formatINR(plan.annualPriceINR) : "Custom"}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {plan.annualPriceINR > 0 ? "per year" : "talk to sales"}
                                </p>
                                <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex gap-2">
                                            <span className="text-primary-600">✓</span>
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-4">
                                    <Button
                                        variant={plan.recommended ? "primary" : "outline"}
                                        size="sm"
                                        disabled={isCurrent || hasPending}
                                        isLoading={submittingChange === tag}
                                        onClick={() =>
                                            submitChange(isUpgrade ? "upgrade" : "downgrade", plan.id)
                                        }
                                    >
                                        {isCurrent
                                            ? "Current plan"
                                            : plan.id === "enterprise"
                                            ? "Contact sales"
                                            : isUpgrade
                                            ? "Request upgrade"
                                            : "Request downgrade"}
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Renew / cancel */}
            {planId !== "trial" && (
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={hasPending}
                        isLoading={submittingChange === "renew:"}
                        onClick={() => submitChange("renew")}
                    >
                        Request renewal quote
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={hasPending}
                        isLoading={submittingChange === "cancel:"}
                        onClick={() => {
                            if (
                                typeof window !== "undefined" &&
                                !window.confirm("Cancelling will end your subscription at the period end. Continue?")
                            )
                                return;
                            submitChange("cancel");
                        }}
                    >
                        Request cancellation
                    </Button>
                </div>
            )}

            {/* Billing contact */}
            <Card className="p-6 space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Billing contact</h2>
                    <p className="text-sm text-gray-500">
                        Where we send invoices and renewal reminders. GSTIN appears on every invoice when set.
                    </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="stat-label">Contact name</label>
                        <input
                            className="field-input mt-1.5"
                            value={contact.name}
                            onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                            placeholder="Accounts Team"
                        />
                    </div>
                    <div>
                        <label className="stat-label">Contact email</label>
                        <input
                            type="email"
                            className="field-input mt-1.5"
                            value={contact.email}
                            onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                            placeholder="accounts@example.in"
                        />
                    </div>
                    <div>
                        <label className="stat-label">Phone</label>
                        <input
                            className="field-input mt-1.5"
                            value={contact.phone || ""}
                            onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                            placeholder="+91 …"
                        />
                    </div>
                    <div>
                        <label className="stat-label">GSTIN</label>
                        <input
                            className="field-input mt-1.5 font-mono uppercase tracking-wider"
                            value={contact.gstin || ""}
                            onChange={(e) => setContact((c) => ({ ...c, gstin: e.target.value.toUpperCase() }))}
                            placeholder="22AAAAA0000A1Z5"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="stat-label">Billing address</label>
                        <textarea
                            className="field-input mt-1.5"
                            rows={3}
                            value={contact.address || ""}
                            onChange={(e) => setContact((c) => ({ ...c, address: e.target.value }))}
                            placeholder="Registered address as per GST"
                        />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button variant="primary" onClick={handleSaveContact} isLoading={savingContact}>
                        Save contact
                    </Button>
                </div>
            </Card>

            {/* Invoices */}
            <Card className="p-6">
                <h2 className="text-lg font-semibold text-gray-900">Invoices</h2>
                <p className="text-sm text-gray-500">All invoices ever issued for this institute.</p>
                <div className="mt-4">
                    {invoices.length === 0 ? (
                        <p className="rounded border border-dashed border-slate-200 p-6 text-center text-sm text-gray-500">
                            No invoices yet. They&apos;ll appear here once your subscription becomes paid.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="text-xs uppercase tracking-wider text-gray-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Number</th>
                                        <th className="px-3 py-2 text-left">Plan</th>
                                        <th className="px-3 py-2 text-left">Period</th>
                                        <th className="px-3 py-2 text-right">Total</th>
                                        <th className="px-3 py-2 text-left">Status</th>
                                        <th className="px-3 py-2 text-right">PDF</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {invoices.map((inv) => (
                                        <tr key={inv.id}>
                                            <td className="px-3 py-2 font-mono text-xs">{inv.number}</td>
                                            <td className="px-3 py-2">
                                                {INSTITUTE_BILLING_PLANS[inv.planId]?.name || inv.planId}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-gray-500">
                                                {inv.periodStart
                                                    ? new Date(inv.periodStart).toLocaleDateString("en-IN")
                                                    : "—"}{" "}
                                                –{" "}
                                                {inv.periodEnd
                                                    ? new Date(inv.periodEnd).toLocaleDateString("en-IN")
                                                    : "—"}
                                            </td>
                                            <td className="px-3 py-2 text-right">{formatINR(inv.totalINR)}</td>
                                            <td className="px-3 py-2">
                                                <span className={statusChip(inv.status)}>{inv.status}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {inv.pdfUrl ? (
                                                    <a
                                                        className="text-primary-700 hover:underline text-xs"
                                                        href={inv.pdfUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Download
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
