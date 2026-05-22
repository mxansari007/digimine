import { Skeleton } from "@digimine/ui";

export default function Loading() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container-page py-4 lg:py-8">
                <div className="mb-6 md:mb-8">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="mt-2 h-4 w-full max-w-xl" />
                </div>
                <div className="flex flex-col gap-8 lg:flex-row">
                    <aside className="hidden w-64 flex-shrink-0 lg:block">
                        <Skeleton className="h-96 w-full rounded-2xl" />
                    </aside>
                    <div className="flex-1">
                        <Skeleton className="mb-6 h-12 w-full rounded-xl" />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="overflow-hidden rounded-2xl border-0 bg-white shadow-sm">
                                    <Skeleton className="aspect-[4/3] w-full rounded-none" />
                                    <div className="space-y-2 p-4">
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-3 w-2/3" />
                                        <Skeleton className="h-5 w-1/3" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
