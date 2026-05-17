"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firebase/auth";
import { PageLoading } from "@/components/common";
import { Logo } from "@/components/common/Logo";

const navItems = [
    {
        label: "My Library",
        href: "/dashboard",
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
        ),
    },
    {
        label: "Test Series",
        href: "/dashboard/tests",
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
        ),
    },
    {
        label: "Quizzes",
        href: "/dashboard/quizzes",
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                <circle cx="12" cy="12" r="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                <circle cx="12" cy="12" r="1.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
            </svg>
        ),
    },
    {
        label: "Contests",
        href: "/dashboard/contests",
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5H3v2a4 4 0 004 4M19 5h2v2a4 4 0 01-4 4" />
            </svg>
        ),
    },
    {
        label: "Downloads",
        href: "/dashboard/downloads",
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
        ),
    },
    {
        label: "Profile & Settings",
        href: "/dashboard/profile",
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        ),
    },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading, isAuthenticated } = useAuthContext();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push("/login");
        }
    }, [loading, isAuthenticated, router]);

    if (loading) return <PageLoading />;
    if (!isAuthenticated) return <PageLoading />;

    const handleSignOut = async () => {
        try {
            await signOut();
            router.push("/login");
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    const userInitial = user?.displayName?.charAt(0) || user?.email?.charAt(0) || "U";
    const userName = user?.displayName || user?.email || "User";

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-6 flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-primary-500/10 via-indigo-500/10 to-transparent">
                <Link href="/">
                    <Logo variant="light" iconSize={26} />
                </Link>
                <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="md:hidden text-white/60 hover:text-white p-1 rounded hover:bg-white/10"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* User profile chip */}
            <div className="p-4 mx-3 mt-4 rounded-2xl border border-white/10 bg-white/[0.07] flex items-center gap-3 shadow-[0_16px_40px_rgba(0,0,0,0.16)]">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-lg">
                    {userInitial}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate text-sm">{userName}</p>
                            <span className="text-xs px-2 py-0.5 bg-primary-500/25 text-primary-100 rounded-full font-semibold border border-primary-300/10">Customer</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="p-3 mt-4 flex-1 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 px-3 mb-3">Menu</p>
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 text-sm font-semibold ${
                                isActive
                                    ? "bg-white text-slate-950 border-white shadow-lg shadow-black/20"
                                    : "text-white/70 border-transparent hover:bg-white/[0.08] hover:text-white hover:border-white/10"
                            }`}
                        >
                            <span className={isActive ? "text-primary-600" : ""}>{item.icon}</span>
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom actions */}
            <div className="p-3 border-t border-white/10 space-y-1">
                <Link
                    href="/"
                    className="flex items-center gap-3 px-3 py-2.5 text-white/60 hover:bg-white/[0.08] hover:text-white rounded-xl transition-all text-sm font-semibold"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Back to Store
                </Link>
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-red-300 hover:bg-red-500/10 hover:text-red-200 rounded-xl transition-all text-sm font-semibold"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen app-canvas flex">
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 bg-slate-950/95 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between z-30 h-14 shadow-lg">
                <Link href="/">
                    <Logo variant="light" iconSize={22} />
                </Link>
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-2 text-white/70 hover:text-white rounded-lg"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </div>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-64 bg-[#07111f] fixed h-full flex-col shadow-2xl z-20 border-r border-white/10">
                <SidebarContent />
            </aside>

            {/* Mobile Sidebar Drawer */}
            <div className={`md:hidden fixed inset-0 z-40 ${isMobileMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
                <div
                    className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isMobileMenuOpen ? "opacity-100" : "opacity-0"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                />
                <div
                    className={`absolute top-0 left-0 bottom-0 w-72 bg-[#07111f] transition-transform duration-300 ease-out ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"} overflow-hidden shadow-2xl`}
                >
                    <SidebarContent />
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 pt-14 md:pt-0 min-h-screen">
                <div className="p-6 md:p-8 max-w-6xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
