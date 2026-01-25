"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { signOut } from "@/lib/firebase/auth";
export function Header() {
    const { isAuthenticated, user, loading } = useAuthContext();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, []);

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
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    const navLinks = [
        { href: "/products", label: "Products" },
        { href: "/products?type=ebook", label: "eBooks" },
        { href: "/products?type=course", label: "Courses" },
        { href: "/products?type=template", label: "Templates" },
    ];

    return (
        <>
            <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
                <div className="container-page">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-2">
                            <span className="font-display text-xl font-bold text-white">
                                <span className="text-primary-500">Digi</span>mine
                            </span>
                        </Link>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center gap-8">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="text-gray-200 hover:text-white font-medium transition-colors"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>

                        {/* Right side actions */}
                        <div className="flex items-center gap-2 md:gap-4">
                            {/* Desktop Auth buttons */}
                            <div className="hidden md:flex items-center gap-2">
                                {loading ? (
                                    <div className="w-20 h-9 bg-gray-800 animate-pulse rounded-lg" />
                                ) : isAuthenticated ? (
                                    <div className="flex items-center gap-3">
                                        <Link
                                            href="/dashboard"
                                            className="text-white hover:text-primary-400 font-semibold transition-colors"
                                        >
                                            {user?.displayName || "Dashboard"}
                                        </Link>
                                        <Button variant="ghost" size="sm" onClick={handleSignOut} className="!text-white hover:bg-white/10 font-medium">
                                            Sign Out
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Link href="/login">
                                            <Button variant="ghost" size="sm" className="!text-white hover:bg-white/10 font-medium">Sign In</Button>
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
                                className="md:hidden p-2 text-gray-300 hover:text-white transition-colors"
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
                className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300 ${isMobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Mobile Menu Drawer */}
            <div
                className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white z-50 md:hidden transform transition-transform duration-300 ease-out ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
                    }`}
            >
                {/* Mobile Menu Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <span className="font-display text-lg font-bold text-gray-900">
                        <span className="text-primary-600">Digi</span>mine
                    </span>
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="p-2 text-gray-500 hover:text-gray-700"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Mobile Navigation Links */}
                <nav className="p-4 space-y-1">
                    {navLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="block px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                {/* Mobile Auth Section */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100 bg-gray-50">
                    {loading ? (
                        <div className="w-full h-10 bg-gray-200 animate-pulse rounded-lg" />
                    ) : isAuthenticated ? (
                        <div className="space-y-2">
                            <Link
                                href="/dashboard"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block w-full text-center py-2 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium"
                            >
                                My Dashboard
                            </Link>
                            <button
                                onClick={handleSignOut}
                                className="block w-full py-2 px-4 text-gray-600 hover:text-gray-800 text-center"
                            >
                                Sign Out
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Link
                                href="/register"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block w-full text-center py-3 px-4 bg-primary-600 text-white rounded-lg font-medium"
                            >
                                Get Started
                            </Link>
                            <Link
                                href="/login"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block w-full text-center py-2 px-4 text-gray-600"
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
