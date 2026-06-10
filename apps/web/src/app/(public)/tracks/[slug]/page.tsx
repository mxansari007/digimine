import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    getCompanyTrackBySlug,
    getTrackSeriesCards,
} from "@/lib/server/companyTracks";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const track = await getCompanyTrackBySlug(params.slug).catch(() => null);
    if (!track) return { title: "Track not found | PlacementRanker" };
    return {
        title: `${track.company} preparation — ${track.examName} pattern & mocks | PlacementRanker`,
        description: `${track.examName}: exact section pattern, timings, and pattern-mapped mock tests for ${track.company} campus hiring.`,
    };
}

export default async function TrackDetailPage({ params }: Props) {
    const track = await getCompanyTrackBySlug(params.slug).catch(() => null);
    if (!track) notFound();

    const series = await getTrackSeriesCards(track.seriesSlugs).catch(() => []);
    const totalQuestions = track.pattern.reduce((s, p) => s + p.questions, 0);
    const totalMinutes = track.pattern.reduce((s, p) => s + p.minutes, 0);

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                <Link href="/tracks" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                    ← All company tracks
                </Link>

                <div className="mt-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
                        {track.company} · campus hiring
                    </p>
                    <h1 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
                        {track.examName}
                    </h1>
                    <p className="mt-2 max-w-2xl text-lg text-gray-600">{track.tagline}</p>
                    {track.seasonNote && (
                        <p className="mt-2 inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                            {track.seasonNote}
                        </p>
                    )}
                </div>

                {/* ── The exam blueprint — the page's reason to exist ── */}
                <section className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <div className="flex items-baseline justify-between border-b border-gray-100 px-6 py-4">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                            Exam pattern
                        </h2>
                        <p className="text-sm tabular-nums text-gray-600">
                            <span className="font-semibold text-gray-900">{totalQuestions}</span> questions ·{" "}
                            <span className="font-semibold text-gray-900">{totalMinutes}</span> minutes
                        </p>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                <th className="px-6 py-2.5">Section</th>
                                <th className="px-3 py-2.5 text-right">Questions</th>
                                <th className="px-6 py-2.5 text-right">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {track.pattern.map((section, i) => (
                                <tr key={`${section.title}-${i}`}>
                                    <td className="px-6 py-3">
                                        <div className="font-medium text-gray-900">{section.title}</div>
                                        {section.blurb && (
                                            <div className="text-xs text-gray-500">{section.blurb}</div>
                                        )}
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                                        {section.questions}
                                    </td>
                                    <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                                        {section.minutes} min
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                {/* ── Pattern-mapped mocks ── */}
                <section className="mt-8">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                        Mock tests built to this pattern
                    </h2>
                    {series.length === 0 ? (
                        <p className="mt-3 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                            Mocks for this track are being prepared. Practice the general{" "}
                            <Link href="/tests" className="font-medium text-indigo-600 hover:text-indigo-700">
                                test series
                            </Link>{" "}
                            meanwhile.
                        </p>
                    ) : (
                        <div className="mt-3 space-y-3">
                            {series.map((s) => (
                                <Link
                                    key={s.slug}
                                    href={`/tests/${s.slug}`}
                                    className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 transition-all hover:border-indigo-300 hover:shadow-sm"
                                >
                                    <div className="min-w-0">
                                        <p className="font-semibold text-gray-900 group-hover:text-indigo-700">
                                            {s.title}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {s.totalTests} mock{s.totalTests === 1 ? "" : "s"} ·{" "}
                                            {s.totalQuestions} questions
                                        </p>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900">
                                        {s.accessType === "paid" && s.price > 0 ? `₹${s.price}` : "Free"}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
