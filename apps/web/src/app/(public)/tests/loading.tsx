import { Skeleton } from "@digimine/ui";

export default function Loading() {
    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mb-10 flex flex-col items-center gap-3">
                    <Skeleton className="h-5 w-40 rounded-full" />
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="h-4 w-full max-w-xl" />
                </div>
                <div className="mb-6 flex flex-col gap-3 sm:flex-row">
                    <Skeleton className="h-12 flex-1 rounded-xl" />
                    <Skeleton className="h-12 w-40 rounded-xl" />
                    <Skeleton className="h-12 w-40 rounded-xl" />
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                            <Skeleton className="h-48 w-full rounded-none" />
                            <div className="space-y-3 p-6">
                                <Skeleton className="h-5 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <div className="flex justify-between pt-3">
                                    <Skeleton className="h-7 w-20" />
                                    <Skeleton className="h-9 w-28 rounded-lg" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
