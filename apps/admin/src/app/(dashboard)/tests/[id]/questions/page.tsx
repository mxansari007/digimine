"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";

export default function LegacyQuestionsPage() {
    const params = useParams();
    const router = useRouter();
    const seriesId = params.id as string;

    useEffect(() => {
        router.replace(`/tests/${seriesId}/tests`);
    }, [router, seriesId]);

    return (
        <div className="flex min-h-[60vh] items-center justify-center">
            <Card className="max-w-md p-8 text-center">
                <h1 className="text-2xl font-bold text-gray-900">Questions moved into tests</h1>
                <p className="mt-3 text-gray-500">
                    Questions are now managed inside each individual test. Choose a test first, then open its question editor.
                </p>
                <Link href={`/tests/${seriesId}/tests`}>
                    <Button className="mt-6">
                        Open Test Manager
                    </Button>
                </Link>
            </Card>
        </div>
    );
}
