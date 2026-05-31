import { Skeleton } from "@digimine/ui";

// Instant feedback on nav click while the articles list loads.
export default function Loading() {
    return (
        <main className="min-h-screen bg-white">
            <section className="border-b border-slate-200 bg-gradient-to-br from-slate-50 to-white dark:to-surface">
                <div className="container-page py-12 sm:py-16">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-3 h-9 w-80 max-w-full" />
                    <Skeleton className="mt-3 h-4 w-full max-w-xl" />
                </div>
            </section>
            <section className="container-page space-y-10 py-10">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <Skeleton className="h-40 w-full rounded-none" />
                            <div className="space-y-3 p-5">
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-5 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-2/3" />
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </main>
    );
}
