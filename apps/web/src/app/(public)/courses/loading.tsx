import { Skeleton } from "@digimine/ui";

// Instant navigation feedback: Next renders this immediately (and prefetches
// it) while the server component streams — no click-to-paint lag.
export default function Loading() {
    return (
        <div className="min-h-screen bg-slate-50">
            <section className="border-b border-slate-200 bg-white py-16">
                <div className="container-page">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="mt-4 h-10 w-full max-w-xl" />
                    <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
                </div>
            </section>
            <section className="container-page pb-16 pt-8">
                <Skeleton className="h-16 w-full rounded-2xl" />
                <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                            <Skeleton className="h-44 w-full rounded-none" />
                            <div className="space-y-3 p-5">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-6 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
