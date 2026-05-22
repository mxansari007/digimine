"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthContext } from "@/contexts/AuthContext";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export default function RoleSelectPage() {
    const router = useRouter();
    const { user, firebaseUser, loading, isAuthenticated } = useAuthContext();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!loading && !isAuthenticated) router.push("/login");
        if (!loading && user?.role) {
            if (user.role === "teacher") router.push("/teacher/dashboard");
            else if (user.role === "institute_admin") router.push("/institute/dashboard");
            else router.push("/dashboard");
        }
    }, [loading, isAuthenticated, user]);

    const selectRole = async (role: "student" | "teacher" | "institute") => {
        if (!firebaseUser) return;
        setSaving(true); setError("");
        try {
            const ref = doc(db, "users", firebaseUser.uid);
            const snap = await getDoc(ref);
            if (!snap.exists()) { setError("Profile not found."); return; }
            if (role === "teacher") {
                // Don't commit role=teacher yet — the onboarding profile step
                // does the atomic write of users/{uid}.role + teachers/{uid}.
                // This keeps role-less users out of the dashboard if they
                // abandon the funnel.
                router.push("/teacher/onboarding/phone");
            } else if (role === "institute") {
                // Same pattern as teacher: the institute onboarding wizard
                // creates the institute and promotes the role atomically.
                router.push("/institute/onboarding");
            } else {
                await updateDoc(ref, { role: "customer" });
                router.push("/dashboard");
            }
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    if (loading || !isAuthenticated) return <div className="flex items-center justify-center min-h-screen bg-slate-100"><div className="text-gray-500">Loading...</div></div>;

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
            <div className="max-w-lg w-full text-center">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Digimine!</h1>
                <p className="text-gray-500 mb-8">Choose how you want to use Digimine.</p>
                {error && <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <button onClick={() => selectRole("student")} disabled={saving} className="p-6 bg-white border border-gray-200 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all text-left group disabled:opacity-50">
                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4"><svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">I am a Student</h2>
                        <p className="text-gray-500 text-sm">Practice quizzes, take tests, and join classrooms.</p>
                    </button>
                    <button onClick={() => selectRole("teacher")} disabled={saving} className="p-6 bg-white border border-gray-200 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all text-left group disabled:opacity-50">
                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4"><svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg></div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">I am a Teacher</h2>
                        <p className="text-gray-500 text-sm">Create content, manage classrooms, and earn money.</p>
                    </button>
                    <button onClick={() => selectRole("institute")} disabled={saving} className="p-6 bg-white border border-gray-200 rounded-2xl hover:border-emerald-300 hover:shadow-md transition-all text-left group disabled:opacity-50">
                        <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-4"><svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-7m0 7h18M3 14h18M3 14V7a2 2 0 012-2h14a2 2 0 012 2v7M9 9h.01M9 13h.01M15 9h.01M15 13h.01" /></svg></div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">I run an Institute</h2>
                        <p className="text-gray-500 text-sm">Onboard teachers, manage batches, run institute-wide tests.</p>
                    </button>
                </div>
                {saving && <div className="mt-6 flex items-center justify-center gap-2 text-gray-500"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />Setting up...</div>}
            </div>
        </div>
    );
}
