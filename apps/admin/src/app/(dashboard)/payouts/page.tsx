"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { authedFetch } from "@/lib/api";

export default function PayoutsPage() {
    const [payouts, setPayouts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadPayouts();
    }, []);

    const loadPayouts = async () => {
        setLoading(true);
        const q = query(collection(db, "payouts"), orderBy("initiatedAt", "desc"));
        const snapshot = await getDocs(q);
        setPayouts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
    };

    const handleProcess = async (payoutId: string, status: "processing" | "completed" | "failed") => {
        setError(null);
        try {
            const res = await authedFetch("/api/admin/payouts/process", {
                method: "POST",
                body: JSON.stringify({ payoutId, status }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `Failed (${res.status})`);
            }
            await loadPayouts();
        } catch (e: any) {
            setError(e.message || "Failed to update payout");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-950">Payouts</h1>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {payouts.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-500 shadow-sm">No payout requests yet.</div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr className="border-b border-slate-100">
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Teacher</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Amount</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Method</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payouts.map((payout) => (
                                <tr key={payout.id} className="border-b border-slate-100 hover:bg-primary-50/30">
                                    <td className="px-5 py-3 font-medium text-slate-800">{payout.teacherId}</td>
                                    <td className="px-5 py-3 text-slate-600">₹{payout.amount}</td>
                                    <td className="px-5 py-3 uppercase text-slate-600">{payout.method}</td>
                                    <td className="px-5 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusStyle(payout.status)}`}>
                                            {payout.status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3">
                                        {payout.status === "pending" && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleProcess(payout.id, "completed")}
                                                    className="rounded-lg bg-accent-600 px-3 py-1 text-xs text-white hover:bg-accent-700"
                                                >
                                                    Complete
                                                </button>
                                                <button
                                                    onClick={() => handleProcess(payout.id, "failed")}
                                                    className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                                                >
                                                    Fail
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function getStatusStyle(status: string) {
    switch (status) {
        case "pending":
            return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
        case "processing":
            return "bg-primary-50 text-primary-700 ring-1 ring-primary-200";
        case "completed":
            return "bg-accent-50 text-accent-700 ring-1 ring-accent-200";
        case "failed":
            return "bg-red-50 text-red-700 ring-1 ring-red-200";
        default:
            return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    }
}
