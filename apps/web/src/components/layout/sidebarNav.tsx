/**
 * Role-aware sidebar nav configs for the web app. Keeps the icons co-located
 * with the routes they point at so the shared `AppSidebar` can stay
 * presentational.
 */
import type { AppSidebarNavItem } from "@digimine/ui";
import type { Portal } from "@/contexts/AuthContext";

const SwitchIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h11m0 0l-3-3m3 3l-3 3M16 17H5m0 0l3 3m-3-3l3-3" />
    </svg>
);

/**
 * Sidebar links that let a multi-role user jump to their OTHER dashboards.
 * Returns the portals the user holds besides the one they're currently in,
 * so e.g. a teacher who also admins an institute sees "Institute dashboard"
 * in the teacher sidebar. Empty for single-role users.
 */
export function portalSwitchNav(
    portals: Portal[],
    current: Portal["id"]
): AppSidebarNavItem[] {
    return portals
        .filter((p) => p.id !== current)
        .map((p) => ({
            name: `${p.label} dashboard`,
            href: p.href,
            icon: SwitchIcon,
        }));
}

const HomeIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
);

const TestIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
);

const QuizIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <circle cx="12" cy="12" r="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <circle cx="12" cy="12" r="1.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
    </svg>
);

const ContestIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5H3v2a4 4 0 004 4M19 5h2v2a4 4 0 01-4 4" />
    </svg>
);

const MapIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
        />
    </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

const ClassroomIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
);

const CalendarIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);

const ProfileIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const CogIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const LibraryIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
);

const QuestionBankIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const StudentsIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
);

const EarningsIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const PracticeIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);

const InterviewIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h8m-8 4h5M7 20l-3 1 1-3.5A8.5 8.5 0 1112 20.5 8.6 8.6 0 017 20z" />
    </svg>
);

const UsageIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V5m0 14H5a2 2 0 01-2-2v-2a2 2 0 012-2h4m0 6h4m-4 0V11m4 8V9m0 10h4a2 2 0 002-2V7a2 2 0 00-2-2h-4m0 14V5" />
    </svg>
);

const PlanIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 16l-1.5-9 5 3.5L12 4l3.5 6.5 5-3.5L19 16H5zm0 0v1.5A1.5 1.5 0 006.5 19h11a1.5 1.5 0 001.5-1.5V16" />
    </svg>
);

const MessagesIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l9 6 9-6m-18 0a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
);

const ProjectIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 13l-1.5 1.5L10 16m4-3l1.5 1.5L14 16" />
    </svg>
);

const CreditIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

/**
 * The "AI Credits" sidebar entry. Rendered with an amber accent + a live
 * balance pill (via the sidebar's `accent`/`badge` affordances) so the
 * wallet stands out from the plain page links. Built per-render so the
 * number stays fresh as the balance updates.
 */
export function creditsNavItem(balance: number | null): AppSidebarNavItem {
    return {
        name: "AI Credits",
        href: "/credits",
        icon: CreditIcon,
        accent: true,
        badge: balance != null ? balance : null,
    };
}

/**
 * Insert the credits entry into a nav list right after `afterName` (or at
 * the end if that anchor isn't found) — but only when metering is enabled,
 * so launch mode shows no credit UI at all.
 */
export function withCredits(
    nav: AppSidebarNavItem[],
    enabled: boolean,
    balance: number | null,
    afterName: string
): AppSidebarNavItem[] {
    if (!enabled) return nav;
    const item = creditsNavItem(balance);
    const idx = nav.findIndex((n) => n.name === afterName);
    if (idx === -1) return [...nav, item];
    return [...nav.slice(0, idx + 1), item, ...nav.slice(idx + 1)];
}

export const studentNav: AppSidebarNavItem[] = [
    { name: "My Library", href: "/dashboard", icon: LibraryIcon, exact: true },
    { name: "Practice (DSA/SQL)", href: "/practice", icon: PracticeIcon },
    { name: "AI Interview", href: "/dashboard/interviews", icon: InterviewIcon },
    { name: "Test Series", href: "/dashboard/tests", icon: TestIcon },
    { name: "Quizzes", href: "/dashboard/quizzes", icon: QuizIcon },
    { name: "Contests", href: "/dashboard/contests", icon: ContestIcon },
    { name: "Job Map", href: "/student/jobs", icon: MapIcon },
    { name: "Project Evals", href: "/dashboard/project-evals", icon: ProjectIcon },
    { name: "Downloads", href: "/dashboard/downloads", icon: DownloadIcon },
    { name: "My Classrooms", href: "/student/classrooms", icon: ClassroomIcon },
    { name: "Timetable", href: "/student/timetable", icon: CalendarIcon },
    { name: "Messages", href: "/messages", icon: MessagesIcon },
    { name: "My Plan", href: "/dashboard/plan", icon: PlanIcon },
    { name: "Profile & Settings", href: "/dashboard/profile", icon: ProfileIcon },
];

export const teacherNav: AppSidebarNavItem[] = [
    { name: "Dashboard", href: "/teacher/dashboard", icon: HomeIcon },
    { name: "Classes", href: "/teacher/classes", icon: StudentsIcon },
    { name: "My Content", href: "/teacher/content", icon: LibraryIcon },
    { name: "Project Evals", href: "/teacher/project-evals", icon: ProjectIcon },
    { name: "Question Bank", href: "/teacher/questions", icon: QuestionBankIcon },
    { name: "All Students", href: "/teacher/students", icon: StudentsIcon },
    { name: "Messages", href: "/messages", icon: MessagesIcon },
    { name: "Usage", href: "/teacher/usage", icon: UsageIcon },
    { name: "Earnings", href: "/teacher/earnings", icon: EarningsIcon },
    { name: "Profile & Settings", href: "/teacher/profile", icon: ProfileIcon },
];

export const instituteNav: AppSidebarNavItem[] = [
    { name: "Dashboard", href: "/institute/dashboard", icon: HomeIcon, exact: true },
    { name: "Reports", href: "/institute/reports", icon: UsageIcon },
    { name: "Teachers", href: "/institute/teachers", icon: StudentsIcon },
    { name: "Students", href: "/institute/students", icon: StudentsIcon },
    { name: "Classes", href: "/institute/classes", icon: ClassroomIcon },
    { name: "Question Bank", href: "/institute/question-bank", icon: QuestionBankIcon },
    { name: "Content", href: "/institute/content", icon: LibraryIcon },
    { name: "Project Evals", href: "/institute/project-evals", icon: ProjectIcon },
    { name: "Billing", href: "/institute/billing", icon: EarningsIcon },
    { name: "Settings", href: "/institute/settings", icon: CogIcon },
    { name: "Profile", href: "/institute/profile", icon: ProfileIcon },
];
