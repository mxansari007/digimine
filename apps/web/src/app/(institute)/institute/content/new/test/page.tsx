"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { TestSeriesForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { createTeacherTest } from "@/lib/firestore/teacherContent";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { ClassPicker } from "@/components/institute/ClassPicker";
import type { CreateTestSeriesInput } from "@digimine/types";

export default function InstituteCreateTestPage() {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [classIds, setClassIds] = useState<string[]>([]);

    useEffect(() => {
        if (!firebaseUser) return;
        (async () => {
            const res = await teacherFetch(firebaseUser, "/api/institute/me");
            const data = await res.json();
            if (data?.institute?.id) setInstituteId(data.institute.id);
        })();
    }, [firebaseUser]);

    const handleSubmit = async (payload: CreateTestSeriesInput, onSuccess: () => void) => {
        if (!firebaseUser?.uid) throw new Error("Sign in");
        if (!instituteId) throw new Error("Institute not loaded");
        // Capture id so we can continue into "add tests inside this
        // series". Institute admins manage these subpages on the teacher
        // subtree — matches how /institute/content already links into
        // /teacher/content/tests/{id}/tests for the same action.
        const seriesId = await createTeacherTest(
            firebaseUser.uid,
            {
                ...payload,
                totalTests: 0,
                totalQuestions: 0,
                createdBy: firebaseUser.uid,
            } as any,
            { instituteId, classIds }
        );
        onSuccess();
        router.push(`/teacher/content/tests/${seriesId}/tests`);
        router.refresh();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/institute/content">
                    <Button variant="outline" size="sm">
                        ← Back
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Create test series</h1>
                    <p className="mt-1 text-slate-500">
                        Series can hold many timed tests. Add the series here, then add tests inside it.
                    </p>
                </div>
            </div>

            <Card className="p-6">
                <h3 className="text-sm font-semibold text-slate-900">Target classes</h3>
                <p className="text-xs text-slate-500 mt-1">
                    Every test you add inside this series will go to these classes.
                </p>
                {instituteId && (
                    <div className="mt-4">
                        <ClassPicker
                            firebaseUser={firebaseUser}
                            instituteId={instituteId}
                            selected={classIds}
                            onChange={setClassIds}
                        />
                    </div>
                )}
            </Card>

            <TestSeriesForm
                actingUserId={firebaseUser?.uid || ""}
                storage={storage}
                onSubmit={handleSubmit}
                onCancelPath="/institute/content"
                mode="teacher"
            />
        </div>
    );
}
