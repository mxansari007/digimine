"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { ProductCard } from "@/components/products/ProductCard";
import { getProducts, getAllReviewStats } from "@/lib/firestore";
import { type Product, type TestSeries } from "@digimine/types";

function mapTestSeriesToProduct(series: TestSeries): Product {
    return {
        id: series.id,
        name: series.title,
        slug: series.slug,
        description: series.description,
        shortDescription: series.shortDescription || series.description.slice(0, 120),
        price: series.price,
        compareAtPrice: series.compareAtPrice,
        type: "test_series",
        purchaseType: "downloadable",
        status: "published",
        thumbnailURL: series.thumbnailURL,
        images: series.thumbnailURL ? [series.thumbnailURL] : [],
        files: [],
        contentPreview: [],
        tags: series.tags,
        highlights: series.highlights,
        deliveryFormat: "online",
        moneyBackGuarantee: 0,
        instantAccess: true,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
        createdBy: series.createdBy,
    };
}

const prepModes = [
    {
        title: "Study Material",
        label: "Build concepts",
        href: "/courses",
        description: "Structured material for aptitude, reasoning, DSA, DBMS, OS, CN, coding, and company-specific prep.",
        tone: "from-sky-500 to-blue-600",
        icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    },
    {
        title: "Notes",
        label: "Revise fast",
        href: "/courses",
        description: "Compact exam notes, formula sheets, short tricks, interview summaries, and last-minute revision packs.",
        tone: "from-cyan-500 to-emerald-500",
        icon: "M4 5.25A2.25 2.25 0 016.25 3h8.69a2.25 2.25 0 011.591.659l3.81 3.81A2.25 2.25 0 0121 9.06v9.69A2.25 2.25 0 0118.75 21H6.25A2.25 2.25 0 014 18.75V5.25zm10.5-1.5V8.25a.75.75 0 00.75.75h4.5M8 13.5h8M8 16.5h6",
    },
    {
        title: "Mock Tests",
        label: "Practice",
        href: "/tests",
        description: "Timed full-length tests with sectional scoring, cutoffs, rankings, and detailed result review.",
        tone: "from-indigo-500 to-violet-600",
        icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 8l2 2 4-4",
    },
    {
        title: "Quizzes",
        label: "Revise",
        href: "/quizzes",
        description: "Short drills for formulas, concepts, code output, aptitude tricks, and interview fundamentals.",
        tone: "from-emerald-500 to-teal-600",
        icon: "M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h4.5M5 6.75h.008v.008H5V6.75zm0 5.25h.008v.008H5V12zm0 5.25h.008v.008H5v-.008z",
    },
    {
        title: "Contests",
        label: "Compete",
        href: "/tests",
        description: "Leaderboard-led challenges for placement prep, coding rounds, and weekly exam sprints.",
        tone: "from-amber-500 to-orange-600",
        icon: "M16.5 18.75h-9m9 0a3 3 0 003-3V5.25h-15v10.5a3 3 0 003 3m9 0v1.5a1.5 1.5 0 01-1.5 1.5h-6a1.5 1.5 0 01-1.5-1.5v-1.5m9-10.5h3a1.5 1.5 0 011.5 1.5v1.5a3 3 0 01-3 3h-1.5m-9-6h-3A1.5 1.5 0 003 9.75v1.5a3 3 0 003 3h1.5",
    },
];

const examTracks = [
    "Campus placement prep",
    "Company-wise test series",
    "Competitive exam mocks",
    "Study notes and articles",
    "Topic-wise quizzes",
    "Live contests and rankings",
];

const prepRailItems = [
    "CN notes",
    "Aptitude drills",
    "DBMS revision",
    "Coding rounds",
    "Mock analysis",
    "Live rank",
    "Contest sprint",
    "Interview prep",
];

const ctaChips = ["Learn", "Revise", "Practice", "Compete", "Rank", "Improve"];

const productKinds = [
    "Resume templates",
    "eBooks",
    "Download packs",
    "Interview guides",
    "Checklists",
    "Career assets",
];

const heroHighlights = [
    ["For placements", "Company mocks, coding rounds, aptitude, reasoning, and interview notes."],
    ["For any exam", "Build courses, notes, quizzes, mock tests, cutoffs, and contest practice."],
    ["For revision", "Short notes, topic drills, mistake review, and rank-ready practice cycles."],
];

