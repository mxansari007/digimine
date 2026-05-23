/**
 * Static content for the homepage — copy, audience panels, feature grid,
 * workflow steps, testimonials. Pure data (no JSX, no hooks) so it can be
 * imported by both the server `page.tsx` and the client islands.
 */

export type AudienceKey = "student" | "teacher" | "institute";

export const audiencePanels: Record<
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

export const platformStats = [
    { value: "10K+", label: "practice questions" },
    { value: "150+", label: "company-style mocks" },
    { value: "4", label: "languages in code editor" },
    { value: "1", label: "place for your whole prep" },
];

export const featureCards = [
    { title: "Mock tests with real exam patterns", description: "Sectional papers, cutoffs, ranking curves, time-bound submissions. Resume on reload. Auto-submit on timeout.", icon: "M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z", accent: "from-indigo-500 to-blue-600", tag: "Mocks" },
    { title: "Built-in code editor", description: "Python, Java, C++ and JavaScript. Hidden test cases. Anti-paste. Weighted scoring or all-or-nothing — your call.", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4", accent: "from-fuchsia-500 to-pink-600", tag: "Coding" },
    { title: "Quizzes for every topic", description: "Short revision drills, formula recall, mistake recycling, passage-based questions, MCQ + text-input.", icon: "M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h4.5M5 6.75h.008v.008H5V6.75zm0 5.25h.008v.008H5V12zm0 5.25h.008v.008H5v-.008z", accent: "from-emerald-500 to-teal-600", tag: "Quizzes" },
    { title: "Live contests", description: "Shared start time, shared timer, live leaderboard. Finalised ranks when the window closes.", icon: "M16.5 18.75h-9m9 0a3 3 0 003-3V5.25h-15v10.5a3 3 0 003 3m9 0v1.5a1.5 1.5 0 01-1.5 1.5h-6a1.5 1.5 0 01-1.5-1.5v-1.5", accent: "from-amber-500 to-orange-600", tag: "Compete" },
    { title: "Per-student analytics", description: "Average %, best %, time invested, content completed, daily activity, attempt history. For teachers and the student themselves.", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z", accent: "from-sky-500 to-indigo-600", tag: "Analytics" },
    { title: "Marketplace + classroom", description: "Sell to the public or teach a private class — same platform. Move content between the two with one toggle.", icon: "M3.75 3h16.5v16.5H3.75V3zm3 6.75h10.5m-10.5 3h10.5m-10.5 3h6", accent: "from-rose-500 to-fuchsia-600", tag: "Two modes" },
];

export const workflowSteps = [
    { step: "01", title: "Read the topic", text: "Start with concise notes built around actual exam patterns and placement company asks." },
    { step: "02", title: "Practice by section", text: "Solve topic quizzes and sectional tests before attempting the full mock." },
    { step: "03", title: "Attempt the mock", text: "Timed, sectional, leaderboard-ready. Auto-save and auto-submit so you never lose work." },
    { step: "04", title: "Review and rank", text: "See your score, your rank, your weak topics, your time per question — then practise smarter." },
];

export const testimonials = [
    { quote: "The placement mocks felt closer to the real Infosys paper than anything else I tried. Section cutoffs and the rank curve actually made me prepare differently.", author: "Sneha P.", role: "Final year CSE" },
    { quote: "I switched my whole coaching to this. Multi-class support means each batch has its own invite link. I see every attempt of every student in one dashboard.", author: "Rahul S.", role: "Aptitude coach, Pune" },
    { quote: "We onboarded 300 students in two evenings. The institute admin views give me what I used to pay 10x for.", author: "Dr. K. Iyer", role: "Director, coaching institute" },
];

export const instituteSummary = [
    { title: "Teachers", value: "12", caption: "Active educators", tone: "from-emerald-500 to-teal-600" },
    { title: "Batches", value: "34", caption: "Across 4 streams", tone: "from-sky-500 to-blue-600" },
    { title: "Students", value: "1,284", caption: "This academic year", tone: "from-violet-500 to-indigo-600" },
    { title: "Avg score", value: "72%", caption: "Mock test average", tone: "from-amber-500 to-orange-600" },
];

export const teacherDashboardMock = [
    { name: "Class 10A — Maths", active: 28, code: "CLS-AB12CD34" },
    { name: "JEE Batch 2026", active: 42, code: "CLS-XY78ZW45" },
    { name: "Aptitude — Placement", active: 67, code: "CLS-LM99NP21" },
    { name: "NEET Crash", active: 19, code: "CLS-QR55ST33" },
];
