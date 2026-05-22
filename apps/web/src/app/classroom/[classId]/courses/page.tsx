"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";

export default function ClassroomCoursesPage() {
    const params = useParams();
    const router = useRouter();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const classId = params.classId as string;
    const isLegacy = classId.startsWith("legacy:");
    const legacyTeacherId = isLegacy ? classId.replace(/^legacy:/, "") : "";

    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            router.push(`/login?redirect=${encodeURIComponent(`/classroom/${classId}/courses`)}`);
            return;
        }
        const authUser = firebaseUser;

        async function loadItems() {
            setLoading(true);
            setError("");
            try {
                const token = await authUser.getIdToken();
                const url = isLegacy
                    ? `/api/classroom/${legacyTeacherId}/content-list?type=courses`
                    : `/api/classes/${classId}/content-list?type=courses`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Could not load courses.");
                setItems(data.items || []);
            } catch (err) {
                setItems([]);
                setError(err instanceof Error ? err.message : "Could not load courses.");
            } finally {
                setLoading(false);
            }
        }

        loadItems();
    }, [authLoading, firebaseUser, router, classId, isLegacy, legacyTeacherId]);

    if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-gray-500">Loading...</div>;

    return (
        <div className="min-h-screen bg-slate-100 py-12 px-4">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    <Link href={`/classroom/${classId}`} className="text-gray-500 hover:text-gray-700">← Back</Link>
                    <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
                </div>
                {error ? (
                    <Card className="p-12 text-center text-red-600">{error}</Card>
                ) : items.length === 0 ? (
                    <Card className="p-12 text-center text-gray-500">No published courses yet.</Card>
                ) : (
                    <div className="grid gap-4">
                        {items.map((item) => (
                            <Card key={item.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/classroom/${classId}/content/${item.id}?type=course`)}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{item.title}</h3>
                                        <p className="text-gray-500 text-sm mt-1">{item.description}</p>
                                    </div>
                                    <div className="text-gray-400 text-sm text-right">
                                        {item.estimatedHours > 0 && <div>{item.estimatedHours} hours</div>}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