const workflowSteps = [
    { step: "01", title: "Read the topic", text: "Start with concise notes and examples built around actual exam patterns." },
    { step: "02", title: "Practice by section", text: "Solve quizzes and sectional tests before attempting the full mock." },
    { step: "03", title: "Review the attempt", text: "Use score reports, rankings, and question review to find weak spots." },
    { step: "04", title: "Compete again", text: "Join timed challenges and keep improving with every leaderboard cycle." },
];

const showcaseFeatures = [
    {
        stage: "Now",
        title: "Exam study path",
        short: "Study plan",
        description: "A student can start from notes and articles, then move into quizzes, mocks, and revision without losing the thread.",
        accent: "from-cyan-400 to-blue-500",
        glow: "shadow-cyan-500/25",
        stat: "7d",
        statLabel: "prep plan",
        progress: "w-[78%]",
        feed: ["Computer Networks notes assigned", "Aptitude formulas marked for revision", "DBMS joins article queued"],
    },
    {
        stage: "Now",
        title: "Placement test series",
        short: "Ranked mocks",
        description: "Company-style timed mocks with sections, cutoffs, rankings, distribution graphs, and question review.",
        accent: "from-indigo-400 to-violet-500",
        glow: "shadow-indigo-500/25",
        stat: "#12",
        statLabel: "mock rank",
        progress: "w-[68%]",
        feed: ["Infosys mock unlocked", "Quant cutoff calculated", "Weak area: Pseudo Code"],
    },
    {
        stage: "Next",
        title: "Topic quiz sprint",
        short: "Fast revision",
        description: "Short quizzes for formulas, concepts, code output, interview fundamentals, and any exam topic that needs drilling.",
        accent: "from-emerald-400 to-teal-500",
        glow: "shadow-emerald-500/25",
        stat: "15m",
        statLabel: "revision sprint",
        progress: "w-[74%]",
        feed: ["10-question CN quiz queued", "Wrong answers recycled", "Formula recall streak planned"],
    },
    {
        stage: "Future",
        title: "Live exam contests",
        short: "Compete live",
        description: "Scheduled contests where everyone starts together, ranks are calculated at the end, and performance feels real.",
        accent: "from-amber-400 to-orange-500",
        glow: "shadow-amber-500/25",
        stat: "09:00",
        statLabel: "live start",
        progress: "w-[58%]",
        feed: ["Sunday aptitude contest scheduled", "Leaderboard preview ready", "Top performers report enabled"],
    },
    {
        stage: "Future",
        title: "Personal prep coach",
        short: "Guidance",
        description: "Personalized prep guidance based on notes read, quiz mistakes, mock attempts, weak topics, and target exam.",
        accent: "from-fuchsia-400 to-pink-500",
        glow: "shadow-fuchsia-500/25",
        stat: "3",
        statLabel: "focus areas",
        progress: "w-[76%]",
        feed: ["Reasoning needs revision", "Schedule 2 mocks this week", "Recommend graph algorithms notes"],
    },
];

