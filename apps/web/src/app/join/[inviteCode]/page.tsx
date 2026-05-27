"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";

type LookupResult = {
    class?: {
        id: string;
        name: string;
        description: string | null;
        teacherId: string;
    } | null;
    teacher?: {
        id: string;
        profile?: { name?: string; institute?: string; avatarUrl?: string | null };
        inviteCode?: string;
    } | null;
};

export default function JoinPage() {
    const params = useParams();
    const router = useRouter();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const inviteCode = params.inviteCode as string;

    const [data, setData] = useState<LookupResult>({});
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setLoading(true);
        fetch(`/api/classroom/lookup-invite?inviteCode=${encodeURIComponent(inviteCode)}`)
            .then((r) => r.json())
            .then((d) => setData(d as LookupResult))
            .catch(() => setData({}))
            .finally(() => setLoading(false));
    }, [inviteCode]);

    const classDoc = data.class || null;
    const teacher = data.teacher || null;

    const handleJoin = async () => {
        if (!firebaseUser) return;
        setJoining(true);
        setError("");
        try {
            const body: Record<string, unknown> = {
                studentId: firebaseUser.uid,
                studentEmail: firebaseUser.email,
                studentName: firebaseUser.displayName,
            };
            if (classDoc?.id) body.classId = classDoc.id;
            else body.inviteCode = inviteCode;

            const token = await firebaseUser!.getIdToken();
            const res = await fetch("/api/classroom/enroll", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to join");
            const target = result.classId
                ? `/classroom/${result.classId}`
                : result.teacherId
                ? `/classroom/legacy:${result.teacherId}`
                : "/dashboard";
            router.push(target);
        } catch (err: any) {
            setError(err.message || "Failed to join");
        }
        setJoining(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="text-gray-500">Looking up invite...</div>
            </div>
        );
    }

    if (!classDoc && !teacher) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <Card className="p-8 text-center">
                    <p className="text-gray-500 mb-4">Invalid or expired invite code.</p>
                    <Link href="/dashboard" className="text-indigo-600">← Back to Dashboard</Link>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center py-12 px-4">
            <Card className="max-w-md w-full p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 p-[2px]">
                    <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-3xl font-bold text-indigo-700">
                        {(classDoc?.name?.[0] || teacher?.profile?.name?.[0] || "C").toUpperCase()}
                    </div>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">
                    {classDoc?.name || teacher?.profile?.name || "Class"}
                </h1>
                <p className="text-gray-500">
                    {classDoc
                        ? `Taught by ${teacher?.profile?.name || "Teacher"}${teacher?.profile?.institute ? ` · ${teacher.profile.institute}` : ""}`
                        : teacher?.profile?.institute || ""}
                </p>
                {classDoc?.description && (
                    <p className="text-sm text-gray-500 mt-3">{classDoc.description}</p>
                )}

                {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

                {!authLoading && firebaseUser ? (
                    <Button variant="primary" className="mt-6 w-full" onClick={handleJoin} isLoading={joining}>
                        Join {classDoc ? "Class" : "Classroom"}
                    </Button>
                ) : !authLoading ? (
                    <Link href={`/login?redirect=/join/${inviteCode}`}>
                        <Button className="mt-6 w-full">Sign in to join</Button>
                    </Link>
                ) : null}
            </Card>
        </div>
    );
}
