"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { ContestForm } from "@/components/contests/ContestForm";
import { getContest } from "@/lib/firestore/contests";
import type { Contest } from "@digimine/types";

export default function EditContestPage() {
    const params = useParams();
    const router = useRouter();
    const contestId = params.id as string;
    const [contest, setContest] = useState<Contest | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadContest() {
            try {
                setLoading(true);
                const data = await getContest(contestId);
                if (!data) {
                    router.push("/contests");
                    return;
                }
                setContest(data);
            } catch (error) {
                console.error("Failed to load contest:", error);
            } finally {
                setLoading(false);
            }
        }
        loadContest();
    }, [contestId, router]);

    if (loading) {
        return (
            <Card className="p-8 text-center text-slate-500">
                Loading contest...
            </Card>
        );
    }

    if (!contest) return null;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/contests">
                    <Button variant="outline" size="sm">Back</Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Edit Contest</h1>
                    <p className="mt-1 text-slate-500">{contest.title}</p>
                </div>
            </div>
            <ContestForm contest={contest} />
        </div>
    );
}
