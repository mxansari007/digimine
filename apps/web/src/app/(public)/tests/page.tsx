import { getCachedTests } from "@/lib/server/catalog";
import { CheckIcon } from "@/components/icons/AppIcons";
import TestsBrowser from "./TestsBrowser";

// Server-rendered so every test-series card + link is in the initial HTML
// (crawlable). The catalog query is cached (see lib/server/catalog), so
// per-request load stays flat. Metadata comes from tests/layout.tsx.
export default async function TestsPage() {
    const tests = await getCachedTests().catch(() => []);

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-10 text-center">
                    <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
                        Mock Tests &amp; Practice
                    </span>
                    <h1 className="mb-4 text-4xl font-bold text-gray-900 sm:text-5xl">Test Series</h1>
                    <p className="mx-auto max-w-2xl text-lg text-gray-600">
                        Sharpen your skills with curated test series. Real exam patterns, instant scoring, and detailed analytics.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1.5"><CheckIcon className="h-4 w-4 text-green-500" /> Instant results</span>
                        <span className="flex items-center gap-1.5"><CheckIcon className="h-4 w-4 text-green-500" /> Auto-saved progress</span>
                        <span className="flex items-center gap-1.5"><CheckIcon className="h-4 w-4 text-green-500" /> Detailed solutions</span>
                        <span className="flex items-center gap-1.5"><CheckIcon className="h-4 w-4 text-green-500" /> Mobile friendly</span>
                    </div>
                </div>

                <TestsBrowser tests={tests} />
            </div>
        </div>
    );
}
