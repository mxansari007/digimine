"use client";

/**
 * Persistent bottom navigation for phones (≤767px / `md:hidden`). Desktop and
 * tablet keep the sidebar + hamburger from `DashboardShell`; this gives phone
 * users one-tap access to the handful of destinations they actually use, plus a
 * "More" button that opens the full sidebar drawer (passed in via `onMore`).
 *
 * Self-contained icons so wiring a layout is just `<MobileTabBar role=… onMore=…/>`.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type TabRole = "student" | "teacher";

interface Tab {
    label: string;
    href: string;
    icon: ReactNode;
    /** Home tabs match only their exact path so they don't light up everywhere. */
    exact?: boolean;
}

const sw = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, viewBox: "0 0 24 24" } as const;

const HomeI = (
    <svg className="h-5 w-5" {...sw}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
);
const PracticeI = (
    <svg className="h-5 w-5" {...sw}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
);
const TestI = (
    <svg className="h-5 w-5" {...sw}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
);
const ResumeI = (
    <svg className="h-5 w-5" {...sw}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m-6-8h2M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" /></svg>
);
const ClassesI = (
    <svg className="h-5 w-5" {...sw}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
);
const ContentI = (
    <svg className="h-5 w-5" {...sw}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
);
const StudentsI = (
    <svg className="h-5 w-5" {...sw}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-4-4h-1m-6 5H2v-1a4 4 0 014-4h4m6-4a4 4 0 11-8 0 4 4 0 018 0zM20 8a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);
const MoreI = (
    <svg className="h-5 w-5" {...sw}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
);

const TABS: Record<TabRole, Tab[]> = {
    student: [
        { label: "Home", href: "/dashboard", icon: HomeI, exact: true },
        { label: "Practice", href: "/practice", icon: PracticeI },
        { label: "Tests", href: "/dashboard/tests", icon: TestI },
        { label: "Resume", href: "/student/resume", icon: ResumeI },
    ],
    teacher: [
        { label: "Home", href: "/teacher/dashboard", icon: HomeI, exact: true },
        { label: "Classes", href: "/teacher/classes", icon: ClassesI },
        { label: "Content", href: "/teacher/content", icon: ContentI },
        { label: "Students", href: "/teacher/students", icon: StudentsI },
    ],
};

export function MobileTabBar({ role, onMore }: { role: TabRole; onMore: () => void }) {
    const pathname = usePathname() ?? "";
    const tabs = TABS[role];
    const isActive = (t: Tab) =>
        t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");

    const itemBase =
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold leading-none transition-colors";
    const on = "text-primary-600 dark:text-primary-300";
    const off = "text-slate-500 dark:text-slate-400";

    return (
        <nav
            aria-label="Primary"
            className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-slate-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl md:hidden dark:border-slate-700/80 dark:bg-slate-900/95"
        >
            {tabs.map((t) => {
                const active = isActive(t);
                return (
                    <Link
                        key={t.href}
                        href={t.href}
                        aria-current={active ? "page" : undefined}
                        className={`${itemBase} ${active ? on : off}`}
                    >
                        {t.icon}
                        <span className="max-w-full truncate">{t.label}</span>
                    </Link>
                );
            })}
            <button type="button" onClick={onMore} className={`${itemBase} ${off}`} aria-label="More menu">
                {MoreI}
                <span>More</span>
            </button>
        </nav>
    );
}
