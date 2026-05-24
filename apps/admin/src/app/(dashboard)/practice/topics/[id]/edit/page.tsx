"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@digimine/ui";
import type { PracticeTopic } from "@digimine/types";
import { PracticeTopicForm } from "@/components/practice/PracticeTopicForm";
import { deleteTopic, getTopic, updateTopic } from "@/lib/firestore/practiceTopics";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function EditPracticeTopicPage() {
    const params = useParams();
    const router = useRouter();
    const { firebaseUser } = useAdminAuth();
    const id = String(params?.id || "");

    const [topic, setTopic] = useState<PracticeTopic | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const t = await getTopic(id);
                if (!cancelled) setTopic(t);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id]);

    const remove = async () => {
        if (!topic) return;
        if (!confirm(`Delete topic "${topic.title}"? This cannot be undone.`)) return;
        setSaving(true);
        try {
            await deleteTopic(id);
            router.push("/practice/topics");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete");
            setSaving(false);
        }
    };

    if (loading) {
        return <p className="text-sm text-slate-500">Loading…</p>;
    }
    if (!topic) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-rose-700">Topic not found.</p>
                <Link href="/practice/topics">
                    <Button variant="outline">Back to all topics</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <Link
                        href="/practice/topics"
                        className="text-xs text-slate-500 hover:text-slate-900"
                    >
                        ← All topics
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">{topic.title}</h1>
                    <p className="mt-1 font-mono text-xs text-slate-400">
                        /practice/topics/{topic.slug}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {topic.status === "published" && (
                        <a
                            href={`/practice/topics/${topic.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary-700 hover:underline"
                        >
                            View live ↗
                        </a>
                    )}
                    <Button
                        variant="ghost"
                        className="!text-rose-600"
                        onClick={remove}
                        isLoading={saving}
                    >
                        Delete
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                </div>
            )}

            <PracticeTopicForm
                initial={topic}
                submitting={saving}
                onSubmit={async (input) => {
                    if (!firebaseUser) {
                        setError("Sign in required");
                        return;
                    }
                    setSaving(true);
                    setError(null);
                    try {
                        await updateTopic(id, input, firebaseUser.uid);
                        const fresh = await getTopic(id);
                        if (fresh) setTopic(fresh);
                    } catch (e) {
                        setError(e instanceof Error ? e.message : "Failed to save");
                    } finally {
                        setSaving(false);
                    }
                }}
            />
        </div>
    );
}
