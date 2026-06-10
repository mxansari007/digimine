import type { Metadata } from "next";
import Link from "next/link";
import { getCachedCompanyTracks } from "@/lib/server/companyTracks";

export const metadata: Metadata = {
    title: "Company-wise placement prep tracks | PlacementRanker",
    description:
        "Pattern-mapped preparation for TCS NQT, Infosys SP, Wipro NLTH and more — the exact sections, question counts and timings of the real exam, with matching mock tests.",
};

// Server-rendered so every track link is crawlable; the companyTracks read
// is cached server-side like the rest of the catalogue.
export default async function TracksPage() {
    const tracks = await getCachedCompanyTracks().catch(() => []);

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
                <div className="mb-10">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
                        Company-wise preparation
                    </p>
                    <h1 className="mt-2 text-4xl font-bold text-gray-900 sm:text-5xl">
                        Prep for the exam you&apos;ll actually sit
                    </h1>
                    <p className="mt-3 max-w-2xl text-lg text-gray-600">
                        Each track mirrors one company&apos;s real hiring exam — same sections,
                        same question counts, same clock — with mock tests built to that pattern.
                    </p>
                </div>

                {tracks.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500">
                        Tracks are being prepared. Check back soon.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {tracks.map((track) => {
                            const totalQuestions = track.pattern.reduce((s, p) => s + p.questions, 0);
                            const totalMinutes = track.pattern.reduce((s, p) => s + p.minutes, 0);
                            return (
                                <Link
                                    key={track.slug}
                                    href={`/tracks/${track.slug}`}
                                    className="group block rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:border-indigo-300 hover:shadow-md sm:p-7"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 group-hover:text-indigo-700">
                                                {track.company}
                                            </h2>
                                            <p className="text-sm text-gray-500">{track.examName}</p>
                                        </div>
                                        {/* The numbers a candidate actually wants: the shape of the paper. */}
                                        <p className="text-sm tabular-nums text-gray-600">
                                            <span className="font-semibold text-gray-900">{track.pattern.length}</span> sections ·{" "}
                                            <span className="font-semibold text-gray-900">{totalQuestions}</span> questions ·{" "}
                                            <span className="font-semibold text-gray-900">{totalMinutes}</span> min
                                        </p>
                                    </div>
                                    {/* Pattern strip — each segment's width is its share of exam time. */}
                                    <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
                                        {track.pattern.map((s, i) => (
                                            <div
                                                key={`${s.title}-${i}`}
                                                className={i % 2 === 0 ? "bg-indigo-500" : "bg-indigo-300"}
                                                style={{ width: `${totalMinutes > 0 ? (s.minutes / totalMinutes) * 100 : 0}%` }}
                                                title={`${s.title} — ${s.minutes} min`}
                                            />
                                        ))}
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm text-gray-600">{track.tagline}</p>
                                        {track.seasonNote && (
                                            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                                                {track.seasonNote}
                                            </span>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
