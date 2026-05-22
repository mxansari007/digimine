import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
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
    if (!slug) return null;
    try {
        const snap = await adminDb
            .collection("tests")
            .where("slug", "==", slug)
            .limit(1)
            .get();
        if (snap.empty) return null;
        const d = snap.docs[0];
        const data = d.data() || {};
        if ((data.status || "draft") !== "published" || data.isDeleted) return null;
        return { id: d.id, ...data } as any;
    } catch {
        return null;
    }
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
            "Online mock test series on Digimine.",
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
