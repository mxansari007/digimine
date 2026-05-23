/**
 * Mega-nav configuration for the public header.
 *
 * Each top-level item has its own dropdown panel. The panel layout is:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  [Hero block]                │  [Sub-link columns]               │
 *   │  Title + blurb + thumbnail   │  Section 1 · Section 2            │
 *   │  Primary CTA                 │  link · link · link               │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  [Featured row with thumbnail cards]                             │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Keep the data structural and dumb — visual rendering lives in MegaNav.tsx.
 */

import type { ReactNode } from "react";

export type MegaLink = {
    label: string;
    href: string;
    description?: string;
    icon?: ReactNode;
};

export type MegaSection = {
    heading: string;
    items: MegaLink[];
};

export type MegaFeatured = {
    title: string;
    description: string;
    href: string;
    /** Tailwind gradient classes used as a colored thumbnail fallback when
     *  `imageUrl` isn't provided. */
    gradient: string;
    /** Optional real cover image URL. When set, renders as the thumbnail and
     *  the gradient becomes a fallback (only visible while the image loads).
     *  Use the same Firebase Storage / imgproxy URLs the rest of the site
     *  serves — keeps optimization + caching consistent. */
    imageUrl?: string;
    /** Optional badge text shown over the thumbnail (e.g. "Free", "Live"). */
    badge?: string;
};

export type MegaHero = {
    heading: string;
    description: string;
    cta: { label: string; href: string };
    /** Tailwind gradient classes — used both for the CTA button background
     *  and as the hero thumbnail fallback when `imageUrl` isn't provided. */
    gradient: string;
    /** Optional real image URL for the hero thumbnail strip. */
    imageUrl?: string;
    /** Two short stats shown under the CTA. */
    stats?: { value: string; label: string }[];
};

export type MegaItem = {
    /** Trigger label in the nav bar. */
    label: string;
    /** Click target on the trigger itself (when user clicks the label without diving). */
    href: string;
    /** Mega-menu accent color used for ring/highlight. */
    accent: "primary" | "amber" | "emerald" | "indigo" | "rose" | "violet";
    hero: MegaHero;
    sections: MegaSection[];
    featured: MegaFeatured[];
};

