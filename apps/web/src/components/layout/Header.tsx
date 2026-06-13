"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { useEntitlements } from "@/contexts/EntitlementsContext";
import { useCredits } from "@/contexts/CreditsContext";
import { signOut } from "@/lib/firebase/auth";
import { Logo } from "@/components/common/Logo";
import { TeachersDropdown } from "@/components/teacher/TeachersDropdown";
import { userHomePath } from "@/lib/auth/redirects";
import UserMenu from "@/components/layout/UserMenu";
import CreditsBalancePill, { CreditsMobileRow } from "@/components/layout/CreditsBalancePill";
import Avatar from "@/components/common/Avatar";
import MegaNav from "@/components/layout/MegaNav";
import HeaderSearch from "@/components/layout/HeaderSearch";
import { ThemeToggle } from "@/components/theme";
import type { MegaItem } from "@/components/layout/megaNavData";

export interface HeaderProps {
    /** Admin-edited mega-nav items, forwarded from the public layout. */
    megaNavItems?: MegaItem[];
}

export function Header({ megaNavItems }: HeaderProps = {}) {
    const { isAuthenticated, user, loading, portals } = useAuthContext();
    const { isPremium } = useEntitlements();
    const { enabled: creditsEnabled, balance: creditsBalance } = useCredits();
    const pathname = usePathname();
    const router = useRouter();
    // Send each role to its own home. `portals` reflects the user's REAL
    // roles (a teacher who also admins an institute has both), so prefer
    // its first entry; fall back to the single-role path, then /dashboard,
    // so the link target is never undefined.
    const dashboardHref = portals[0]?.href ?? (user ? userHomePath(user) : "/dashboard");
    // The "My Teachers" dropdown is a student-only utility — it lists the
    // classes the caller is enrolled in. Hiding it for non-customers
    // avoids a Firestore-rules-denied read storm on every public page.
    const showTeachersDropdown = user?.role === "customer";
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Close mobile menu on route change. Previously this had an empty deps
    // array so it only fired once on mount — tap a link, navigate, drawer
    // stayed open. `pathname` is the right dep.
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [pathname]);

    // Lock body scroll when mobile menu is open
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isMobileMenuOpen]);

    const handleSignOut = async () => {
        try {
            await signOut();
            setIsMobileMenuOpen(false);
            // Push to home so the user isn't stranded on a now-protected route
            // (the (dashboard) layout would redirect them to /login anyway, but
            // landing on / is friendlier).
            router.push("/");
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    const navLinks = [
        { href: "/practice", label: "Practice" },
        { href: "/courses", label: "Courses" },
        { href: "/articles", label: "Articles" },
        { href: "/tests", label: "Mock Tests" },
        { href: "/quizzes", label: "Quizzes" },
        { href: "/contests", label: "Contests" },
    ];

    return (
        <>
            <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl">
                <div className="container-page">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <Link href="/" className="flex items-center">
                            <Logo variant="dark" iconSize={24} />
                        </Link>

                        {/* Desktop Navigation — mega dropdowns per top-level item.
                            Items are admin-editable; the public layout fetches
                            them server-side and forwards via props. */}
                        <div className="hidden md:block">
                            <MegaNav items={megaNavItems} />
                        </div>

                        {/* Right side actions */}
                        <div className="flex items-center gap-1 md:gap-2">
                            {/* Search icon → opens centered modal. Backed by
                                Meilisearch (see infra/meilisearch/README.md). */}
                            <HeaderSearch />
                            {/* Light / Dark / System theme switcher */}
                            <ThemeToggle />
                            {/* Desktop Auth buttons */}
                            <div className="hidden md:flex items-center gap-1.5">
                                {loading ? (
                                    <div className="h-9 w-28 animate-pulse rounded-full bg-slate-100" />
                                ) : isAuthenticated ? (
                                    <div className="flex items-center gap-1.5">
                                        {showTeachersDropdown && <TeachersDropdown />}
                                        <CreditsBalancePill />
                                        <UserMenu user={user} onSignOut={handleSignOut} portals={portals} isPremium={isPremium} showCredits={creditsEnabled} creditsBalance={creditsBalance} />
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Link href="/login">
                                            <Button variant="ghost" size="sm" className="font-medium">Sign In</Button>
                                        </Link>
                                        <Link href="/register">
                                            <Button variant="primary" size="sm">Get Started</Button>
                                        </Link>
                                    </div>
                                )}
                            </div>

                            {/* Mobile Menu Button */}
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 md:hidden"
                                aria-label="Toggle menu"
                            >
                                {isMobileMenuOpen ? (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                ) : (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            <div
                className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${isMobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Mobile Menu Drawer */}
            <div
                className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white z-50 md:hidden transform transition-transform duration-300 ease-out shadow-2xl ring-1 ring-slate-200/70 ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
                    }`}
            >
                {/* Mobile Menu Header */}
                <div className="flex items-center justify-between border-b border-slate-200 p-4">
                    <Logo variant="dark" iconSize={22} />
                    <button
                        type="button"
                        onClick={() => setIsMobileMenuOpen(false)}
                        aria-label="Close menu"
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Mobile Navigation Links */}
                <nav className="p-4 space-y-1">
                    {navLinks.map((link) => (
                        <Link
                            key={`${link.href}-${link.label}`}
                            href={link.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="block rounded-xl px-4 py-3 font-semibold text-slate-700 transition-colors hover:bg-primary-50 dark:hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300 active:bg-primary-100"
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                {/* Mobile Auth Section */}
                <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-slate-50 p-4">
                    {loading ? (
                        <div className="w-full h-10 bg-gray-200 animate-pulse rounded-lg" />
                    ) : isAuthenticated ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                                <Avatar
                                    src={user?.photoURL}
                                    name={user?.displayName}
                                    email={user?.email}
                                    size={40}
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                        {user?.displayName || "Account"}
                                    </p>
                                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                                </div>
                            </div>
                            {portals.length > 1 ? (
                                portals.map((p) => (
                                    <Link
                                        key={p.id}
                                        href={p.href}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="block w-full rounded-lg bg-primary-600 px-4 py-2.5 text-center font-medium text-white shadow-soft-sm transition-all duration-200 hover:bg-primary-700 active:scale-[0.98]"
                                    >
                                        {p.label} dashboard
                                    </Link>
                                ))
                            ) : (
                                <Link
                                    href={dashboardHref}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="block w-full rounded-lg bg-primary-600 px-4 py-2.5 text-center font-medium text-white shadow-soft-sm transition-all duration-200 hover:bg-primary-700 active:scale-[0.98]"
                                >
                                    My Dashboard
                                </Link>
                            )}
                            <CreditsMobileRow onNavigate={() => setIsMobileMenuOpen(false)} />
                            <button
                                onClick={handleSignOut}
                                className="block w-full px-4 py-2 text-center text-slate-600 hover:text-slate-900"
                            >
                                Sign Out
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Link
                                href="/register"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block w-full rounded-lg bg-primary-600 px-4 py-3 text-center font-medium text-white shadow-soft-sm transition-all duration-200 hover:bg-primary-700 active:scale-[0.98]"
                            >
                                Get Started
                            </Link>
                            <Link
                                href="/login"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block w-full px-4 py-2 text-center text-slate-600"
                            >
                                Sign In
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
