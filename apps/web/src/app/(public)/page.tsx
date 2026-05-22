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

// ────────────────────────────────────────────────────────────────────────
// Audience-targeted content
// ────────────────────────────────────────────────────────────────────────

type AudienceKey = "student" | "teacher" | "institute";

const audiencePanels: Record<
    AudienceKey,
    {
        label: string;
        subline: string;
        headline: string;
        description: string;
        bullets: { title: string; text: string }[];
        ctaPrimary: { label: string; href: string };
        ctaSecondary: { label: string; href: string };
        stat: { value: string; label: string };
        accent: string;
        comingSoon?: boolean;
    }
> = {
    student: {
        label: "For students",
        subline: "Placement & exam prep",
        headline: "Land your dream offer with focused placement prep.",
        description:
            "Company-style mocks, sectional cutoffs, coding rounds, aptitude drills, and the notes you actually need — all built for placement season and beyond.",
        bullets: [
            { title: "Company-style mocks", text: "Timed papers with sections, cutoffs, and rank distributions like the real thing." },
            { title: "Coding rounds", text: "Run, test, and submit in Python, Java, C++ or JavaScript with hidden test cases." },
            { title: "Notes that don't waste your time", text: "Compact revision notes for DSA, OS, DBMS, CN, aptitude, and HR rounds." },
            { title: "Live contests", text: "Compete in scheduled sprints. Live leaderboard. Final ranks at close." },
        ],
        ctaPrimary: { label: "Start prepping free", href: "/register" },
        ctaSecondary: { label: "Browse test series", href: "/tests" },
        stat: { value: "10,000+", label: "questions and counting" },
        accent: "from-indigo-500 via-blue-500 to-cyan-500",
    },
    teacher: {
        label: "For individual teachers",
        subline: "Solo educators",
        headline: "Run your coaching online without paying for an LMS.",
        description:
            "Create quizzes, tests, contests, and courses. Manage one class or twenty. Share an invite link — students join in a tap, and you see everything they do.",
        bullets: [
            { title: "Many classes, one dashboard", text: "Spin up Class 10A, 10B, JEE batch, NEET batch — each with its own roster and invite code." },
            { title: "Publish once, target anywhere", text: "A single test or quiz can go to one class or all of them at once." },
            { title: "See every attempt", text: "Per-student progress, per-content leaderboards, time spent, score distribution, and pass rates." },
            { title: "Earn on the side", text: "Submit your best content for the public marketplace and earn revenue share." },
        ],
        ctaPrimary: { label: "Start teaching free", href: "/register?role=teacher" },
        ctaSecondary: { label: "See teacher plans", href: "/for-teachers" },
        stat: { value: "₹499", label: "starter plan per month" },
        accent: "from-amber-500 via-orange-500 to-rose-500",
    },
    institute: {
        label: "For institutes",
        subline: "Coaching centres & colleges",
        headline: "A full LMS for your institute. At a marginal price.",
        description:
            "Onboard your teachers, add students in bulk, run institute-wide tests, watch performance across batches. Multi-teacher, multi-batch, multi-subject — built for scale, priced like a small SaaS.",
        bullets: [
            { title: "Centralised admin", text: "Add teachers, assign batches, control branding, and own the data your institute generates." },
            { title: "Batch-level analytics", text: "Compare Class 10A vs 10B, this year vs last, mock vs final exam — at the institute level." },
            { title: "Bulk student onboarding", text: "Upload CSVs, generate invite codes per batch, sync rolls — set up a 300-student batch in an afternoon." },
            { title: "Your brand, your domain", text: "White-label options for institutes that want their own front door (on Institution plan)." },
        ],
        ctaPrimary: { label: "Create your institute", href: "/register?intent=institute" },
        ctaSecondary: { label: "See plans & details", href: "/for-institutes" },
        stat: { value: "₹2,000", label: "starter plan per month" },
        accent: "from-emerald-500 via-teal-500 to-cyan-500",
    },
};

const platformStats = [
    { value: "10K+", label: "practice questions" },
    { value: "150+", label: "company-style mocks" },
    { value: "4", label: "languages in code editor" },
    { value: "1", label: "place for your whole prep" },
];

