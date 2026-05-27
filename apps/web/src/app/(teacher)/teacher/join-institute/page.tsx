"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { getTeacher } from "@/lib/firestore/teachers";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

export default function JoinInstitutePage() {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();
    const [code, setCode] = useState("");
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState("");
    const [currentInstituteId, setCurrentInstituteId] = useState<string | null>(null);

    useEffect(() => {
        if (!firebaseUser) return;
        getTeacher(firebaseUser.uid).then((t) => {
            const id = (t as any)?.instituteId;
            setCurrentInstituteId(typeof id === "string" && id ? id : null);
        });
    }, [firebaseUser]);

    const handleJoin = async () => {
        if (!firebaseUser || !code.trim()) return;
        setJoining(true);
        setError("");
        try {
            const res = await teacherFetch(firebaseUser, "/api/institute/join", {
                method: "POST",
                body: JSON.stringify({ inviteCode: code.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to join");
            alert(`Joined "${data.institute.name}". Your dashboard now reflects this institute.`);
            router.push("/teacher/dashboard");
        } catch (err: any) {
            setError(err.message || "Failed to join");
        } finally {
            setJoining(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-bold text-gray-900">Join an institute</h1>
                    <HelpTutorial {...TUTORIALS.teacher_join_institute} />
                </div>
                <p className="mt-1 text-gray-500">
                    Have an invite code from your institute? Redeem it here.
                </p>
            </div>

            {currentInstituteId && (
                <Card intent="info" className="p-4 text-sm">
                    <p className="font-semibold text-info-700">You&apos;re already affiliated with an institute.</p>
                    <p className="text-info-700/80 mt-0.5">
                        Contact your institute admin to leave before joining another.
                    </p>
                </Card>
            )}

            <Card className="p-6">
                <label className="stat-label">Invite code</label>
                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="INS-XXXXXXXX"
                    className="field-input mt-2 font-mono uppercase tracking-wider"
                    disabled={Boolean(currentInstituteId)}
                />
                {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
                <div className="mt-4 flex justify-between items-center">
                    <Link href="/teacher/dashboard" className="text-xs text-gray-500 hover:text-gray-900">
                        ← Back to dashboard
                    </Link>
                    <Button
                        variant="primary"
                        onClick={handleJoin}
                        isLoading={joining}
                        disabled={!code.trim() || Boolean(currentInstituteId)}
                    >
                        Join institute
                    </Button>
                </div>
            </Card>
        </div>
    );
}
