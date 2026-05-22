"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { storage } from "@/lib/firebase/client";
import { FileUpload } from "@digimine/shared";
import { teacherFetch } from "@/lib/api/teacherFetch";

function generateInviteCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "TEACH_";
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

export default function ProfileOnboardingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const phone = searchParams.get("phone") || "";
    const { firebaseUser, isAuthenticated, loading: authLoading } = useAuthContext();
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [inviteCode] = useState(generateInviteCode());
    const [form, setForm] = useState({ name: "", institute: "", subjects: "", bio: "" });
    const [avatarUrl, setAvatarUrl] = useState("");

    useEffect(() => { if (!authLoading && !isAuthenticated) router.push("/login"); }, [authLoading, isAuthenticated]);
    if (authLoading || !isAuthenticated) return <div className="flex items-center justify-center min-h-screen bg-slate-100"><div className="text-gray-500">Loading...</div></div>;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firebaseUser || !form.name || !form.institute) { setError("Name and institute required."); return; }
        setLoading(true); setError("");
        try {
            const res = await teacherFetch(firebaseUser, "/api/teacher/onboard", {
                method: "POST",
                body: JSON.stringify({
                    step: "profile",
                    uid: firebaseUser.uid,
                    name: form.name,
                    institute: form.institute,
                    phone,
                    bio: form.bio,
                    avatarUrl: avatarUrl || firebaseUser.photoURL || null,
                    subjects: form.subjects.split(",").map((s) => s.trim()).filter(Boolean),
                    inviteCode,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to complete onboarding.");
                setLoading(false);
                return;
            }
            router.push("/teacher/dashboard");
        } catch (err: any) { setError(err.message); }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
            <Card className="w-full max-w-lg p-8">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Complete Your Profile</h1>
                    <p className="mt-1 text-gray-500">Step 3 of 3 — Profile Setup</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label><input type="text" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500" placeholder="Dr. A. P. J. Abdul Kalam" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Institute *</label><input type="text" required value={form.institute} onChange={(e) => setForm((p) => ({ ...p, institute: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500" placeholder="IIT Madras" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Subjects <span className="text-gray-400 font-normal">(comma separated)</span></label><input type="text" value={form.subjects} onChange={(e) => setForm((p) => ({ ...p, subjects: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500" placeholder="Physics, Mathematics" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Bio</label><textarea rows={3} value={form.bio} onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 resize-none" /></div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Profile Photo</label>
                        <FileUpload
                            label=""
                            path={`teachers/${firebaseUser?.uid || "draft"}/avatar`}
                            accept="image/*"
                            storage={storage}
                            existingUrl={avatarUrl || firebaseUser?.photoURL || undefined}
                            onUploadComplete={(url) => setAvatarUrl(url)}
                        />
                    </div>

                    <Card className="p-4 bg-primary-50 border-primary-200">
                        <div className="flex items-center justify-between">
                            <div><p className="text-xs text-gray-500 uppercase tracking-wide">Invite Code</p><p className="text-lg font-mono font-semibold text-primary-800">{inviteCode}</p></div>
                            <button type="button" onClick={() => navigator.clipboard.writeText(inviteCode)} className="px-3 py-1.5 bg-primary-100 hover:bg-primary-200 text-primary-800 text-sm rounded-lg">Copy</button>
                        </div>
                    </Card>

                    <Button variant="primary" className="w-full" type="submit" isLoading={loading}>Complete Setup & Start Trial</Button>
                </form>

                {error && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}
                <div className="flex justify-center gap-2 mt-6">
                    <div className="h-1.5 w-12 bg-primary-500 rounded-full" /><div className="h-1.5 w-12 bg-primary-500 rounded-full" /><div className="h-1.5 w-12 bg-primary-500 rounded-full" />
                </div>
            </Card>
        </div>
    );
}