// Feature grid: cards that work as marketing copy for all 3 audiences
const featureCards = [
    {
        title: "Mock tests with real exam patterns",
        description: "Sectional papers, cutoffs, ranking curves, time-bound submissions. Resume on reload. Auto-submit on timeout.",
        icon: "M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
        accent: "from-indigo-500 to-blue-600",
        tag: "Mocks",
    },
    {
        title: "Built-in code editor",
        description: "Python, Java, C++ and JavaScript. Hidden test cases. Anti-paste. Weighted scoring or all-or-nothing — your call.",
        icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
        accent: "from-fuchsia-500 to-pink-600",
        tag: "Coding",
    },
    {
        title: "Quizzes for every topic",
        description: "Short revision drills, formula recall, mistake recycling, passage-based questions, MCQ + text-input.",
        icon: "M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h4.5M5 6.75h.008v.008H5V6.75zm0 5.25h.008v.008H5V12zm0 5.25h.008v.008H5v-.008z",
        accent: "from-emerald-500 to-teal-600",
        tag: "Quizzes",
    },
    {
        title: "Live contests",
        description: "Shared start time, shared timer, live leaderboard. Finalised ranks when the window closes.",
        icon: "M16.5 18.75h-9m9 0a3 3 0 003-3V5.25h-15v10.5a3 3 0 003 3m9 0v1.5a1.5 1.5 0 01-1.5 1.5h-6a1.5 1.5 0 01-1.5-1.5v-1.5",
        accent: "from-amber-500 to-orange-600",
        tag: "Compete",
    },
    {
        title: "Per-student analytics",
        description: "Average %, best %, time invested, content completed, daily activity, attempt history. For teachers and the student themselves.",
        icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
        accent: "from-sky-500 to-indigo-600",
        tag: "Analytics",
    },
    {
        title: "Marketplace + classroom",
        description: "Sell to the public or teach a private class — same platform. Move content between the two with one toggle.",
        icon: "M3.75 3h16.5v16.5H3.75V3zm3 6.75h10.5m-10.5 3h10.5m-10.5 3h6",
        accent: "from-rose-500 to-fuchsia-600",
        tag: "Two modes",
    },
];

const workflowSteps = [
    { step: "01", title: "Read the topic", text: "Start with concise notes built around actual exam patterns and placement company asks." },
    { step: "02", title: "Practice by section", text: "Solve topic quizzes and sectional tests before attempting the full mock." },
    { step: "03", title: "Attempt the mock", text: "Timed, sectional, leaderboard-ready. Auto-save and auto-submit so you never lose work." },
    { step: "04", title: "Review and rank", text: "See your score, your rank, your weak topics, your time per question — then practise smarter." },
];

const testimonials = [
    {
        quote: "The placement mocks felt closer to the real Infosys paper than anything else I tried. Section cutoffs and the rank curve actually made me prepare differently.",
        author: "Sneha P.",
        role: "Final year CSE",
    },
    {
        quote: "I switched my whole coaching to this. Multi-class support means each batch has its own invite link. I see every attempt of every student in one dashboard.",
        author: "Rahul S.",
        role: "Aptitude coach, Pune",
    },
    {
        quote: "We onboarded 300 students in two evenings. The institute admin views give me what I used to pay 10x for.",
        author: "Dr. K. Iyer",
        role: "Director, coaching institute",
    },
];

// ────────────────────────────────────────────────────────────────────────

