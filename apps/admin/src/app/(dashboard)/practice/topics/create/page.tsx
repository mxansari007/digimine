"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@digimine/ui";
import { PracticeTopicForm } from "@/components/practice/PracticeTopicForm";
import { createTopic } from "@/lib/firestore/practiceTopics";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function CreatePracticeTopicPage() {
    const router = useRouter();
    const { firebaseUser } = useAdminAuth();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">New topic</h1>
                </div>
                <Link href="/practice/topics">
                    <Button variant="ghost">Cancel</Button>
                </Link>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                </div>
            )}

            <PracticeTopicForm
                submitting={saving}
                onSubmit={async (input) => {
                    if (!firebaseUser) {
                        setError("Sign in required");
                        return;
                    }
                    setSaving(true);
                    setError(null);
                    try {
                        const id = await createTopic(input, firebaseUser.uid);
                        router.push(`/practice/topics/${id}/edit`);
                    } catch (e) {
                        setError(e instanceof Error ? e.message : "Failed to create topic");
                    } finally {
                        setSaving(false);
                    }
                }}
            />
        </div>
    );
}
