import { Card, Skeleton } from "@digimine/ui";

// Instant feedback on nav click before the practice dashboard mounts.
export default function Loading() {
    return (
        <main className="min-h-screen bg-slate-50">
            <section className="border-b border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950">
                <div className="container-page py-12 sm:py-16">
                    <Skeleton className="h-3 w-20 bg-white/20" />
                    <Skeleton className="mt-3 h-9 w-96 max-w-full bg-white/20" />
                    <Skeleton className="mt-3 h-4 w-full max-w-xl bg-white/10" />
                </div>
            </section>
            <div className="container-page space-y-6 py-8">
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i} className="p-5">
                            <Skeleton className="h-8 w-14" />
                            <Skeleton className="mt-2 h-3 w-20" />
                        </Card>
                    ))}
                </div>
                <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
                    <Card className="p-5">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="mt-4 h-72 w-full" />
                    </Card>
                    <Card className="p-6">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="mt-4 h-48 w-full" />
                    </Card>
                </div>
            </div>
        </main>
    );
}
