import { Skeleton } from "@digimine/ui";

export default function Loading() {
    return (
        <div className="min-h-screen bg-slate-50">
            <section className="bg-[#020617] py-14 lg:py-20">
                <div className="container-page">
                    <Skeleton className="h-8 w-44 rounded-full bg-white/10" />
                    <Skeleton className="mt-6 h-12 w-full max-w-3xl bg-white/10" />
                    <Skeleton className="mt-5 h-4 w-full max-w-2xl bg-white/10" />
                    <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 w-full rounded-2xl bg-white/10" />
                        ))}
                    </div>
                </div>
            </section>
            <section className="container-page py-10">
                <Skeleton className="mb-8 h-28 w-full rounded-2xl" />
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-sm">
                            <Skeleton className="aspect-[16/9] w-full rounded-none" />
                            <div className="space-y-3 p-5">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-6 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-10 w-full rounded-lg" />
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
