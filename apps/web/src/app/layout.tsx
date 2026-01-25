import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-jakarta",
});

export const metadata: Metadata = {
    title: {
        default: "Digimine - Digital Products Marketplace",
        template: "%s | Digimine",
    },
    description:
        "Discover and purchase premium digital products. eBooks, courses, templates, and more from creators worldwide.",
    keywords: [
        "digital products",
        "ebooks",
        "online courses",
        "templates",
        "marketplace",
    ],
    authors: [{ name: "Digimine" }],
    openGraph: {
        type: "website",
        locale: "en_US",
        url: "https://digimine.com",
        siteName: "Digimine",
        title: "Digimine - Digital Products Marketplace",
        description:
            "Discover and purchase premium digital products from creators worldwide.",
    },
    twitter: {
        card: "summary_large_image",
        title: "Digimine - Digital Products Marketplace",
        description:
            "Discover and purchase premium digital products from creators worldwide.",
    },
    robots: {
        index: true,
        follow: true,
    },
    icons: {
        icon: "/favicon.ico",
        shortcut: "/favicon.ico",
        apple: "/favicon.ico",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
            <body className="font-sans antialiased">
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    );
}
