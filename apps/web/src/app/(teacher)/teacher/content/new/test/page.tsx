"use client";

import { useRouter } from "next/navigation";
import { TestSeriesForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { createTeacherTest } from "@/lib/firestore/teacherContent";
import type { CreateTestSeriesInput } from "@digimine/types";

export default function CreateTeacherTestPage() {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();

    const handleSubmit = async (
        payload: CreateTestSeriesInput,
        onSuccess: () => void,
    ) => {
        if (!firebaseUser?.uid) {
            throw new Error("You must be signed in as a teacher to create a test series.");
        }
        // Capture the new doc id so we can continue the authoring flow
        // straight into "add tests inside this series" instead of dumping
        // the teacher back on /teacher/content where they'd have to drill
        // back in by hand.
        const seriesId = await createTeacherTest(firebaseUser.uid, {
            ...payload,
            totalTests: 0,
            totalQuestions: 0,
            createdBy: firebaseUser.uid,
        } as any);
        onSuccess();
        router.push(`/teacher/content/tests/${seriesId}/tests`);
        router.refresh();
    };

    return (
        <TestSeriesForm
            actingUserId={firebaseUser?.uid || ""}
            storage={storage}
            onSubmit={handleSubmit}
            onCancelPath="/teacher/content"
            mode="teacher"
        />
    );
}
