"use client";

/**
 * Teacher "Edit Test Series" page. Loads the series by id, hands it to the
 * shared `TestSeriesForm` as `initialData`, and persists through
 * `updateTeacherTest`.
 *
 * The questions for an individual test inside the series are managed on the
 * existing `/teacher/content/tests/[id]/tests/...` routes — this page only
 * edits the series-level metadata (title, thumbnail, settings).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { TestSeriesForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import {
    getOwnedTeacherTest,
    updateTeacherTest,
} from "@/lib/firestore/teacherContent";
import type { CreateTestSeriesInput, TestSeries } from "@digimine/types";

export default function EditTeacherTestSeriesPage() {
    const params = useParams();
    const router = useRouter();
    const seriesId = params.id as string;
    const { firebaseUser } = useAuthContext();

    const [series, setSeries] = useState<TestSeries | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!firebaseUser?.uid) return;
        let mounted = true;
        getOwnedTeacherTest(firebaseUser.uid, seriesId)
            .then((data) => {
                if (!mounted) return;
                if (!data) {
                    setError("Test series not found or you don't have access.");
                    return;
                }
                setSeries(data);
            })
            .catch((err) => {
                if (!mounted) return;
                setError(
                    err instanceof Error ? err.message : "Failed to load test series."
                );
            })
            .finally(() => mounted && setLoading(false));
        return () => {
            mounted = false;
        };
    }, [firebaseUser?.uid, seriesId]);

    const handleSubmit = async (
        payload: CreateTestSeriesInput,
        onSuccess: () => void
    ) => {
        if (!firebaseUser?.uid) {
            throw new Error("You must be signed in as a teacher to edit a test series.");
        }
        await updateTeacherTest(firebaseUser.uid, seriesId, payload as Partial<TestSeries>);
        onSuccess();
        router.push("/teacher/content");
        router.refresh();
    };

    if (loading) {
        return (
            <Card className="p-8 text-center text-slate-500">
                Loading test series...
            </Card>
        );
    }

    if (error || !series) {
        return (
            <div className="space-y-4">
                <Link href="/teacher/content">
                    <Button variant="outline" size="sm">← Back</Button>
                </Link>
                <Card className="p-8 text-center text-red-600">
                    {error || "Test series not found."}
                </Card>
            </div>
        );
    }

    // The shared form expects `CreateTestSeriesInput & { id?: string }` — the
    // loaded TestSeries is structurally compatible (it has all the same fields
    // plus a few read-only metadata fields the form ignores).
    return (
        <TestSeriesForm
            initialData={series as unknown as CreateTestSeriesInput & { id?: string }}
            actingUserId={firebaseUser?.uid || ""}
            storage={storage}
            onSubmit={handleSubmit}
            onCancelPath="/teacher/content"
            mode="teacher"
        />
    );
}
