"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { QuizForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { createTeacherQuiz } from "@/lib/firestore/teacherContent";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { ClassPicker } from "@/components/institute/ClassPicker";

export default function InstituteCreateQuizPage() {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [classIds, setClassIds] = useState<string[]>([]);
    const [loadingMe, setLoadingMe] = useState(true);

    useEffect(() => {
        if (!firebaseUser) return;
        (async () => {
            try {
                const res = await teacherFetch(firebaseUser, "/api/institute/me");
                const data = await res.json();
                if (data?.institute?.id) setInstituteId(data.institute.id);
            } finally {
                setLoadingMe(false);
            }
        })();
    }, [firebaseUser]);

    const handleSubmit = useCallback(
        async (payload: Parameters<typeof createTeacherQuiz>[1]) => {
            if (!firebaseUser?.uid) throw new Error("Sign in");
            if (!instituteId) throw new Error("Institute not loaded");
            // Continue into the quiz questions editor. The teacher
            // subtree handles institute admins fine — the (teacher)
            // layout guard accepts isTeacher || isInstituteAdmin.
            const quizId = await createTeacherQuiz(firebaseUser.uid, payload, {
                instituteId,
                classIds,
            });
            router.push(`/teacher/content/quizzes/${quizId}/questions`);
            router.refresh();
        },
        [firebaseUser, instituteId, classIds, router]
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/institute/content">
                    <Button variant="outline" size="sm">
                        ← Back
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Create quiz</h1>
                    <p className="mt-1 text-slate-500">
                        Build a quiz once — push it to one or many of your classes at the same time.
                    </p>
                </div>
            </div>

            <Card className="p-6">
                <h3 className="text-sm font-semibold text-slate-900">Target classes</h3>
                <p className="text-xs text-slate-500 mt-1">
                    Pick which batches see this quiz. You can also change this later from the content list.
                </p>
                {!loadingMe && instituteId && (
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

            <QuizForm
                onSubmit={handleSubmit}
                onCancel={() => router.push("/institute/content")}
                storage={storage}
                mode="teacher"
            />
        </div>
    );
}
