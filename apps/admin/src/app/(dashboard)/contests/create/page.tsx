import Link from "next/link";
import { Button } from "@digimine/ui";
import { ContestForm } from "@/components/contests/ContestForm";

export default function CreateContestPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/contests">
                    <Button variant="outline" size="sm">Back</Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Create Contest</h1>
                    <p className="mt-1 text-slate-500">Schedule one existing test as a live ranked contest.</p>
                </div>
            </div>
            <ContestForm />
        </div>
    );
}
