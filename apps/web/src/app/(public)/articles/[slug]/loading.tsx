import { Card, Skeleton } from "@digimine/ui";

/**
 * Instant feedback when navigating into an article. Mirrors the real
 * article layout (breadcrumb, category chip, title, author row, cover,
 * body lines, sidebar TOC) so the user sees structure not a spinner.
 */
export default function Loading() {
    return (
        <main className="bg-white">
            <div className="container-page py-10 sm:py-14">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
                    <article className="min-w-0 max-w-3xl">
                        <Skeleton className="h-3 w-24" />

                        <div className="mt-5 flex flex-wrap items-center gap-2">
                            <Skeleton className="h-5 w-20 rounded-full" />
                            <Skeleton className="h-3 w-16" />
                        </div>

                        <Skeleton className="mt-4 h-9 w-full" />
                        <Skeleton className="mt-2 h-9 w-4/5" />
                        <Skeleton className="mt-4 h-4 w-full max-w-xl" />

                        <div className="mt-6 flex items-center gap-3">
                            <Skeleton circle className="h-9 w-9" />
                            <div className="space-y-1.5">
                                <Skeleton className="h-3 w-32" />
                                <Skeleton className="h-3 w-44" />
                            </div>
                        </div>

                        <Skeleton className="mt-8 h-56 w-full rounded-2xl" />

                        <div className="mt-10 space-y-3">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-11/12" />
                            <Skeleton className="h-4 w-10/12" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="mt-6 h-6 w-2/3" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-11/12" />
                            <Skeleton className="h-4 w-9/12" />
                            <Skeleton className="mt-6 h-6 w-1/2" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-10/12" />
                            <Skeleton className="h-4 w-11/12" />
                        </div>

                        <div className="mt-12 flex flex-wrap gap-2 border-t border-slate-200 pt-6">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-6 w-16 rounded-full" />
                            ))}
                        </div>
                    </article>

                    {/* TOC sidebar skeleton */}
                    <aside className="hidden lg:block">
                        <Card className="sticky top-24 p-5">
                            <Skeleton className="h-3 w-24" />
                            <div className="mt-4 space-y-2.5">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <Skeleton key={i} className={`h-3 ${i % 3 === 0 ? "w-full" : "w-4/5"}`} />
                                ))}
                            </div>
                        </Card>
                    </aside>
                </div>
            </div>
        </main>
    );
}
