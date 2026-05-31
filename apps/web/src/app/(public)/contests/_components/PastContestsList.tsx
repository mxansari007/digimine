"use client";

/**
 * Past-contest list with client-side pagination. The list grows over time
 * (every ended contest stays here forever), so we render only the first
 * batch and let the user reveal the rest with a "Load more" button. The
 * SSR payload still carries every contest in JSON for crawlers.
 *
 * Live + Upcoming sections stay server-rendered in the parent — they're
 * short-lived and small in volume.
 */
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { CalendarIcon, ClockIcon, FileTextIcon, TargetIcon, TrophyIcon } from "@/components/icons/AppIcons";
import { LoadMoreButton } from "@/components/common";
import { useVisibleSlice } from "@/hooks/useVisibleSlice";

type ContestCardLite = {
    id: string;
    slug: string;
    title: string;
    shortDescription: string;
    description: string;
    category: string;
    sourceType: string;
    seriesTitle?: string;
    thumbnailURL: string | null;
    startTimeMs: number;
    endTimeMs: number;
    totalQuestions: number;
    totalMarks: number;
};

function formatDateTime(ms: number) {
    return new Date(ms).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
    });
}

function PhaseBadge() {
    return (
        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 bg-slate-100 text-slate-700 ring-slate-200">
            Ended
        </span>
    );
}

function ContestCardView({ contest }: { contest: ContestCardLite }) {
    return (
        <Card className="group overflow-hidden border-slate-200/80 bg-white transition-all hover:-translate-y-0.5 hover:shadow-xl">
            <Link href={`/contests/${contest.slug}`} className="block">
                <div className="grid gap-0 sm:grid-cols-[220px_1fr]">
                    <div className="relative h-48 bg-[#0f172a] sm:h-full">
                        {contest.thumbnailURL ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={contest.thumbnailURL}
                                alt={contest.title}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#020617] via-[#0f172a] to-blue-950 text-white/40">
                                <TrophyIcon className="h-16 w-16" />
                            </div>
                        )}
                        <div className="absolute left-4 top-4">
                            <PhaseBadge />
                        </div>
                    </div>
                    <div className="p-5 sm:p-6">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary-600">
                            <span>{contest.category || "Contest"}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span>
                                {contest.sourceType === "test"
                                    ? contest.seriesTitle
                                    : contest.sourceType === "custom"
                                      ? "Uploaded paper"
                                      : "Quiz"}
                            </span>
                        </div>
                        <h2 className="mt-3 text-2xl font-bold text-slate-950">{contest.title}</h2>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                            {contest.shortDescription || contest.description}
                        </p>
                        <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                            <span className="inline-flex items-center gap-2">
                                <CalendarIcon className="h-4 w-4 text-primary-500" /> Started{" "}
                                {formatDateTime(contest.startTimeMs)}
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <ClockIcon className="h-4 w-4 text-primary-500" /> Ended{" "}
                                {formatDateTime(contest.endTimeMs)}
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <FileTextIcon className="h-4 w-4 text-primary-500" />{" "}
                                {contest.totalQuestions} questions
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <TargetIcon className="h-4 w-4 text-primary-500" />{" "}
                                {contest.totalMarks} marks
                            </span>
                        </div>
                        <div className="mt-5">
                            <Button variant="outline" size="sm">
                                View Contest
                            </Button>
                        </div>
                    </div>
                </div>
            </Link>
        </Card>
    );
}

export default function PastContestsList({ contests }: { contests: ContestCardLite[] }) {
    const { visible, hasMore, remaining, loadMore } = useVisibleSlice(contests, 6);
    return (
        <>
            <div className="grid gap-5">
                {visible.map((c) => (
                    <ContestCardView key={c.id} contest={c} />
                ))}
            </div>
            <LoadMoreButton
                hasMore={hasMore}
                remaining={remaining}
                onLoadMore={loadMore}
                label="Show more past contests"
            />
        </>
    );
}
