import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { EntitlementsProvider } from "@/contexts/EntitlementsContext";
import { CreditsProvider } from "@/contexts/CreditsContext";
import { FacebookPixel } from "@/components/common";
import { ToastProvider } from "@digimine/ui";
import { ThemeProvider, themeInitScript } from "@/components/theme";
import {
    defaultOgImage,
    SITE_LOCALE,
    SITE_NAME,
    SITE_TAGLINE,
    SITE_TWITTER,
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
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#0d9488" },
        { media: "(prefers-color-scheme: dark)", color: "#16161e" },
    ],
    colorScheme: "light dark",
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
        "PlacementRanker is an all-in-one placement-prep platform: DSA & SQL practice, mock tests, live coding contests, quizzes, courses & AI mock interviews.",
    applicationName: SITE_NAME,
    keywords: [
        "placement preparation",
        "DSA practice",
        "SQL practice",
        "coding interview preparation",
        "AI mock interview",
        "online mock tests",
        "coding contests",
        "aptitude practice",
        "campus placement",
        "technical interview practice",
        "competitive programming",
        "online code judge",
    ],
    authors: [{ name: SITE_NAME, url: siteOrigin() }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "education",
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
            "Crack your placement: DSA & SQL practice, real-timing mock tests, live coding contests, quizzes, courses & AI mock interviews — built for Indian placement season.",
        images: [{ url: defaultOgImage(), width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
        card: "summary_large_image",
        site: SITE_TWITTER,
        creator: SITE_TWITTER,
        title: `${SITE_NAME} — ${SITE_TAGLINE}`,
        description:
            "Crack your placement: DSA & SQL practice, real-timing mock tests, live coding contests, quizzes, courses & AI mock interviews — built for Indian placement season.",
        images: [defaultOgImage()],
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
        <html
            lang="en-IN"
            className={`${inter.variable} ${outfit.variable}`}
            suppressHydrationWarning
        >
            <head>
                {/* Resolve + apply the persisted theme before first paint to
                    avoid a flash of the wrong theme. Must run synchronously in
                    <head>, before the body renders. */}
                <script
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: themeInitScript }}
                />
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
                <ThemeProvider>
                    <FacebookPixel />
                    <ToastProvider>
                        <AuthProvider>
                            <EntitlementsProvider>
                                <CreditsProvider>
                                    {children}
                                </CreditsProvider>
                            </EntitlementsProvider>
                        </AuthProvider>
                    </ToastProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
