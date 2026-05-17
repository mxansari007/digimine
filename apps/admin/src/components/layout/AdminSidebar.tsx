"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Logo } from "@/components/common/Logo";

// Simple SVG Icons
const HomeIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
);
const TagIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
);
const ShoppingCartIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);
const UsersIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
);
const CogIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const TestIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const QuizIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9h6m-6 4h3m-5 8h10a2 2 0 002-2V7.414a2 2 0 00-.586-1.414l-3.414-3.414A2 2 0 0013.586 2H7a2 2 0 00-2 2v15a2 2 0 002 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 2v5h5" />
    </svg>
);

const ContestIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 6H4a2 2 0 00-2 2v.5A4.5 4.5 0 006.5 13H8M17 6h3a2 2 0 012 2v.5a4.5 4.5 0 01-4.5 4.5H16" />
    </svg>
);

const QuestionBankIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6.5A2.5 2.5 0 016.5 4H20v14H6.5A2.5 2.5 0 004 20.5v-14z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 8h8M8 12h6M6.5 18H20" />
    </svg>
);

const CourseIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13c-1.168-.776-2.754-1.253-4.5-1.253s-3.332.477-4.5 1.253" />
    </svg>
);

const navigation = [
    { name: "Dashboard", href: "/", icon: HomeIcon },
    { name: "Products", href: "/products", icon: TagIcon },
    { name: "Courses", href: "/courses", icon: CourseIcon },
    { name: "Orders", href: "/orders", icon: ShoppingCartIcon },
    { name: "Test Series", href: "/tests", icon: TestIcon },
    { name: "Question Bank", href: "/question-bank", icon: QuestionBankIcon },
    { name: "Contests", href: "/contests", icon: ContestIcon },
    { name: "Quizzes", href: "/quizzes", icon: QuizIcon },
    { name: "Users", href: "/users", icon: UsersIcon },
    { name: "Settings", href: "/settings", icon: CogIcon },
];

export function AdminSidebar({ isOpen = false, onClose }: { isOpen?: boolean; onClose?: () => void }) {
    const pathname = usePathname();
    const { user, signOut } = useAdminAuth();

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300"
                    onClick={onClose}
                />
            )}

            <div className={`flex flex-col h-full bg-[#07111f] border-r border-white/10 w-64 fixed left-0 top-0 bottom-0 z-40 shadow-2xl transform transition-transform duration-300 ease-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between lg:justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-500/15 via-indigo-500/10 to-transparent opacity-90" />
                    <div className="relative z-10 flex items-center gap-3">
                        <Logo variant="light" iconSize={26} />
                        <span className="text-[10px] font-bold bg-white/10 text-primary-200 px-2 py-0.5 rounded-full border border-white/10 hidden sm:inline-block">
                            ADMIN
                        </span>
                    </div>
                    {/* Mobile Close Button */}
                    <button 
                        onClick={onClose}
                        className="lg:hidden relative z-10 p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
                {navigation.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={onClose}
                            className={isActive ? "sidebar-link sidebar-link-active" : "sidebar-link sidebar-link-inactive"}
                        >
                            <Icon />
                            {item.name}
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary-400 rounded-r-full shadow-[0_0_14px_rgba(56,189,248,0.55)]" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-white/[0.035]">
                <div className="flex items-center gap-3 mb-4 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary-600 to-primary-400 p-[2px]">
                        <div className="w-full h-full rounded-full bg-[#07111f] flex items-center justify-center text-primary-200 font-bold text-sm">
                            {user?.displayName?.[0]?.toUpperCase() || "A"}
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">
                            {user?.displayName || "Admin User"}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    </div>
                </div>
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center px-4 py-2.5 text-sm text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all duration-200 font-semibold border border-red-500/10 hover:border-red-500/20"
                >
                    Sign Out
                </button>
            </div>
            </div>
        </>
    );
}
