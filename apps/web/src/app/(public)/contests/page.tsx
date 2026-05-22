import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { getCachedContests, type ContestCard } from "@/lib/server/catalog";
import { CalendarIcon, ClockIcon, FileTextIcon, TargetIcon, TrophyIcon } from "@/components/icons/AppIcons";

// Server-rendered so every contest card + link is in the initial HTML
// (crawlable). Rendered per request (phase is time-sensitive) but the data
// query is cached, so Firestore load stays flat. Metadata: contests/layout.tsx.
export const dynamic = "force-dynamic";

type Phase = "scheduled" | "live" | "ended";

function phaseOf(c: ContestCard, now: number): Phase {
    if (now < c.startTimeMs) return "scheduled";
    if (now < c.endTimeMs) return "live";
    return "ended";
}

// Fixed IST so server and client agree (India-focused audience).
function formatDateTime(ms: number) {
    return new Date(ms).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
    });
}

function PhaseBadge({ phase }: { phase: Phase }) {
    const styles: Record<Phase, string> = {
        scheduled: "bg-blue-50 text-blue-700 ring-blue-100",
        live: "bg-red-50 text-red-700 ring-red-100",
        ended: "bg-slate-100 text-slate-700 ring-slate-200",
    };
    const label = phase === "scheduled" ? "Upcoming" : phase === "live" ? "Live now" : "Ended";
    return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${styles[phase]}`}>{label}</span>;
}

function ContestCardView({ contest, phase }: { contest: ContestCard; phase: Phase }) {
    return (
        <Card className="group overflow-hidden border-slate-200/80 bg-white transition-all hover:-translate-y-0.5 hover:shadow-xl">
            <Link href={`/contests/${contest.slug}`} className="block">
                <div className="grid gap-0 sm:grid-cols-[220px_1fr]">
                    <div className="relative h-48 bg-slate-900 sm:h-full">
                        {contest.thumbnailURL ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={contest.thumbnailURL} alt={contest.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white/40">
                                <TrophyIcon className="h-16 w-16" />
                            </div>
                        )}
                        <div className="absolute left-4 top-4"><PhaseBadge phase={phase} /></div>
                    </div>
                    <div className="p-5 sm:p-6">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary-600">
                            <span>{contest.category || "Contest"}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span>{contest.sourceType === "test" ? contest.seriesTitle : contest.sourceType === "custom" ? "Uploaded paper" : "Quiz"}</span>
                        </div>
                        <h2 className="mt-3 text-2xl font-bold text-slate-950">{contest.title}</h2>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{contest.shortDescription || contest.description}</p>
                        <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                            <span className="inline-flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-primary-500" /> Starts {formatDateTime(contest.startTimeMs)}</span>
                            <span className="inline-flex items-center gap-2"><ClockIcon className="h-4 w-4 text-primary-500" /> Ends {formatDateTime(contest.endTimeMs)}</span>
                            <span className="inline-flex items-center gap-2"><FileTextIcon className="h-4 w-4 text-primary-500" /> {contest.totalQuestions} questions</span>
                            <span className="inline-flex items-center gap-2"><TargetIcon className="h-4 w-4 text-primary-500" /> {contest.totalMarks} marks</span>
                        </div>
                        <div className="mt-5">
                            <Button variant={phase === "live" ? "primary" : "outline"} size="sm">View Contest</Button>
                        </div>
                    </div>
                </div>
            </Link>
        </Card>
    );
}

export default async function ContestsPage() {
    const contests = await getCachedContests().catch(() => []);
    const now = Date.now();
    const withPhase = contests.map((c) => ({ c, phase: phaseOf(c, now) }));
    const live = withPhase.filter((x) => x.phase === "live");
    const upcoming = withPhase.filter((x) => x.phase === "scheduled");
    const ended = withPhase.filter((x) => x.phase === "ended");

    return (
        <div className="min-h-screen bg-slate-50 py-12">
            <div className="container-page space-y-10">
                <section className="rounded-[2rem] bg-slate-950 px-6 py-10 text-white shadow-2xl sm:px-10">
                    <div className="max-w-3xl">
                        <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-100 ring-1 ring-white/10">
                            Live ranked practice
                        </span>
                        <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">Contests</h1>
                        <p className="mt-4 text-lg leading-8 text-slate-300">
                            Join scheduled single-test events where everyone shares the same clock and final rankings lock after the contest ends.
                        </p>
                    </div>
                </section>

                {contests.length === 0 ? (
                    <Card className="p-10 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                            <TrophyIcon className="h-7 w-7" />
                        </div>
                        <h2 className="mt-4 text-xl font-bold text-slate-950">No contests yet</h2>
                        <p className="mt-2 text-slate-500">New live contests will appear here when they are published.</p>
                    </Card>
                ) : (
                    <div className="space-y-9">
                        {live.length > 0 && (
                            <section className="space-y-4">
                                <h2 className="text-2xl font-bold text-slate-950">Live Now</h2>
                                <div className="grid gap-5">{live.map(({ c, phase }) => <ContestCardView key={c.id} contest={c} phase={phase} />)}</div>
                            </section>
                        )}
                        {upcoming.length > 0 && (
                            <section className="space-y-4">
                                <h2 className="text-2xl font-bold text-slate-950">Upcoming</h2>
                                <div className="grid gap-5">{upcoming.map(({ c, phase }) => <ContestCardView key={c.id} contest={c} phase={phase} />)}</div>
                            </section>
                        )}
                        {ended.length > 0 && (
                            <section className="space-y-4">
                                <h2 className="text-2xl font-bold text-slate-950">Past Contests</h2>
                                <div className="grid gap-5">{ended.map(({ c, phase }) => <ContestCardView key={c.id} contest={c} phase={phase} />)}</div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
