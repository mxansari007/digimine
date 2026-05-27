import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { ToastProvider } from "@digimine/ui";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
    themeColor: "#0d9488",
    colorScheme: "light",
    width: "device-width",
    initialScale: 1,
};

// Admin is private — never index, never share on social cards.
export const metadata: Metadata = {
    title: {
        default: "PlacementRanker Admin",
        template: "%s · PlacementRanker Admin",
    },
    description: "Internal admin console for PlacementRanker — manage courses, tests, quizzes, articles, products and contests.",
    robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={`${inter.className} bg-gray-50 text-gray-900`}>
                <ToastProvider>
                    <AdminAuthProvider>
                        {children}
                    </AdminAuthProvider>
                </ToastProvider>
            </body>
        </html>
    );
}
