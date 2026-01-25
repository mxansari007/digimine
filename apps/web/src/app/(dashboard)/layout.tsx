"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firebase/auth";
import { PageLoading } from "@/components/common";

const navItems = [
    {
        label: "My Products",
        href: "/dashboard",
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
            </svg>
        ),
    },
    {
        label: "Downloads",
        href: "/dashboard/downloads",
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
            </svg>
        ),
    },
    {
        label: "Profile",
        href: "/dashboard/profile",
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
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

    if (loading) {
        return <PageLoading />;
    }

    // Redirect to login handled by middleware, but show loading as fallback
    if (!isAuthenticated) {
        return <PageLoading />;
    }

    const handleSignOut = async () => {
        try {
            await signOut();
            router.push("/login");
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    const SidebarContent = () => (
        <>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <Link href="/">
                    <span className="font-display text-xl font-bold text-gray-900">
                        <span className="text-primary-600">Digi</span>mine
                    </span>
                </Link>
                {/* Close button for mobile */}
                <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="md:hidden text-gray-500 hover:text-gray-900"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* User Info */}
            <div className="p-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 font-semibold">
                            {user?.displayName?.charAt(0) || user?.email?.charAt(0) || "U"}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                            {user?.displayName || "User"}
                        </p>
                        <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${isActive
                                ? "bg-primary-50 text-primary-700"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                }`}
                        >
                            {item.icon}
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-gray-100 mt-auto">
                <Link
                    href="/"
                    className="flex items-center gap-3 px-4 py-2.5 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors"
                >
                    <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                        />
                    </svg>
                    Back to Store
                </Link>
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors"
                >
                    <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                    </svg>
                    Sign Out
                </button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-30">
                <Link href="/">
                    <span className="font-display text-xl font-bold text-gray-900">
                        <span className="text-primary-600">Digi</span>mine
                    </span>
                </Link>
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-2 text-gray-600 hover:text-gray-900"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </div>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 fixed h-full flex-col">
                <SidebarContent />
            </aside>

            {/* Mobile Sidebar Drawer */}
            <div className={`md:hidden fixed inset-0 z-40 ${isMobileMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
                {/* Overlay */}
                <div
                    className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${isMobileMenuOpen ? "opacity-100" : "opacity-0"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                />

                {/* Drawer */}
                <div
                    className={`absolute top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-white transition-transform duration-300 ease-out transform ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"} flex flex-col overflow-hidden`}
                >
                    <SidebarContent />
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-4 md:p-8 w-full">
                {children}
            </main>
        </div>
    );
}
