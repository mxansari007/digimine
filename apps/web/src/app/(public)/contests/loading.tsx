import { Skeleton } from "@digimine/ui";

export default function Loading() {
    return (
        <div className="min-h-screen bg-slate-50 py-12">
            <div className="container-page space-y-10">
                <section className="rounded-[2rem] bg-[#020617] px-6 py-10 sm:px-10">
                    <Skeleton className="h-7 w-44 rounded-full bg-white/10" />
                    <Skeleton className="mt-5 h-10 w-56 bg-white/10" />
                    <Skeleton className="mt-4 h-4 w-full max-w-2xl bg-white/10" />
                </section>
                <div className="space-y-4">
                    <Skeleton className="h-7 w-40" />
                    <div className="grid gap-5">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-[220px_1fr]">
                                <Skeleton className="h-48 w-full rounded-none" />
                                <div className="space-y-3 p-6">
                                    <Skeleton className="h-3 w-32" />
                                    <Skeleton className="h-7 w-2/3" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-9 w-32 rounded-lg" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
