/**
 * SEO helpers for the public surface.
 *
 * Everything routes through `siteOrigin()` so canonicals + JSON-LD URLs
 * stay consistent between local, staging, and production. Set
 * `NEXT_PUBLIC_SITE_URL` (or `NEXT_PUBLIC_APP_URL`) to your live origin.
 *
 * Notes:
 *   - JSON-LD constructors return `unknown` so the caller can shove them
 *     into a `<script type="application/ld+json">`.
 *   - Per-page `buildMetadata()` returns a Next.js `Metadata` object
 *     suitable for `export const metadata = ...` or `generateMetadata`.
 */
import type { Metadata } from "next";

// Re-export the dynamic OG image helpers so consumers can do
// `import { ogImageUrl } from "@/lib/seo"`.
export {
    ogImageUrl,
    articleOgImage,
    practiceOgImage,
    testOgImage,
    type OgImageParams,
    type OgImageStat,
    type OgAccent,
} from "./og";

export const SITE_NAME = "PlacementRanker";
export const SITE_TAGLINE = "Tests, quizzes, courses & marketplace for learners and educators";
export const SITE_TWITTER = "@placementranker";
export const SITE_LOCALE = "en_IN";
export const DEFAULT_OG_IMAGE = "/og-default.png";

export function siteOrigin(): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://placementranker.com"
    ).replace(/\/$/, "");
}

export function absoluteUrl(path: string): string {
    const origin = siteOrigin();
    if (!path) return origin;
    if (path.startsWith("http")) return path;
    return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

// ─────────────────────────────────────────────────────────────────────
// buildMetadata — the workhorse
// ─────────────────────────────────────────────────────────────────────

export interface BuildMetadataInput {
    title: string;
    description: string;
    path?: string;
    ogImage?: string | null;
    ogType?: "website" | "article" | "profile" | "book";
    keywords?: string[];
    noIndex?: boolean;
    canonical?: string | null;
    publishedTime?: string | null;
    modifiedTime?: string | null;
    authors?: string[];
    twitterCard?: "summary" | "summary_large_image";
    twitterCreator?: string | null;
}

export function buildMetadata(input: BuildMetadataInput): Metadata {
    const path = input.path || "/";
    const canonical = input.canonical || absoluteUrl(path);
    const image = input.ogImage ? absoluteUrl(input.ogImage) : absoluteUrl(DEFAULT_OG_IMAGE);
    const description = input.description?.trim() || SITE_TAGLINE;

    return {
        title: input.title,
        description,
        keywords: input.keywords?.length ? input.keywords : undefined,
        alternates: { canonical },
        robots: input.noIndex
            ? { index: false, follow: false }
            : { index: true, follow: true },
        openGraph: {
            type: input.ogType || "website",
            url: canonical,
            siteName: SITE_NAME,
            locale: SITE_LOCALE,
            title: input.title,
            description,
            images: [{ url: image, alt: input.title }],
            ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
            ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
            ...(input.authors?.length ? { authors: input.authors } : {}),
        },
        twitter: {
            card: input.twitterCard || "summary_large_image",
            site: SITE_TWITTER,
            creator: input.twitterCreator || SITE_TWITTER,
            title: input.title,
            description,
            images: [image],
        },
    };
}

// ─────────────────────────────────────────────────────────────────────
// JSON-LD constructors
// ─────────────────────────────────────────────────────────────────────

export function organizationJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: SITE_NAME,
        url: siteOrigin(),
        logo: absoluteUrl("/logo.png"),
        sameAs: [
            "https://twitter.com/placementranker",
            "https://www.linkedin.com/company/placementranker",
        ],
        contactPoint: [
            {
                "@type": "ContactPoint",
                contactType: "customer support",
                email: "support@digimine.com",
                areaServed: "IN",
                availableLanguage: ["en", "hi"],
            },
        ],
    };
}

/**
 * WebSite + SearchAction enables Google's sitelinks search box. The
 * `target` URL should support a single `q` query parameter pointing at
 * your site search.
 */
