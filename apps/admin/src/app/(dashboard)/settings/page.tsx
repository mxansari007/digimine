"use client";

import { useState } from "react";
import { Button, Card } from "@digimine/ui";
import { authedFetch } from "@/lib/api";

type ReindexResult = {
    ok: boolean;
    total: number;
    counts: Partial<Record<string, number>>;
    durationMs: number;
};

export default function SettingsPage() {
    const [reindexing, setReindexing] = useState(false);
    const [result, setResult] = useState<ReindexResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reindex = async () => {
        if (
            !confirm(
                "Rebuild the search index now? This wipes the current Meilisearch index and re-uploads every published doc. Takes a few seconds."
            )
        )
            return;
        setReindexing(true);
        setResult(null);
        setError(null);
        try {
            const res = await authedFetch("/api/admin/search/reindex", {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            setResult(data as ReindexResult);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Reindex failed.");
        } finally {
            setReindexing(false);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

            <Card padding="lg">
                <h2 className="text-lg font-medium text-gray-900 mb-1">Search index</h2>
                <p className="mb-4 text-sm text-gray-500">
                    Rebuilds the Meilisearch catalog index from Firestore. Run this once after
                    the Heroku container is deployed — and again any time you suspect the index
                    is stale (Heroku Eco restarts wipe the index every ~24 hours).
                </p>
                <Button onClick={reindex} isLoading={reindexing} variant="primary">
                    {reindexing ? "Rebuilding…" : "Rebuild search index"}
                </Button>

                {error && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                )}

                {result && (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
                        <p className="font-semibold text-emerald-900">
                            Indexed {result.total} documents in {(result.durationMs / 1000).toFixed(1)}s
                        </p>
                        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-emerald-800 sm:grid-cols-3">
                            {Object.entries(result.counts)
                                .filter(([, n]) => typeof n === "number")
                                .sort((a, b) => (b[1] as number) - (a[1] as number))
                                .map(([type, n]) => (
                                    <li key={type} className="flex justify-between">
                                        <span className="capitalize">{type}s</span>
                                        <span className="font-mono">{n}</span>
                                    </li>
                                ))}
                        </ul>
                    </div>
                )}
            </Card>

            <Card padding="lg">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Store Configuration</h2>
                <p className="text-gray-500">Settings placeholder.</p>
            </Card>

            <Card padding="lg">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Admin Management</h2>
                <p className="text-gray-500">Role management placeholder.</p>
            </Card>
        </div>
    );
}
