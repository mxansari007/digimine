import { Card, Skeleton, SkeletonList } from "@digimine/ui";

export default function Loading() {
    return (
        <main className="min-h-screen bg-slate-50">
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-8">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-7 w-72" />
                    <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
                </div>
            </section>
            <div className="container-page py-8">
                <div className="mb-6 flex flex-wrap gap-3">
                    <Skeleton className="h-10 min-w-[200px] flex-1 rounded-lg" />
                    <Skeleton className="h-10 w-32 rounded-lg" />
                    <Skeleton className="h-10 w-32 rounded-lg" />
                </div>
                <Card className="p-4">
                    <SkeletonList rows={10} />
                </Card>
            </div>
        </main>
    );
}
