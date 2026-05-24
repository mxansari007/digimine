import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@digimine/ui";
import {
    getCachedSheetBySlug,
    getCachedSheetProblems,
    type CachedSheetProblem,
} from "@/lib/server/practiceSheets";

type Props = { params: { slug: string } };

export const revalidate = 300;

function siteOrigin(): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://placementranker.com"
    ).replace(/\/$/, "");
}

function diffChipClass(d: string): string {
    if (d === "easy") return "bg-emerald-50 text-emerald-700";
    if (d === "medium") return "bg-amber-50 text-amber-700";
    return "bg-rose-50 text-rose-700";
}

function kindLabel(k: string): string {
    if (k === "dsa") return "DSA";
    if (k === "sql") return "SQL";
    if (k === "mixed") return "DSA + SQL";
    return k;
}

function difficultyChip(d: string | null): { label: string; cls: string } | null {
    if (!d) return null;
    if (d === "beginner") return { label: "Beginner", cls: "bg-emerald-50 text-emerald-700" };
    if (d === "intermediate")
        return { label: "Intermediate", cls: "bg-amber-50 text-amber-700" };
    return { label: "Advanced", cls: "bg-rose-50 text-rose-700" };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const slug = decodeURIComponent(params.slug || "");
    const sheet = await getCachedSheetBySlug(slug);
    if (!sheet) {
        return { title: "Sheet not found · PlacementRanker", robots: { index: false, follow: false } };
    }
    const origin = siteOrigin();
    const url = `${origin}/practice/sheets/${sheet.slug}`;
    const title = sheet.seo.metaTitle || `${sheet.title} · PlacementRanker`;
    const description = sheet.seo.metaDescription || sheet.description || sheet.subtitle || "";
    const image = sheet.seo.ogImageUrl || sheet.coverImageUrl || undefined;
    return {
        title,
        description,
        alternates: { canonical: url },
        robots: sheet.seo.noIndex ? { index: false, follow: false } : { index: true, follow: true },
        openGraph: {
            type: "article",
            url,
            title,
            description,
            siteName: "PlacementRanker",
            images: image ? [{ url: image, alt: sheet.title }] : undefined,
        },
        twitter: {
            card: image ? "summary_large_image" : "summary",
            title,
            description,
            images: image ? [image] : undefined,
        },
    };
}

