"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export default function TeachersPage() {
    const [teachers, setTeachers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTeachers();
    }, []);

    const loadTeachers = async () => {
        setLoading(true);
        const q = query(collection(db, "teachers"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        setTeachers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
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
            <h1 className="text-2xl font-bold text-slate-950">Teachers</h1>

            {teachers.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-500 shadow-sm">No teachers yet.</div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr className="border-b border-slate-100">
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Name</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Institute</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Plan</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Students</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Earnings</th>
                            </tr>
                        </thead>
                        <tbody>
                            {teachers.map((teacher) => (
                                <tr key={teacher.id} className="border-b border-slate-100 hover:bg-primary-50/30">
                                    <td className="px-5 py-3 font-medium text-slate-800">{teacher.profile?.name || "—"}</td>
                                    <td className="px-5 py-3 text-slate-600">{teacher.profile?.institute || "—"}</td>
                                    <td className="px-5 py-3 capitalize text-slate-600">{teacher.subscription?.planId || "free"}</td>
                                    <td className="px-5 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusStyle(teacher.subscription?.status)}`}>
                                            {teacher.subscription?.status || "free"}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-slate-600">{teacher.usage?.currentStudents || 0}</td>
                                    <td className="px-5 py-3 text-slate-600">₹{teacher.usage?.totalEarnings || 0}</td>
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
        case "active":
            return "bg-accent-50 text-accent-700 ring-1 ring-accent-200";
        case "grace_period":
            return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
        case "expired":
        case "cancelled":
            return "bg-red-50 text-red-700 ring-1 ring-red-200";
        default:
            return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    }
}