export const megaNav: MegaItem[] = [
    {
        label: "Practice",
        href: "/practice",
        accent: "primary",
        hero: {
            heading: "DSA + SQL practice",
            description:
                "Solve real problems with instant judging in 4 languages. Daily streaks, mastery tracking, and spaced repetition built in.",
            cta: { label: "Start practicing free", href: "/practice" },
            gradient: "from-primary-500 via-teal-500 to-cyan-500",
            stats: [
                { value: "200+", label: "problems" },
                { value: "30+", label: "patterns" },
            ],
        },
        sections: [
            {
                heading: "By type",
                items: [
                    { label: "DSA problems", href: "/practice/problems?kind=dsa", description: "Arrays, trees, DP, graphs" },
                    { label: "SQL problems", href: "/practice/problems?kind=sql", description: "Joins, windows, aggregates" },
                    { label: "All problems", href: "/practice/problems" },
                ],
            },
            {
                heading: "Tools",
                items: [
                    { label: "Mastery board", href: "/practice/mastery", description: "Track your weak patterns" },
                    { label: "Revision queue", href: "/practice/revision", description: "Spaced repetition review" },
                    { label: "Practice sheets", href: "/practice/sheets", description: "Curated problem sets" },
                ],
            },
        ],
        featured: [
            {
                title: "Two-pointer technique",
                description: "Master one of the most-asked patterns",
                href: "/practice/problems?pattern=two-pointers",
                gradient: "from-primary-100 via-primary-200 to-teal-200",
                badge: "Popular",
            },
            {
                title: "SQL window functions",
                description: "Ranking, running totals, percentiles",
                href: "/practice/problems?pattern=window-functions",
                gradient: "from-amber-100 via-orange-200 to-rose-200",
            },
            {
                title: "Dynamic programming",
                description: "Build intuition step by step",
                href: "/practice/problems?pattern=dynamic-programming",
                gradient: "from-violet-100 via-purple-200 to-fuchsia-200",
            },
        ],
    },
    {
        label: "Courses",
        href: "/courses",
        accent: "violet",
        hero: {
            heading: "Structured learning paths",
            description:
                "Chapter-by-chapter courses with embedded quizzes, downloadable notes, and completion certificates.",
            cta: { label: "Browse courses", href: "/courses" },
            gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
            stats: [
                { value: "20+", label: "courses" },
                { value: "Free", label: "to start" },
            ],
        },
        sections: [
            {
                heading: "By subject",
                items: [
                    { label: "Data Structures", href: "/courses?subject=dsa" },
                    { label: "Database & SQL", href: "/courses?subject=sql" },
                    { label: "Operating Systems", href: "/courses?subject=os" },
                    { label: "Aptitude", href: "/courses?subject=aptitude" },
                ],
            },
            {
                heading: "Quick access",
                items: [
                    { label: "All courses", href: "/courses" },
                    { label: "Free courses", href: "/courses?access=free" },
                    { label: "My learning", href: "/dashboard/courses", description: "Continue where you left off" },
                ],
            },
        ],
        featured: [
            {
                title: "Placement Roadmap",
                description: "12-week plan from zero to offer",
                href: "/articles?tag=roadmap",
                gradient: "from-violet-100 via-purple-200 to-pink-200",
                badge: "Editor's pick",
            },
            {
                title: "Mastering recursion",
                description: "Mental models for solving recursive problems",
                href: "/courses?q=recursion",
                gradient: "from-blue-100 via-indigo-200 to-violet-200",
            },
            {
                title: "SQL deep-dive",
                description: "From SELECT to query optimization",
                href: "/courses?q=sql",
                gradient: "from-emerald-100 via-teal-200 to-cyan-200",
            },
        ],
    },
    {
        label: "Articles",
        href: "/articles",
        accent: "emerald",
        hero: {
            heading: "Tutorials &amp; deep-dives",
            description:
                "Long-form content from our editorial team — placement patterns, company guides, technical walkthroughs.",
            cta: { label: "Read latest", href: "/articles" },
            gradient: "from-emerald-500 via-teal-500 to-cyan-500",
            stats: [
                { value: "40+", label: "articles" },
                { value: "Free", label: "always" },
            ],
        },
        sections: [
            {
                heading: "By category",
                items: [
                    { label: "Guides", href: "/articles?category=guide" },
                    { label: "Tutorials", href: "/articles?category=tutorial" },
                    { label: "Company prep", href: "/articles?category=company" },
                    { label: "Placement news", href: "/articles?category=news" },
                ],
            },
            {
                heading: "Popular topics",
                items: [
                    { label: "TCS NQT", href: "/articles?tag=tcs" },
                    { label: "Infosys", href: "/articles?tag=infosys" },
                    { label: "DSA patterns", href: "/articles?tag=dsa" },
                    { label: "Aptitude tricks", href: "/articles?tag=aptitude" },
                ],
            },
        ],
        featured: [
            {
                title: "TCS NQT 2026 pattern, syllabus & cutoffs",
                description: "Full breakdown with practice strategy",
                href: "/articles",
                gradient: "from-emerald-100 via-teal-200 to-cyan-200",
                badge: "New",
            },
            {
                title: "How to crack any aptitude test",
                description: "Time tricks for the impossible questions",
                href: "/articles?tag=aptitude",
                gradient: "from-amber-100 via-orange-200 to-red-200",
            },
            {
                title: "From college to offer",
                description: "Real placement stories &amp; lessons",
                href: "/articles?category=stories",
                gradient: "from-blue-100 via-sky-200 to-cyan-200",
            },
        ],
    },
    {
        label: "Mock Tests",
        href: "/tests",
        accent: "indigo",
        hero: {
            heading: "Full-length mock exams",
            description:
                "Real exam timing, sectional cutoffs, and detailed analytics. Built to mirror the actual placement papers.",
            cta: { label: "Browse test series", href: "/tests" },
            gradient: "from-indigo-500 via-blue-500 to-sky-500",
            stats: [
                { value: "10+", label: "series" },
                { value: "Real", label: "timing" },
            ],
        },
        sections: [
            {
                heading: "By company",
                items: [
                    { label: "TCS NQT series", href: "/tests?q=tcs" },
                    { label: "Infosys series", href: "/tests?q=infosys" },
                    { label: "Wipro series", href: "/tests?q=wipro" },
                    { label: "Capgemini series", href: "/tests?q=capgemini" },
                ],
            },
            {
                heading: "By access",
                items: [
                    { label: "All test series", href: "/tests" },
                    { label: "Free tests", href: "/tests?access=free" },
                    { label: "Premium tests", href: "/tests?access=paid" },
                ],
            },
        ],
        featured: [
            {
                title: "TCS NQT Mock Series",
                description: "10 mock papers, full exam pattern",
                href: "/tests?q=tcs",
                gradient: "from-indigo-100 via-blue-200 to-sky-200",
                badge: "Most popular",
            },
            {
                title: "Aptitude bootcamp",
                description: "Sectional drills + 3 full mocks",
                href: "/tests?q=aptitude",
                gradient: "from-amber-100 via-yellow-200 to-orange-200",
            },
            {
                title: "Coding round prep",
                description: "DSA + SQL combined paper",
                href: "/tests?q=coding",
                gradient: "from-emerald-100 via-green-200 to-teal-200",
            },
        ],
    },
    {
        label: "Quizzes",
        href: "/quizzes",
        accent: "amber",
        hero: {
            heading: "5-minute topic checks",
            description:
                "Quick concept recall, code-output trace, aptitude tricks. Drill anything between study sessions.",
            cta: { label: "Browse quizzes", href: "/quizzes" },
            gradient: "from-amber-500 via-orange-500 to-rose-500",
            stats: [
                { value: "30+", label: "quizzes" },
                { value: "5 min", label: "avg" },
            ],
        },
        sections: [
            {
                heading: "By topic",
                items: [
                    { label: "DSA concepts", href: "/quizzes?category=dsa" },
                    { label: "SQL queries", href: "/quizzes?category=sql" },
                    { label: "OS &amp; DBMS", href: "/quizzes?category=cs-fundamentals" },
                    { label: "Aptitude", href: "/quizzes?category=aptitude" },
                ],
            },
            {
                heading: "Quick access",
                items: [
                    { label: "All quizzes", href: "/quizzes" },
                    { label: "Free quizzes", href: "/quizzes?access=free" },
                    { label: "Course quizzes", href: "/quizzes?access=course_only" },
                ],
            },
        ],
        featured: [
            {
                title: "Big-O speedrun",
                description: "10 questions, complexity reasoning",
                href: "/quizzes?q=complexity",
                gradient: "from-amber-100 via-orange-200 to-red-200",
                badge: "Quick win",
            },
            {
                title: "Output prediction",
                description: "Trace code in your head",
                href: "/quizzes?q=output",
                gradient: "from-violet-100 via-purple-200 to-pink-200",
            },
            {
                title: "Time-and-work",
                description: "Aptitude classic — 5 min drill",
                href: "/quizzes?q=aptitude",
                gradient: "from-emerald-100 via-teal-200 to-cyan-200",
            },
        ],
    },
    {
        label: "Contests",
        href: "/contests",
        accent: "rose",
        hero: {
            heading: "Live ranked sprints",
            description:
                "Scheduled events with a shared clock and final ranks that lock at close. Compete against peers nationwide.",
            cta: { label: "See contests", href: "/contests" },
            gradient: "from-rose-500 via-pink-500 to-fuchsia-500",
            stats: [
                { value: "Weekly", label: "sprints" },
                { value: "Live", label: "ranks" },
            ],
        },
        sections: [
            {
                heading: "By phase",
                items: [
                    { label: "Live now", href: "/contests" },
                    { label: "Upcoming", href: "/contests" },
                    { label: "Past contests", href: "/contests" },
                ],
            },
            {
                heading: "By format",
                items: [
                    { label: "Aptitude sprints", href: "/contests" },
                    { label: "Coding rounds", href: "/contests" },
                    { label: "Full-pattern mocks", href: "/contests" },
                ],
            },
        ],
        featured: [
            {
                title: "Weekly Aptitude Sprint",
                description: "Every Saturday · 30 min · open to all",
                href: "/contests",
                gradient: "from-rose-100 via-pink-200 to-fuchsia-200",
                badge: "Recurring",
            },
            {
                title: "Monthly Coding Cup",
                description: "First Sunday · 90 min · ₹5k prize",
                href: "/contests",
                gradient: "from-indigo-100 via-blue-200 to-cyan-200",
            },
            {
                title: "Mega Mock Marathon",
                description: "Full TCS-pattern paper, ranked",
                href: "/contests",
                gradient: "from-amber-100 via-orange-200 to-rose-200",
            },
        ],
    },
];