export default function HomePage() {
    const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
    const [digitalProducts, setDigitalProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviewStats, setReviewStats] = useState<Map<string, { averageRating: number; reviewCount: number }>>(new Map());
    const [activeShowcaseIndex, setActiveShowcaseIndex] = useState(0);
    const activeShowcase = showcaseFeatures[activeShowcaseIndex];

    useEffect(() => {
        async function fetchFeatured() {
            try {
                const [products, stats, testSeries] = await Promise.all([
                    getProducts({ limitCount: 6 }),
                    getAllReviewStats(),
                    import("@/lib/firestore/tests").then((module) => module.getPublishedTestSeries()),
                ]);

                const mappedTestSeries = testSeries.slice(0, 2).map(mapTestSeriesToProduct);
                setFeaturedProducts([...mappedTestSeries, ...products].slice(0, 4));
                setDigitalProducts(products.slice(0, 4));
                setReviewStats(stats);
            } catch (error) {
                console.error("Error fetching featured products:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchFeatured();
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setActiveShowcaseIndex((current) => (current + 1) % showcaseFeatures.length);
        }, 3200);

        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const motionItems = Array.from(document.querySelectorAll<HTMLElement>("[data-motion]"));

        if (reduceMotion) {
            motionItems.forEach((item) => item.classList.add("is-visible"));
            return;
        }

        motionItems.forEach((item, index) => {
            item.style.setProperty("--motion-delay", `${Math.min(index * 45, 360)}ms`);
        });

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                    }
                });
            },
            { rootMargin: "0px 0px -12% 0px", threshold: 0.14 }
        );

        motionItems.forEach((item) => observer.observe(item));

        const handlePointerMove = (event: PointerEvent) => {
            const x = Math.round((event.clientX / window.innerWidth) * 100);
            const y = Math.round((event.clientY / window.innerHeight) * 100);
            document.documentElement.style.setProperty("--landing-x", `${x}%`);
            document.documentElement.style.setProperty("--landing-y", `${y}%`);
        };

        window.addEventListener("pointermove", handlePointerMove, { passive: true });

        return () => {
            observer.disconnect();
            window.removeEventListener("pointermove", handlePointerMove);
        };
    }, []);

    return (
        <div className="bg-slate-50">
            <section className="landing-dynamic-section relative overflow-hidden border-b border-slate-200/70">
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                        backgroundImage:
                            "linear-gradient(90deg, rgba(2,6,23,0.95) 0%, rgba(2,6,23,0.84) 46%, rgba(2,6,23,0.48) 100%), url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1800&q=80')",
                    }}
                />
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)", backgroundSize: "42px 42px" }} />

                <div className="container-page relative z-10 py-12 sm:py-14 lg:py-16">
                    <div className="mx-auto max-w-6xl">
                        <div className="landing-motion max-w-4xl" data-motion>
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-primary-100 backdrop-blur-md">
                                Study resources, test series, quizzes, contests, and exam notes
                            </div>
                            <h1 className="font-display max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl" style={{ lineHeight: 1.04 }}>
                                Prepare for placements and exams with one focused study system.
                            </h1>
                            <p className="mt-6 max-w-3xl text-base text-slate-200 sm:text-lg" style={{ lineHeight: 1.75 }}>
                                Digimine gives students a clear path from learning a topic to revising notes, solving quizzes, attempting test series, joining live contests, and checking where they stand.
                            </p>
                            <div className="mt-7 grid gap-3 md:grid-cols-3">
                                {heroHighlights.map(([title, text]) => (
                                    <div key={title} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
                                        <p className="text-sm font-bold text-white">{title}</p>
                                        <p className="mt-2 text-xs leading-5 text-slate-300">{text}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <Link href="/tests">
                                    <Button size="lg" className="w-full sm:w-auto">
                                        Explore Test Series
                                    </Button>
                                </Link>
                                <Link href="/courses">
                                    <Button variant="outline" size="lg" className="w-full !border-white/20 !bg-white/10 !text-white hover:!bg-white hover:!text-slate-950 sm:w-auto">
                                        Browse Study Material
                                    </Button>
                                </Link>
                            </div>
                        </div>

                        <div className="landing-motion relative mt-10 hidden min-w-0 lg:block" data-motion>
                            <div className="hero-console feature-card-float relative w-full overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                                <div className="hero-scanline absolute inset-4 rounded-[1.5rem]" />
                                <div className="relative rounded-[1.5rem] bg-slate-950/[0.88] p-5 text-white ring-1 ring-white/10">
                                    <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold uppercase text-primary-200">Student prep cockpit</p>
                                            <h2 className="mt-1 truncate text-2xl font-bold text-white">{activeShowcase.title}</h2>
                                        </div>
                                        <span className={`shrink-0 rounded-full bg-gradient-to-r ${activeShowcase.accent} px-3 py-1 text-xs font-bold text-white shadow-lg ${activeShowcase.glow}`}>
                                            {activeShowcase.stage}
                                        </span>
                                    </div>

                                    <div className="mt-4 grid grid-cols-5 gap-2">
                                        {showcaseFeatures.map((feature, index) => (
                                            <button
                                                type="button"
                                                key={feature.title}
                                                onClick={() => setActiveShowcaseIndex(index)}
                                                className={`min-w-0 rounded-xl border px-2.5 py-2 text-left transition-all ${
                                                    index === activeShowcaseIndex
                                                        ? "border-white/20 bg-white/[0.12] text-white"
                                                        : "border-white/[0.08] bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white"
                                                }`}
                                            >
                                                <span className="block truncate text-[11px] font-bold uppercase">{feature.stage}</span>
                                                <span className="block truncate text-xs font-semibold">{feature.short}</span>
                                            </button>
                                        ))}
                                    </div>

                                    <div className="mt-5 grid grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,0.85fr)] gap-4">
                                        <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                                            <p className="text-xs font-bold uppercase text-slate-400">Student target</p>
                                            <p className="mt-3 text-4xl font-black text-white">{activeShowcase.stat}</p>
                                            <p className="text-sm font-semibold text-primary-100">{activeShowcase.statLabel}</p>
                                            <div className="mt-5 h-2 rounded-full bg-white/10">
                                                <div className={`prep-progress-fill h-full rounded-full bg-gradient-to-r ${activeShowcase.accent} ${activeShowcase.progress}`} />
                                            </div>
                                        </div>

                                        <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                                            <p className="text-xs font-bold uppercase text-slate-400">Prep state</p>
                                            <p className="mt-2 line-clamp-2 text-sm text-slate-200">{activeShowcase.description}</p>
                                            <div className="mt-4 grid grid-cols-7 items-end gap-1.5">
                                                {[42, 66, 38, 82, 54, 72, 48].map((height, index) => (
                                                    <div key={index} className="h-20 rounded-full bg-white/[0.06] p-1">
                                                        <div
                                                            className={`score-wave w-full rounded-full bg-gradient-to-t ${activeShowcase.accent}`}
                                                            style={{ height: `${height}%`, animationDelay: `${index * 120}ms` }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                                            <p className="text-xs font-bold uppercase text-slate-400">What students get</p>
                                            <div className="mt-3 grid gap-2">
                                                {["Notes", "Quizzes", "Mocks", "Ranks"].map((item, index) => (
                                                    <div key={item} className="flex items-center justify-between rounded-xl bg-slate-900/70 px-3 py-2">
                                                        <span className="text-sm font-semibold text-slate-200">{item}</span>
                                                        <span className={`h-2 w-10 rounded-full bg-gradient-to-r ${activeShowcase.accent}`} style={{ opacity: 0.45 + index * 0.14 }} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <p className="text-xs font-bold uppercase text-slate-400">Today in the prep room</p>
                                            <span className="timeline-pulse rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-200">updating path</span>
                                        </div>
                                        <div className="space-y-2">
                                            {activeShowcase.feed.map((item, index) => (
                                                <div key={item} className="flex items-center gap-3 rounded-xl bg-slate-900/70 px-3 py-2">
                                                    <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${activeShowcase.accent}`} />
                                                    <span className="min-w-0 truncate text-sm text-slate-200">{item}</span>
                                                    <span className="ml-auto text-[11px] font-semibold text-slate-500">0{index + 1}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="feature-marquee mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 py-2">
                                        <div className="feature-marquee-track flex min-w-max gap-3 text-xs font-bold uppercase text-slate-300">
                                            {["Placement prep", "Study notes", "Topic quizzes", "Mock tests", "Live contests", "Exam articles", "Leaderboards", "Cutoffs"].map((item) => (
                                                <span key={item} className="rounded-full bg-white/[0.06] px-3 py-1">{item}</span>
                                            ))}
                                            {["Placement prep", "Study notes", "Topic quizzes", "Mock tests", "Live contests", "Exam articles", "Leaderboards", "Cutoffs"].map((item) => (
                                                <span key={`${item}-repeat`} className="rounded-full bg-white/[0.06] px-3 py-1">{item}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="landing-dynamic-section py-14 lg:py-20">
                <span className="landing-orbit right-[6%] top-10 h-40 w-40" aria-hidden="true" />
                <span className="landing-orbit bottom-12 left-[4%] h-24 w-24 [animation-duration:18s]" aria-hidden="true" />
                <div className="container-page">
                    <div className="landing-motion mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between" data-motion>
                        <div>
                            <span className="section-eyebrow">Preparation modes</span>
                            <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
                                Study, revise, practice, compete, and improve from one place.
                            </h2>
                        </div>
                        <p className="max-w-md text-slate-500">
                            Pick the mode that matches the student journey: learn the topic, revise quickly, attempt mocks, then compete under exam pressure.
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {prepModes.map((mode) => (
                            <Link key={mode.title} href={mode.href} className="landing-motion group" data-motion>
                                <article className="surface-panel landing-lift-card h-full p-6 hover:border-primary-200/80">
                                    <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${mode.tone} text-white shadow-lg`}>
                                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={mode.icon} />
                                        </svg>
                                    </div>
                                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-600">{mode.label}</p>
                                    <h3 className="mt-2 text-2xl font-bold text-slate-950 transition-colors group-hover:text-primary-700">{mode.title}</h3>
                                    <p className="mt-3 text-sm text-slate-500">{mode.description}</p>
                                </article>
                            </Link>
                        ))}
                    </div>

                    <div className="landing-motion landing-rail mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white/80 py-3 shadow-sm" data-motion>
                        <div className="landing-rail-track flex min-w-max gap-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                            {[...prepRailItems, ...prepRailItems].map((item, index) => (
                                <span key={`${item}-${index}`} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="landing-dynamic-section border-y border-slate-200/80 bg-white py-14 lg:py-20">
                <div className="container-page">
                    <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                        <div className="landing-motion" data-motion>
                            <span className="section-eyebrow">Exam coverage</span>
                            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
                                Built around the way students actually prepare.
                            </h2>
                            <p className="mt-4 text-slate-500">
                                Content can grow from study material and notes into quizzes, from quizzes into sectional mocks, and from mocks into contests with rankings.
                            </p>
                            <div className="mt-7 flex flex-wrap gap-2">
                                {examTracks.map((track) => (
                                    <span key={track} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                                        {track}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            {workflowSteps.map((step) => (
                                <div key={step.step} className="landing-motion landing-lift-card rounded-2xl border border-slate-200 bg-slate-50/80 p-5" data-motion>
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-primary-600">{step.step}</span>
                                    <h3 className="mt-3 text-xl font-bold text-slate-950">{step.title}</h3>
                                    <p className="mt-2 text-sm text-slate-500">{step.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="landing-dynamic-section py-14 lg:py-20">
                <div className="container-page">
                    <div className="landing-motion mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-motion>
                        <div>
                            <span className="section-eyebrow">Latest prep drops</span>
                            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
                                Featured tests, study material, and notes
                            </h2>
                        </div>
                        <Link href="/courses" className="hidden items-center gap-2 text-sm font-bold text-primary-700 transition-colors hover:text-primary-900 sm:flex">
                            Browse full catalog
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
                        {loading ? (
                            [1, 2, 3, 4].map((item) => (
                                <div key={item} className="landing-motion" data-motion>
                                    <Card hoverable padding="none" className="overflow-hidden">
                                    <div className="aspect-[4/3] animate-pulse bg-slate-100" />
                                    <div className="p-5">
                                        <div className="mb-4 h-4 w-1/3 rounded bg-slate-200" />
                                        <div className="mb-3 h-6 w-3/4 rounded bg-slate-200" />
                                        <div className="mb-6 h-4 w-full rounded bg-slate-100" />
                                        <div className="h-6 w-20 rounded bg-slate-200" />
                                    </div>
                                    </Card>
                                </div>
                            ))
                        ) : featuredProducts.length > 0 ? (
                            featuredProducts.map((product) => (
                                <div key={product.id} className="landing-motion landing-lift-card rounded-2xl" data-motion>
                                    <ProductCard
                                        product={product}
                                        rating={reviewStats.get(product.id)?.averageRating}
                                        reviewCount={reviewStats.get(product.id)?.reviewCount}
                                    />
                                </div>
                            ))
                        ) : (
                            <div className="surface-panel landing-motion col-span-full py-16 text-center" data-motion>
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                                    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                </div>
                                <p className="text-lg font-bold text-slate-900">New exam prep resources are coming soon.</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-8 text-center sm:hidden">
                        <Link href="/courses">
                            <Button className="w-full">View All Resources</Button>
                        </Link>
                    </div>
                </div>
            </section>

            <section className="landing-dynamic-section border-y border-slate-200/80 bg-white py-14 lg:py-20">
                <div className="container-page">
                    <div className="landing-motion mb-10 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end" data-motion>
                        <div>
                            <span className="section-eyebrow">Digital products</span>
                            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
                                Practical products for students who want a sharper edge.
                            </h2>
                        </div>
                        <div>
                            <p className="text-slate-500">
                                Keep test series and courses for preparation, but still sell downloadable resources like resume templates, ebooks, interview guides, checklists, and career packs.
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2">
                                {productKinds.map((kind, index) => (
                                    <Link
                                        key={kind}
                                        href="/products"
                                        className="landing-chip-float rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-600 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                                        style={{ animationDelay: `${index * 90}ms` }}
                                    >
                                        {kind}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
                        {loading ? (
                            [1, 2, 3, 4].map((item) => (
                                <div key={item} className="landing-motion" data-motion>
                                    <Card hoverable padding="none" className="overflow-hidden">
                                        <div className="aspect-[4/3] animate-pulse bg-slate-100" />
                                        <div className="p-5">
                                            <div className="mb-4 h-4 w-1/3 rounded bg-slate-200" />
                                            <div className="mb-3 h-6 w-3/4 rounded bg-slate-200" />
                                            <div className="mb-6 h-4 w-full rounded bg-slate-100" />
                                            <div className="h-6 w-20 rounded bg-slate-200" />
                                        </div>
                                    </Card>
                                </div>
                            ))
                        ) : digitalProducts.length > 0 ? (
                            digitalProducts.map((product) => (
                                <div key={product.id} className="landing-motion landing-lift-card rounded-2xl" data-motion>
                                    <ProductCard
                                        product={product}
                                        rating={reviewStats.get(product.id)?.averageRating}
                                        reviewCount={reviewStats.get(product.id)?.reviewCount}
                                    />
                                </div>
                            ))
                        ) : (
                            <div className="surface-panel landing-motion col-span-full overflow-hidden p-8" data-motion>
                                <div className="grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-center">
                                    <div>
                                        <span className="section-eyebrow">Coming next</span>
                                        <h3 className="font-display text-3xl font-bold text-slate-950">
                                            Product shelf is ready for templates, ebooks, and downloadable packs.
                                        </h3>
                                        <p className="mt-3 text-slate-500">
                                            Add products from the admin portal and they will appear here as a dedicated product storefront section.
                                        </p>
                                    </div>
                                    <Link href="/products">
                                        <Button size="lg" className="w-full">Open Product Store</Button>
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="landing-motion mt-8 flex justify-center" data-motion>
                        <Link href="/products">
                            <Button variant="outline" size="lg">
                                Browse All Products
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            <section className="landing-dynamic-section bg-slate-950 py-14 text-white lg:py-20">
                <div className="container-page">
                    <div className="grid gap-8 lg:grid-cols-[1fr_0.75fr] lg:items-center">
                        <div className="landing-motion" data-motion>
                            <span className="mb-4 inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-primary-100">
                                From content to competition
                            </span>
                            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-5xl">
                                Start with one topic. Turn it into a quiz, a mock test, and a ranked contest.
                            </h2>
                            <p className="mt-5 max-w-2xl text-slate-300">
                                Learn the concept, revise the notes, test yourself under time pressure, and keep improving with rankings and detailed review.
                            </p>
                        </div>
                        <div className="landing-motion relative flex flex-col gap-3 sm:flex-row lg:flex-col" data-motion>
                            <div className="mb-3 grid grid-cols-3 gap-2 sm:absolute sm:-top-20 sm:right-0 sm:mb-0 lg:static lg:grid-cols-2">
                                {ctaChips.map((chip, index) => (
                                    <span
                                        key={chip}
                                        className="landing-chip-float rounded-full border border-white/10 bg-white/10 px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-primary-100"
                                        style={{ animationDelay: `${index * 120}ms` }}
                                    >
                                        {chip}
                                    </span>
                                ))}
                            </div>
                            <Link href="/tests" className="flex-1">
                                <Button size="lg" className="w-full">
                                    Explore Mock Tests
                                </Button>
                            </Link>
                            <Link href="/courses" className="flex-1">
                                <Button variant="outline" size="lg" className="w-full !border-white/15 !bg-white/10 !text-white hover:!bg-white hover:!text-slate-950">
                                    Browse Study Material
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