export function websiteJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SITE_NAME,
        url: siteOrigin(),
        potentialAction: {
            "@type": "SearchAction",
            target: {
                "@type": "EntryPoint",
                urlTemplate: `${siteOrigin()}/marketplace?q={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
        },
    };
}

/**
 * BreadcrumbList — use on detail pages so Google can render the
 * breadcrumb trail under search results.
 */
export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            name: item.name,
            item: absoluteUrl(item.path),
        })),
    };
}

/**
 * ItemList — listing pages can declare the items they show so Google
 * indexes them as a group.
 */
export function itemListJsonLd(items: Array<{ name: string; path: string }>, listName: string) {
    return {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: listName,
        itemListElement: items.slice(0, 25).map((item, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            name: item.name,
            url: absoluteUrl(item.path),
        })),
    };
}

/**
 * Course — schema.org/Course payload for course detail pages. The
 * provider block helps Google attribute the course correctly.
 */
export interface CourseLdInput {
    name: string;
    description: string;
    path: string;
    image?: string | null;
    accessType?: "free" | "enrollment_required";
    priceINR?: number;
    estimatedHours?: number;
    difficulty?: string;
}

export function courseJsonLd(input: CourseLdInput) {
    const offer =
        input.accessType === "enrollment_required" && input.priceINR && input.priceINR > 0
            ? {
                  "@type": "Offer",
                  price: input.priceINR,
                  priceCurrency: "INR",
                  availability: "https://schema.org/InStock",
                  url: absoluteUrl(input.path),
                  category: "Paid",
              }
            : {
                  "@type": "Offer",
                  price: 0,
                  priceCurrency: "INR",
                  availability: "https://schema.org/InStock",
                  url: absoluteUrl(input.path),
                  category: "Free",
              };

    return {
        "@context": "https://schema.org",
        "@type": "Course",
        name: input.name,
        description: input.description,
        url: absoluteUrl(input.path),
        provider: {
            "@type": "Organization",
            name: SITE_NAME,
            sameAs: siteOrigin(),
        },
        ...(input.image ? { image: input.image } : {}),
        offers: offer,
        ...(input.estimatedHours
            ? { timeRequired: `PT${Math.max(1, Math.round(input.estimatedHours))}H` }
            : {}),
        ...(input.difficulty ? { educationalLevel: input.difficulty } : {}),
        hasCourseInstance: [
            {
                "@type": "CourseInstance",
                courseMode: "online",
                inLanguage: "en",
            },
        ],
    };
}

/**
 * Product — schema.org/Product for sellable items. Includes offer + the
 * optional aggregateRating block when we have reviews.
 */
export interface ProductLdInput {
    name: string;
    description: string;
    path: string;
    image?: string | null;
    sku?: string;
    priceINR?: number;
    averageRating?: number;
    reviewCount?: number;
}

export function productJsonLd(input: ProductLdInput) {
    const ld: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: input.name,
        description: input.description,
        url: absoluteUrl(input.path),
        ...(input.image ? { image: input.image } : {}),
        ...(input.sku ? { sku: input.sku } : {}),
        brand: { "@type": "Brand", name: SITE_NAME },
        offers: {
            "@type": "Offer",
            price: input.priceINR ?? 0,
            priceCurrency: "INR",
            availability: "https://schema.org/InStock",
            url: absoluteUrl(input.path),
        },
    };
    if (input.averageRating && input.reviewCount && input.reviewCount > 0) {
        ld.aggregateRating = {
            "@type": "AggregateRating",
            ratingValue: input.averageRating,
            reviewCount: input.reviewCount,
            bestRating: 5,
            worstRating: 1,
        };
    }
    return ld;
}

/**
 * Quiz / Exam — schema.org/Quiz works for both. `LearningResource` is
 * an acceptable alternative for "mock tests".
 */
export interface QuizLdInput {
    name: string;
    description: string;
    path: string;
    image?: string | null;
    timeLimitMinutes?: number;
    totalQuestions?: number;
    educationalLevel?: string;
    educationalAlignment?: string;
}

export function quizJsonLd(input: QuizLdInput) {
    return {
        "@context": "https://schema.org",
        "@type": "Quiz",
        name: input.name,
        description: input.description,
        url: absoluteUrl(input.path),
        ...(input.image ? { image: input.image } : {}),
        ...(input.timeLimitMinutes
            ? { timeRequired: `PT${Math.max(1, input.timeLimitMinutes)}M` }
            : {}),
        ...(input.totalQuestions ? { numberOfQuestions: input.totalQuestions } : {}),
        ...(input.educationalLevel ? { educationalLevel: input.educationalLevel } : {}),
        provider: { "@type": "Organization", name: SITE_NAME, url: siteOrigin() },
        learningResourceType: "Quiz",
    };
}

export function examJsonLd(input: QuizLdInput) {
    return {
        ...quizJsonLd(input),
        "@type": "LearningResource",
        learningResourceType: "Test",
    };
}

/**
 * Event — for live contests. Lets Google show the event card.
 */
export interface ContestLdInput {
    name: string;
    description: string;
    path: string;
    image?: string | null;
    startDate?: string | null;
    endDate?: string | null;
}

export function contestJsonLd(input: ContestLdInput) {
    return {
        "@context": "https://schema.org",
        "@type": "Event",
        name: input.name,
        description: input.description,
        url: absoluteUrl(input.path),
        eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        ...(input.startDate ? { startDate: input.startDate } : {}),
        ...(input.endDate ? { endDate: input.endDate } : {}),
        ...(input.image ? { image: input.image } : {}),
        organizer: { "@type": "Organization", name: SITE_NAME, url: siteOrigin() },
        location: {
            "@type": "VirtualLocation",
            url: absoluteUrl(input.path),
        },
    };
}

export function faqJsonLd(items: Array<{ question: string; answer: string }>) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((it) => ({
            "@type": "Question",
            name: it.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: it.answer,
            },
        })),
    };
}

/**
 * Convenience component-friendly serializer — JSON-LD must be embedded
 * as a string inside `<script>`.
 */
export function jsonLdScript(payload: unknown): string {
    return JSON.stringify(payload, null, 0);
}
