"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@digimine/ui";
import { ArticleForm } from "@/components/articles/ArticleForm";
import { createArticle } from "@/lib/firestore/articles";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function CreateArticlePage() {
    const router = useRouter();
    const { firebaseUser, user } = useAdminAuth();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <Link href="/articles" className="text-xs text-slate-500 hover:text-slate-900">
                        ← All articles
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">New article</h1>
                </div>
                <Link href="/articles">
                    <Button variant="ghost">Cancel</Button>
                </Link>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
            )}

            <ArticleForm
                submitting={saving}
                onSubmit={async (payload) => {
                    if (!firebaseUser) {
                        setError("Sign in required");
                        return;
                    }
                    setSaving(true);
                    setError(null);
                    try {
                        const id = await createArticle(payload, {
                            userId: firebaseUser.uid,
                            name: user?.displayName || firebaseUser.email || "Admin",
                            avatarUrl: user?.photoURL || firebaseUser.photoURL || null,
                        });
                        router.push(`/articles/${id}/edit`);
                    } catch (err: any) {
                        console.error("Create article failed", err);
                        setError(err.message || "Failed to create article");
                    } finally {
                        setSaving(false);
                    }
                }}
            />
        </div>
    );
}