export default function HomePage() {
    const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviewStats, setReviewStats] = useState<Map<string, { averageRating: number; reviewCount: number }>>(new Map());
    const [audience, setAudience] = useState<AudienceKey>("student");

    const activePanel = audiencePanels[audience];

    useEffect(() => {
        async function fetchFeatured() {
            try {
                const [products, stats, testSeries] = await Promise.all([
                    getProducts({ limitCount: 6 }),
                    getAllReviewStats(),
                    import("@/lib/firestore/tests").then((m) => m.getPublishedTestSeries()),
                ]);
                const mappedTestSeries = testSeries.slice(0, 2).map(mapTestSeriesToProduct);
                setFeaturedProducts([...mappedTestSeries, ...products].slice(0, 4));
                setReviewStats(stats);
            } catch (error) {
                console.error("Error fetching featured products:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchFeatured();
    }, []);

    // Scroll reveal + cursor parallax
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
                    if (entry.isIntersecting) entry.target.classList.add("is-visible");
                });
            },
            { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
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
            {/* ─────────────────────────────────────────────────────────────
                ANNOUNCEMENT STRIP
                ──────────────────────────────────────────────────────────── */}
            <div className="border-b border-slate-200 bg-slate-950 text-slate-100">
                <div className="container-page flex flex-wrap items-center justify-center gap-3 py-2 text-center text-xs">
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                        Now live
                    </span>
                    <span className="font-medium text-slate-200">
                        Institute accounts — onboard your teachers and batches under one roof.
                    </span>
                    <Link href="/for-institutes" className="font-semibold text-emerald-300 hover:text-emerald-200">
                        Create your institute →
                    </Link>
                </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
                HERO with audience switcher
                ──────────────────────────────────────────────────────────── */}
            <section className="landing-dynamic-section relative overflow-hidden border-b border-slate-200/70">
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                        backgroundImage:
                            "linear-gradient(90deg, rgba(2,6,23,0.96) 0%, rgba(2,6,23,0.86) 46%, rgba(2,6,23,0.55) 100%), url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1800&q=80')",
                    }}
                />
                <div
                    className="absolute inset-0 opacity-20"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)",
                        backgroundSize: "42px 42px",
                    }}
                />

                <div className="container-page relative z-10 py-14 sm:py-20">
                    <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
                        {/* Left: copy */}
                        <div className="landing-motion" data-motion>
                            <div className="mb-5 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary-100 backdrop-blur-md">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {activePanel.subline}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
                                    {activePanel.label}
                                </span>
                            </div>
                            <h1
                                className="font-display max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[3.4rem]"
                                style={{ lineHeight: 1.05 }}
                            >
                                {activePanel.headline}
                            </h1>
                            <p className="mt-6 max-w-2xl text-base text-slate-200 sm:text-lg" style={{ lineHeight: 1.7 }}>
                                {activePanel.description}
                            </p>

                            {/* Role pills */}
                            <div className="mt-8 inline-flex rounded-2xl border border-white/15 bg-white/[0.06] p-1 backdrop-blur">
                                {(Object.keys(audiencePanels) as AudienceKey[]).map((key) => {
                                    const panel = audiencePanels[key];
                                    const active = key === audience;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setAudience(key)}
                                            className={`relative rounded-xl px-3 py-2 text-xs font-bold transition-all sm:px-4 sm:text-sm ${
                                                active
                                                    ? "bg-white text-slate-950 shadow"
                                                    : "text-slate-200 hover:bg-white/10"
                                            }`}
                                        >
                                            {panel.label.replace("For ", "")}
                                            {panel.comingSoon && (
                                                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${active ? "bg-amber-100 text-amber-700" : "bg-amber-500/20 text-amber-300"}`}>
                                                    Soon
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                                <Link href={activePanel.ctaPrimary.href}>
                                    <Button size="lg">
                                        {activePanel.ctaPrimary.label}
                                    </Button>
                                </Link>
                                <Link href={activePanel.ctaSecondary.href}>
                                    <Button
                                        variant="outline"
                                        size="lg"
                                        className="!border-white/20 !bg-white/10 !text-white hover:!bg-white hover:!text-slate-950"
                                    >
                                        {activePanel.ctaSecondary.label}
                                    </Button>
                                </Link>
                            </div>

                            {/* Audience-specific bullets */}
                            <div className="mt-10 grid gap-3 sm:grid-cols-2">
                                {activePanel.bullets.slice(0, 4).map((b) => (
                                    <div
                                        key={b.title}
                                        className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur"
                                    >
                                        <p className="text-sm font-bold text-white">{b.title}</p>
                                        <p className="mt-1 text-xs leading-5 text-slate-300">{b.text}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right: stat card / preview */}
                        <div className="landing-motion relative" data-motion>
                            <div className="hero-console relative overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-1 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                                <div className="hero-scanline absolute inset-1 rounded-[1.4rem]" />
                                <div className="relative rounded-[1.4rem] bg-slate-950/[0.9] p-6 ring-1 ring-white/10">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={`rounded-full bg-gradient-to-r ${activePanel.accent} px-3 py-1 text-xs font-bold text-white shadow`}>
                                            {activePanel.label.replace("For ", "")}
                                        </span>
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                                            Live preview
                                        </span>
                                    </div>
                                    <p className="mt-6 text-5xl font-black text-white sm:text-6xl">{activePanel.stat.value}</p>
                                    <p className="text-sm font-semibold text-slate-300">{activePanel.stat.label}</p>

                                    {/* Mini bullet preview */}
                                    <div className="mt-6 space-y-2">
                                        {activePanel.bullets.slice(0, 3).map((b, i) => (
                                            <div
                                                key={b.title}
                                                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3"
                                                style={{ animation: `landing-chip-float 4.8s ease-in-out ${i * 0.4}s infinite` }}
                                            >
                                                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gradient-to-br ${activePanel.accent}`} />
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-bold text-white">{b.title}</p>
                                                    <p className="line-clamp-1 text-[11px] text-slate-400">{b.text}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Floating accent chips */}
                            <div className="pointer-events-none absolute -right-4 -top-4 hidden sm:block">
                                <span className="inline-flex rounded-full bg-amber-400/90 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-950 shadow-lg">
                                    placement-ready
                                </span>
                            </div>
                            <div className="pointer-events-none absolute -left-3 bottom-2 hidden sm:block">
                                <span className="inline-flex rounded-full bg-emerald-400/90 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-950 shadow-lg">
                                    live leaderboard
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Stats strip */}
                    <div className="landing-motion mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4" data-motion>
                        {platformStats.map((s) => (
                            <div
                                key={s.label}
                                className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-center backdrop-blur"
                            >
                                <p className="text-3xl font-black text-white">{s.value}</p>
                                <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-300">
                                    {s.label}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────
                THREE AUDIENCE CARDS
                ──────────────────────────────────────────────────────────── */}
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion max-w-3xl" data-motion>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Who is this for</p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                            Built for everyone in the prep journey.
                        </h2>
                        <p className="mt-3 text-sm text-slate-600 sm:text-base">
                            Whether you&apos;re studying, teaching, or running a whole institute — there&apos;s a path on
                            PlacementRanker that fits.
                        </p>
                    </div>

                    <div className="mt-10 grid gap-5 lg:grid-cols-3">
                        {(Object.keys(audiencePanels) as AudienceKey[]).map((key) => {
                            const panel = audiencePanels[key];
                            return (
                                <Card
                                    key={key}
                                    className="landing-motion landing-lift-card group relative overflow-hidden p-6"
                                    data-motion
                                >
                                    <div
                                        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${panel.accent}`}
                                    />
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                            {panel.label.replace("For ", "")}
                                        </p>
                                        {panel.comingSoon && (
                                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700 ring-1 ring-amber-200">
                                                Coming soon
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="mt-3 text-xl font-bold text-slate-900">{panel.subline}</h3>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{panel.description}</p>
                                    <ul className="mt-5 space-y-2 text-sm">
                                        {panel.bullets.slice(0, 3).map((b) => (
                                            <li key={b.title} className="flex items-start gap-2">
                                                <span
                                                    className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-gradient-to-br ${panel.accent}`}
                                                />
                                                <span className="text-slate-700">
                                                    <span className="font-semibold text-slate-900">{b.title}.</span>{" "}
                                                    {b.text}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-6 flex gap-2">
                                        <Link href={panel.ctaPrimary.href} className="flex-1">
                                            <Button variant="primary" className="w-full">
                                                {panel.ctaPrimary.label}
                                            </Button>
                                        </Link>
                                        <Link href={panel.ctaSecondary.href}>
                                            <Button variant="outline">{panel.ctaSecondary.label}</Button>
                                        </Link>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────
                FEATURE GRID
                ──────────────────────────────────────────────────────────── */}
            <section className="border-b border-slate-200 bg-slate-50">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-motion>
                        <div className="max-w-2xl">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Everything you need</p>
                            <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                                One platform. Mocks, code rounds, quizzes, contests, courses.
                            </h2>
                        </div>
                        <Link href="/tests" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                            See it in action →
                        </Link>
                    </div>

                    <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {featureCards.map((card) => (
                            <Card
                                key={card.title}
                                className="landing-motion landing-lift-card group relative overflow-hidden p-6"
                                data-motion
                            >
                                <div
                                    className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${card.accent} text-white shadow-lg`}
                                >
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                                    </svg>
                                </div>
                                <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    {card.tag}
                                </p>
                                <h3 className="mt-1 text-lg font-bold text-slate-900">{card.title}</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────
                STUDENT WORKFLOW
                ──────────────────────────────────────────────────────────── */}
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion max-w-3xl" data-motion>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">For students</p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                            The placement prep loop, done right.
                        </h2>
                        <p className="mt-3 text-sm text-slate-600 sm:text-base">
                            A four-step rhythm that keeps you in the seat: learn, drill, mock, review. Then do it again
                            until you&apos;re placement-ready.
                        </p>
                    </div>

                    <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {workflowSteps.map((step) => (
                            <div
                                key={step.step}
                                className="landing-motion relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6"
                                data-motion
                            >
                                <p className="font-display text-5xl font-black text-primary-100">{step.step}</p>
                                <h3 className="mt-3 text-lg font-bold text-slate-900">{step.title}</h3>
                                <p className="mt-1 text-sm leading-6 text-slate-600">{step.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────
                FEATURED TEST SERIES (kept from existing)
                ──────────────────────────────────────────────────────────── */}
            <section className="border-b border-slate-200 bg-slate-50">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-motion>
                        <div className="max-w-2xl">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Browse the catalogue</p>
                            <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                                Featured test series & courses
                            </h2>
                            <p className="mt-2 text-sm text-slate-600 sm:text-base">
                                Hand-picked for placement and exam prep. Free and paid.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Link href="/tests" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                                Tests →
                            </Link>
                            <Link href="/courses" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                                Courses →
                            </Link>
                            <Link href="/products" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                                Resources →
                            </Link>
                        </div>
                    </div>

                    {loading ? (
                        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-72 animate-pulse rounded-2xl bg-slate-200/60" />
                            ))}
                        </div>
                    ) : featuredProducts.length === 0 ? (
                        <Card className="mt-10 p-12 text-center text-sm text-slate-500">
                            No featured content yet — check back soon.
                        </Card>
                    ) : (
                        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            {featuredProducts.map((product) => {
                                const stats = reviewStats.get(product.id);
                                return (
                                    <ProductCard
                                        key={product.id}
                                        product={product}
                                        rating={stats?.averageRating}
                                        reviewCount={stats?.reviewCount}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────
                TEACHER VALUE PROP (visual split)
                ──────────────────────────────────────────────────────────── */}
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-16 sm:py-20">
                    <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                        <div className="landing-motion" data-motion>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">For teachers</p>
                            <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                                Run your coaching online. Keep your students engaged.
                            </h2>
                            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                                Stop juggling WhatsApp groups, Google Forms, and Excel sheets. Create classes, send a single
                                invite link per class, publish quizzes and mocks in minutes, and see every attempt in one
                                dashboard.
                            </p>

                            <ul className="mt-6 space-y-3 text-sm">
                                {audiencePanels.teacher.bullets.map((b) => (
                                    <li key={b.title} className="flex items-start gap-3">
                                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </span>
                                        <span>
                                            <span className="font-semibold text-slate-900">{b.title}. </span>
                                            <span className="text-slate-600">{b.text}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-7 flex flex-wrap gap-3">
                                <Link href="/register?role=teacher">
                                    <Button size="lg">Start teaching free</Button>
                                </Link>
                                <Link href="/for-teachers">
                                    <Button variant="outline" size="lg">
                                        See plans
                                    </Button>
                                </Link>
                            </div>
                        </div>

                        {/* Mock teacher dashboard */}
                        <div className="landing-motion" data-motion>
                            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 p-1 shadow-2xl">
                                <div className="rounded-[1.4rem] bg-slate-950 p-5 ring-1 ring-white/10">
                                    <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                                        <p className="text-xs font-bold uppercase tracking-widest text-amber-200">
                                            Teacher portal
                                        </p>
                                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                                            Live
                                        </span>
                                    </div>

                                    <h3 className="mt-4 text-lg font-bold text-white">My classes</h3>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {[
                                            { name: "Class 10A — Maths", active: 28, code: "CLS-AB12CD34" },
                                            { name: "JEE Batch 2026", active: 42, code: "CLS-XY78ZW45" },
                                            { name: "Aptitude — Placement", active: 67, code: "CLS-LM99NP21" },
                                            { name: "NEET Crash", active: 19, code: "CLS-QR55ST33" },
                                        ].map((c) => (
                                            <div key={c.code} className="rounded-xl border border-white/10 bg-white/[0.05] p-3">
                                                <p className="text-xs font-bold text-white">{c.name}</p>
                                                <p className="mt-1 text-[10px] font-mono text-amber-200">{c.code}</p>
                                                <p className="mt-1 text-[10px] text-slate-400">{c.active} active</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.05] p-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-bold text-white">This week&apos;s attempts</p>
                                            <p className="text-[10px] text-slate-400">156 / 4 classes</p>
                                        </div>
                                        <div className="mt-3 grid grid-cols-7 gap-1">
                                            {[24, 18, 32, 41, 22, 14, 5].map((v, i) => (
                                                <div key={i} className="flex flex-col items-center">
                                                    <div
                                                        className="w-full rounded-t bg-gradient-to-t from-amber-500 to-orange-300"
                                                        style={{ height: `${(v / 41) * 80}px` }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────
                INSTITUTE VALUE PROP
                ──────────────────────────────────────────────────────────── */}
            <section className="border-b border-slate-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-white">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center" data-motion>
                        <div>
                            <div className="flex items-center gap-2">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">For institutes</p>
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700 ring-1 ring-emerald-200">
                                    Now live
                                </span>
                            </div>
                            <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                                A full LMS for your institute. Priced like one teacher.
                            </h2>
                            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-700 sm:text-base">
                                Coaching centres, colleges, training institutes — bring all your teachers and batches under
                                one roof. Track every student across every test. Pay what you&apos;d pay for one Pro license.
                            </p>

                            <ul className="mt-6 space-y-3 text-sm">
                                {audiencePanels.institute.bullets.map((b) => (
                                    <li key={b.title} className="flex items-start gap-3">
                                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </span>
                                        <span>
                                            <span className="font-semibold text-slate-900">{b.title}. </span>
                                            <span className="text-slate-700">{b.text}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-7 flex flex-wrap gap-3">
                                <Link href="/register?intent=institute">
                                    <Button size="lg">Create your institute</Button>
                                </Link>
                                <Link href="/for-institutes">
                                    <Button variant="outline" size="lg">
                                        See plans & details
                                    </Button>
                                </Link>
                            </div>
                        </div>

                        {/* Institute summary cards */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            {[
                                { title: "Teachers", value: "12", caption: "Active educators", tone: "from-emerald-500 to-teal-600" },
                                { title: "Batches", value: "34", caption: "Across 4 streams", tone: "from-sky-500 to-blue-600" },
                                { title: "Students", value: "1,284", caption: "This academic year", tone: "from-violet-500 to-indigo-600" },
                                { title: "Avg score", value: "72%", caption: "Mock test average", tone: "from-amber-500 to-orange-600" },
                            ].map((s) => (
                                <Card key={s.title} className="p-5">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{s.title}</p>
                                    <p className={`mt-2 bg-gradient-to-br ${s.tone} bg-clip-text text-4xl font-black text-transparent`}>
                                        {s.value}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-600">{s.caption}</p>
                                </Card>
                            ))}
                            <div className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-white p-5">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                                    Volume-friendly pricing
                                </p>
                                <p className="mt-2 text-2xl font-bold text-slate-900">
                                    From <span className="text-emerald-700">₹4,999</span>/month — unlimited batches.
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    Custom plans for institutes with 500+ students.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────
                TESTIMONIALS
                ──────────────────────────────────────────────────────────── */}
            <section className="border-b border-slate-200 bg-slate-950 py-16 text-white sm:py-20">
                <div className="container-page">
                    <div className="landing-motion max-w-3xl" data-motion>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-200">Voices from the floor</p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-white sm:text-4xl">
                            Students, teachers, and institutes — all in one place.
                        </h2>
                    </div>
                    <div className="mt-10 grid gap-5 lg:grid-cols-3">
                        {testimonials.map((t) => (
                            <div
                                key={t.author}
                                className="landing-motion landing-lift-card rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
                                data-motion
                            >
                                <svg className="h-6 w-6 text-primary-300" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.571-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z" />
                                </svg>
                                <p className="mt-4 text-sm leading-7 text-slate-200">“{t.quote}”</p>
                                <p className="mt-5 text-sm font-bold text-white">{t.author}</p>
                                <p className="text-xs text-slate-400">{t.role}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────
                FINAL CTA
                ──────────────────────────────────────────────────────────── */}
            <section className="bg-gradient-to-br from-slate-50 via-white to-slate-50">
                <div className="container-page py-16 sm:py-24">
                    <div className="landing-motion mx-auto max-w-4xl text-center" data-motion>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Get started</p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-5xl">
                            Whichever side you&apos;re on, there&apos;s a free start.
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-600 sm:text-base">
                            Sign up as a student, switch into a teacher seat anytime, or apply for early institute access —
                            no credit card needed to start.
                        </p>

                        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                            <Link href="/register">
                                <Button size="lg">I&apos;m a student</Button>
                            </Link>
                            <Link href="/register?role=teacher">
                                <Button variant="outline" size="lg">
                                    I&apos;m a teacher
                                </Button>
                            </Link>
                            <Link href="/register?intent=institute">
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="!border-emerald-200 !bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100"
                                >
                                    Run an institute
                                </Button>
                            </Link>
                        </div>

                        <p className="mt-8 text-xs text-slate-500">
                            Already have an account?{" "}
                            <Link href="/login" className="font-semibold text-primary-700 hover:text-primary-800">
                                Sign in →
                            </Link>
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
