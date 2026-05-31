/**
 * Role-aware sidebar nav configs for the web app. Keeps the icons co-located
 * with the routes they point at so the shared `AppSidebar` can stay
 * presentational.
 */
import type { AppSidebarNavItem } from "@digimine/ui";

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

const ProfileIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

export const studentNav: AppSidebarNavItem[] = [
    { name: "My Library", href: "/dashboard", icon: LibraryIcon, exact: true },
    { name: "Practice (DSA/SQL)", href: "/practice", icon: PracticeIcon },
    { name: "AI Interview", href: "/dashboard/interviews", icon: InterviewIcon },
    { name: "Test Series", href: "/dashboard/tests", icon: TestIcon },
    { name: "Quizzes", href: "/dashboard/quizzes", icon: QuizIcon },
    { name: "Contests", href: "/dashboard/contests", icon: ContestIcon },
    { name: "Downloads", href: "/dashboard/downloads", icon: DownloadIcon },
    { name: "My Classrooms", href: "/student/classrooms", icon: ClassroomIcon },
    { name: "My Plan", href: "/dashboard/plan", icon: PlanIcon },
    { name: "Profile & Settings", href: "/dashboard/profile", icon: ProfileIcon },
];

export const teacherNav: AppSidebarNavItem[] = [
    { name: "Dashboard", href: "/teacher/dashboard", icon: HomeIcon },
    { name: "Classes", href: "/teacher/classes", icon: StudentsIcon },
    { name: "My Content", href: "/teacher/content", icon: LibraryIcon },
    { name: "Question Bank", href: "/teacher/questions", icon: QuestionBankIcon },
    { name: "All Students", href: "/teacher/students", icon: StudentsIcon },
    { name: "Usage", href: "/teacher/usage", icon: UsageIcon },
    { name: "Earnings", href: "/teacher/earnings", icon: EarningsIcon },
];

export const instituteNav: AppSidebarNavItem[] = [
    { name: "Dashboard", href: "/institute/dashboard", icon: HomeIcon, exact: true },
    { name: "Teachers", href: "/institute/teachers", icon: StudentsIcon },
    { name: "Students", href: "/institute/students", icon: StudentsIcon },
    { name: "Classes", href: "/institute/classes", icon: ClassroomIcon },
    { name: "Question Bank", href: "/institute/question-bank", icon: QuestionBankIcon },
    { name: "Content", href: "/institute/content", icon: LibraryIcon },
    { name: "Billing", href: "/institute/billing", icon: EarningsIcon },
    { name: "Settings", href: "/institute/settings", icon: ProfileIcon },
];