export default async function PracticeSheetPage({ params }: Props) {
    const slug = decodeURIComponent(params.slug || "");
    const sheet = await getCachedSheetBySlug(slug);
    if (!sheet) return notFound();

    const problems = await getCachedSheetProblems(sheet);

    // Compute totals — only counting slugs that actually resolved to a
    // published problem (drops broken refs).
    let totalProblems = 0;
    const sectionsWithProblems = sheet.sections.map((s) => {
        const resolved: CachedSheetProblem[] = s.problemSlugs
            .map((slug) => problems[slug])
            .filter((p): p is CachedSheetProblem => !!p);
        totalProblems += resolved.length;
        return { ...s, problems: resolved };
    });

    const diff = difficultyChip(sheet.difficulty);

    return (
        <main className="min-h-screen bg-slate-50">
            {/* HERO */}
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-10">
                    <Link
                        href="/practice/sheets"
                        className="text-xs text-slate-500 hover:text-slate-900"
                    >
                        ← All sheets
                    </Link>
                    <div className="mt-3 grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
                        <div>
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                                <span className="rounded-full bg-primary-100 px-2.5 py-1 text-primary-700">
                                    {kindLabel(sheet.kind)}
                                </span>
                                {sheet.isOfficial && (
                                    <span className="rounded-full bg-slate-900 px-2.5 py-1 text-white">
                                        Official
                                    </span>
                                )}
                                {sheet.isFeatured && (
                                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                                        Featured
                                    </span>
                                )}
                                {diff && (
                                    <span className={`rounded-full px-2.5 py-1 ${diff.cls}`}>
                                        {diff.label}
                                    </span>
                                )}
                            </div>
                            <h1 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
                                {sheet.title}
                            </h1>
                            {sheet.subtitle && (
                                <p className="mt-3 text-lg text-slate-600">{sheet.subtitle}</p>
                            )}
                            {sheet.description && (
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                                    {sheet.description}
                                </p>
                            )}

                            {/* Stat strip */}
                            <div className="mt-6 grid max-w-md grid-cols-3 gap-3">
                                <Stat value={String(sheet.sections.length)} label="Sections" />
                                <Stat value={String(totalProblems)} label="Problems" />
                                <Stat
                                    value={
                                        sheet.estimatedHours
                                            ? `≈${sheet.estimatedHours}`
                                            : "—"
                                    }
                                    label={sheet.estimatedHours ? "Hours" : "Hours est."}
                                />
                            </div>

                            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                                <a
                                    href="#sections"
                                    className="rounded-full bg-primary-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-primary-700"
                                >
                                    Start the journey →
                                </a>
                            </div>
                        </div>

                        {sheet.coverImageUrl ? (
                            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-slate-100 shadow-md">
                                {/\.svg(\?|$)/i.test(sheet.coverImageUrl) ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={sheet.coverImageUrl}
                                        alt={sheet.title}
                                        className="absolute inset-0 h-full w-full object-cover"
                                    />
                                ) : (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={sheet.coverImageUrl}
                                        alt={sheet.title}
                                        loading="eager"
                                        className="absolute inset-0 h-full w-full object-cover"
                                    />
                                )}
                            </div>
                        ) : (
                            <div className="aspect-[16/9] w-full rounded-2xl bg-gradient-to-br from-primary-100 via-teal-100 to-amber-100 shadow-md" />
                        )}
                    </div>
                </div>
            </section>

            {/* SECTIONS */}
            <div id="sections" className="container-page space-y-6 py-10">
                {sectionsWithProblems.length === 0 ? (
                    <Card className="p-12 text-center text-sm text-slate-500">
                        This sheet has no sections yet.
                    </Card>
                ) : (
                    sectionsWithProblems.map((s, i) => (
                        <Card key={i} className="overflow-hidden p-0">
                            <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            Section {i + 1}
                                        </p>
                                        <h2 className="mt-0.5 font-display text-xl font-bold text-slate-900">
                                            {s.topicSlug ? (
                                                <Link
                                                    href={`/practice/topics/${s.topicSlug}`}
                                                    className="hover:text-primary-700 hover:underline"
                                                >
                                                    {s.title}
                                                </Link>
                                            ) : (
                                                s.title
                                            )}
                                        </h2>
                                        {s.summary && (
                                            <p className="mt-1 text-sm text-slate-600">
                                                {s.summary}
                                            </p>
                                        )}
                                    </div>
                                    <span className="shrink-0 text-xs text-slate-500">
                                        {s.problems.length} problem
                                        {s.problems.length === 1 ? "" : "s"}
                                    </span>
                                </div>
                            </div>

                            {s.problems.length === 0 ? (
                                <p className="px-6 py-8 text-center text-sm text-slate-400">
                                    No published problems linked to this section yet.
                                </p>
                            ) : (
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-xs uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="px-6 py-3 text-left">#</th>
                                            <th className="px-6 py-3 text-left">Title</th>
                                            <th className="px-6 py-3 text-left">Difficulty</th>
                                            <th className="px-6 py-3 text-right">Solved by</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {s.problems.map((p, idx) => (
                                            <tr key={p.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-3 text-xs text-slate-400">
                                                    {idx + 1}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <Link
                                                        href={`/practice/problems/${p.slug}`}
                                                        className="font-medium text-slate-900 hover:text-primary-700"
                                                    >
                                                        {p.title}
                                                    </Link>
                                                    <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">
                                                        {p.kind}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span
                                                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${diffChipClass(p.difficulty)}`}
                                                    >
                                                        {p.difficulty}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-right text-slate-500">
                                                    {p.totalSolved.toLocaleString("en-IN")}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </Card>
                    ))
                )}

                {sheet.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-4">
                        {sheet.tags.map((t) => (
                            <span
                                key={t}
                                className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                            >
                                #{t}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}

function Stat({ value, label }: { value: string; label: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
            <p className="font-display text-xl font-black text-slate-900">{value}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {label}
            </p>
        </div>
    );
}
