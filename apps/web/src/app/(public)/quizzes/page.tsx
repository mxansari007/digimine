import { getCachedQuizzes } from "@/lib/server/catalog";
import { TargetIcon } from "@/components/icons/AppIcons";
import QuizzesBrowser from "./QuizzesBrowser";

// Server-rendered so every quiz card + link is in the initial HTML
// (crawlable). The catalog query is cached (see lib/server/catalog), so
// per-request load stays flat. Metadata comes from quizzes/layout.tsx.
export default async function QuizzesPage() {
    const quizzes = await getCachedQuizzes().catch(() => []);
    const totalQuestions = quizzes.reduce((total, quiz) => total + (quiz.totalQuestions || 0), 0);
    const freeCount = quizzes.filter((quiz) => quiz.accessType === "free").length;
    const courseQuizCount = quizzes.filter((quiz) => quiz.accessType === "course_only").length;

    return (
        <div className="min-h-screen bg-slate-50">
            <section className="relative overflow-hidden bg-slate-950 text-white">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
                <div className="container-page relative grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-20">
                    <div>
                        <span className="inline-flex rounded-full border border-primary-300/20 bg-primary-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-primary-100">
                            Topic practice engine
                        </span>
                        <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl">
                            Quick quizzes for every study session.
                        </h1>
                        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
                            Practice concepts, formulas, code outputs, aptitude tricks, and course checkpoints without starting a full mock test.
                        </p>
                        <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
                            <HeroStat label="Quizzes" value={quizzes.length} />
                            <HeroStat label="Questions" value={totalQuestions} />
                            <HeroStat label="Free" value={freeCount} />
                            <HeroStat label="Course" value={courseQuizCount} />
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-white/10 bg-white/[0.08] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur">
                        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.16em] text-primary-200">Today&apos;s practice</p>
                                    <h2 className="mt-2 text-2xl font-black text-white">Pick a drill</h2>
                                </div>
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-400/15 text-primary-100">
                                    <TargetIcon className="h-6 w-6" />
                                </div>
                            </div>
                            <div className="mt-6 space-y-3">
                                {[
                                    ["Concept recall", "Short memory checks"],
                                    ["Code output", "Trace snippets faster"],
                                    ["Course checkpoints", "Locked with course access"],
                                ].map(([title, detail]) => (
                                    <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
                                        <p className="font-black text-white">{title}</p>
                                        <p className="text-sm text-slate-400">{detail}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="container-page py-10">
                <QuizzesBrowser quizzes={quizzes} />
            </section>
        </div>
    );
}

function HeroStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4">
            <p className="text-2xl font-black text-white">{value}</p>
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
        </div>
    );
}
