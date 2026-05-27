import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { EntitlementsProvider } from "@/contexts/EntitlementsContext";
import { FacebookPixel } from "@/components/common";
import { ToastProvider } from "@digimine/ui";
import {
    DEFAULT_OG_IMAGE,
    SITE_LOCALE,
    SITE_NAME,
    SITE_TAGLINE,
    SITE_TWITTER,
    absoluteUrl,
    jsonLdScript,
    organizationJsonLd,
    siteOrigin,
    websiteJsonLd,
} from "@/lib/seo";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

const outfit = Outfit({
    subsets: ["latin"],
    variable: "--font-outfit",
});

export const viewport: Viewport = {
    themeColor: "#0d9488",
    colorScheme: "light",
    width: "device-width",
    initialScale: 1,
};

export const metadata: Metadata = {
    metadataBase: new URL(siteOrigin()),
    title: {
        default: `${SITE_NAME} — ${SITE_TAGLINE}`,
        template: `%s · ${SITE_NAME}`,
    },
    description:
        "PlacementRanker is an Indian learning platform for tests, quizzes, courses, contests, and a teacher marketplace. Practice for NEET, JEE, school boards, and more.",
    applicationName: SITE_NAME,
    keywords: [
        "mock tests",
        "online quizzes",
        "online courses",
        "NEET preparation",
        "JEE preparation",
        "school tests",
        "teacher marketplace",
        "coding tests",
        "study material India",
    ],
    authors: [{ name: SITE_NAME, url: siteOrigin() }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    alternates: {
        canonical: siteOrigin(),
    },
    openGraph: {
        type: "website",
        locale: SITE_LOCALE,
        url: siteOrigin(),
        siteName: SITE_NAME,
        title: `${SITE_NAME} — ${SITE_TAGLINE}`,
        description:
            "Tests, quizzes, courses, contests, and a teacher marketplace for every kind of learner in India.",
        images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
        card: "summary_large_image",
        site: SITE_TWITTER,
        creator: SITE_TWITTER,
        title: `${SITE_NAME} — ${SITE_TAGLINE}`,
        description:
            "Tests, quizzes, courses, contests, and a teacher marketplace for every kind of learner in India.",
        images: [absoluteUrl(DEFAULT_OG_IMAGE)],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
        },
    },
    icons: {
        icon: "/favicon.ico",
        shortcut: "/favicon.ico",
        apple: "/favicon.ico",
    },
    formatDetection: {
        email: false,
        address: false,
        telephone: false,
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en-IN" className={`${inter.variable} ${outfit.variable}`}>
            <head>
                {/* Site-wide JSON-LD: Organization + WebSite (sitelinks search box) */}
                <script
                    type="application/ld+json"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd()) }}
                />
                <script
                    type="application/ld+json"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
                />
            </head>
            <body className="font-sans antialiased">
                <FacebookPixel />
                <ToastProvider>
                    <AuthProvider>
                        <EntitlementsProvider>
                            {children}
                        </EntitlementsProvider>
                    </AuthProvider>
                </ToastProvider>
            </body>
        </html>
    );
}
