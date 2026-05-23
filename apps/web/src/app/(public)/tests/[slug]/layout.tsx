import type { Metadata } from "next";
import { getCachedDocBySlug } from "@/lib/server/slugCache";
import {
    breadcrumbJsonLd,
    buildMetadata,
    examJsonLd,
    jsonLdScript,
} from "@/lib/seo";

interface RouteParams {
    params: { slug: string };
}

async function loadTestSeries(slug: string) {
    return getCachedDocBySlug("tests", slug).catch(() => null);
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
    const series = await loadTestSeries(decodeURIComponent(params.slug || ""));
    if (!series) {
        return buildMetadata({
            title: "Test not found",
            description: "The test series you’re looking for isn’t available.",
            path: `/tests/${params.slug}`,
            noIndex: true,
        });
    }
    return buildMetadata({
        title: series.title,
        description:
            series.shortDescription ||
            series.description?.slice(0, 160) ||
            "Online mock test series on PlacementRanker.",
        path: `/tests/${series.slug}`,
        ogImage: series.thumbnailURL || null,
        keywords: Array.isArray(series.tags) ? series.tags.slice(0, 12) : undefined,
    });
}

export default async function TestSeriesLayout({
    children,
    params,
}: RouteParams & { children: React.ReactNode }) {
    const series = await loadTestSeries(decodeURIComponent(params.slug || ""));
    if (!series) return <>{children}</>;

    const path = `/tests/${series.slug}`;
    const ld = examJsonLd({
        name: series.title,
        description: series.shortDescription || series.description || "",
        path,
        image: series.thumbnailURL || null,
        timeLimitMinutes: series.duration,
        totalQuestions: series.totalQuestions,
        educationalLevel: series.difficulty,
    });
    const crumb = breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Mock Tests", path: "/tests" },
        { name: series.title, path },
    ]);

    return (
        <>
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }}
            />
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: jsonLdScript(crumb) }}
            />
            {children}
        </>
    );
}
