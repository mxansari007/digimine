import Link from "next/link";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50 flex flex-col">
            {/* Minimal Header */}
            <header className="py-6">
                <div className="container-page">
                    <Link href="/" className="inline-block">
                        <span className="font-display text-2xl font-bold text-gray-900">
                            <span className="text-primary-600">Digi</span>mine
                        </span>
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
                    © {new Date().getFullYear()} Digimine. All rights reserved.
                </div>
            </footer>
        </div>
    );
}
