import Link from "next/link";
import { Logo } from "@/components/common/Logo";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-50 dark:from-primary-500/10 via-white dark:via-surface to-accent-50 dark:to-accent-500/10 flex flex-col">
            {/* Minimal Header */}
            <header className="py-6">
                <div className="container-page">
                    <Link href="/" className="inline-flex items-center">
                        <Logo variant="dark" iconSize={28} />
                    </Link>
                </div>
            </header>

            {/* Auth Content */}
            <main className="flex-1 flex items-center justify-center py-12 px-4">
                {children}
            </main>

            {/* Minimal Footer */}
            <footer className="py-6">
                <div className="container-page text-center text-sm text-gray-500">
                    © {new Date().getFullYear()} PlacementRanker. All rights reserved.
                </div>
            </footer>
        </div>
    );
}
