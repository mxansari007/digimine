import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { normalizePatternSlug } from "@digimine/types";
import { buildMetadata } from "@/lib/seo";
import { getCachedProblemSummaries } from "@/lib/server/practiceCache";
import ProblemsBrowser, { type Row } from "./ProblemsBrowser";

// Server-rendered (no "use client") so the full problem catalog is in the
// initial HTML — crawlers index every problem link, not a blank shell. The
// catalog query is cached (see practiceCache), so per-request load is flat.
export const metadata: Metadata = buildMetadata({
    title: "DSA & SQL Practice Problems",
    description:
        "Browse our catalog of DSA and SQL practice problems across 30+ patterns and three difficulty levels. Filter by topic, solve in 4 languages, and track mastery.",
    path: "/practice/problems",
    keywords: ["DSA problems", "SQL problems", "coding practice problems", "pattern-wise practice", "interview problems"],
});

export default async function PracticeProblemsPage({
    searchParams,
}: {
    searchParams?: { kind?: string; pattern?: string };
}) {
    const items = (await getCachedProblemSummaries().catch(() => [])) as Row[];
    const initialKind = searchParams?.kind === "dsa" || searchParams?.kind === "sql" ? searchParams.kind : "all";

    // Pattern slug is the most-linked filter — articles, blog posts, social
    // shares all hit this with mild variations (`two-pointer` vs `two-pointers`,
    // `dp` vs `dp-1d`, `Two Pointers`, etc.). Normalise to the canonical id
    // and 308-redirect to the canonical URL so SEO juice consolidates and
    // analytics doesn't fragment across spellings.
    const rawPattern = searchParams?.pattern;
    let initialPattern: string = "all";
    if (rawPattern && rawPattern !== "all") {
        const canonical = normalizePatternSlug(rawPattern);
        if (canonical) {
            initialPattern = canonical;
            if (canonical !== rawPattern) {
                // Permanent redirect to the canonical spelling — preserve `kind`.
                const params = new URLSearchParams();
                if (initialKind !== "all") params.set("kind", initialKind);
                params.set("pattern", canonical);
                redirect(`/practice/problems?${params.toString()}`);
            }
        }
        // If unknown alias, leave as-is — UI will show "no matches" and the
        // user can use the dropdown to pick a real pattern.
        else {
            initialPattern = rawPattern;
        }
    }

    return (
        <main className="min-h-screen bg-slate-50">
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-8">
                    <Link href="/practice" className="text-xs text-slate-500 hover:text-slate-900">
                        ← Practice hub
                    </Link>
                    <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">DSA &amp; SQL Practice Problems</h1>
                    <p className="mt-1 max-w-2xl text-sm text-slate-500">
                        {items.length} problems across 30+ patterns. Filter by type, difficulty, or pattern — then solve
                        with instant judging and spaced-repetition tracking.
                    </p>
                </div>
            </section>

            <div className="container-page py-8">
                {items.length === 0 ? (
                    <p className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
                        No problems published yet. Check back soon.
                    </p>
                ) : (
                    <ProblemsBrowser items={items} initialKind={initialKind} initialPattern={initialPattern} />
                )}
            </div>
        </main>
    );
}
