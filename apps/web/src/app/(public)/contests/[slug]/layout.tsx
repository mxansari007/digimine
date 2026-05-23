import type { Metadata } from "next";
import {
    breadcrumbJsonLd,
    buildMetadata,
    contestJsonLd,
    jsonLdScript,
} from "@/lib/seo";
import { getCachedDocBySlug } from "@/lib/server/slugCache";

interface RouteParams {
    params: { slug: string };
}

/** Kept for use further down in this file (start/end time formatting). */
function toIso(value: unknown): string | null {
    if (!value) return null;
    const ts = value as { toDate?: () => Date; seconds?: number };
    if (typeof ts.toDate === "function") return ts.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return value;
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
    return null;
}

async function loadContest(slug: string) {
    // The cached helper already converts nested Timestamp fields (startTime,
    // endTime, etc.) to ISO strings, so call sites can use them directly.
    return getCachedDocBySlug("contests", slug).catch(() => null);
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
    const contest = await loadContest(decodeURIComponent(params.slug || ""));
    if (!contest) {
        return buildMetadata({
            title: "Contest not found",
            description: "The contest you’re looking for isn’t available.",
            path: `/contests/${params.slug}`,
            noIndex: true,
        });
    }
    return buildMetadata({
        title: contest.title,
        description:
            contest.shortDescription ||
            contest.description?.slice(0, 160) ||
            "Live online contest on PlacementRanker.",
        path: `/contests/${contest.slug}`,
        ogImage: contest.thumbnailURL || null,
        keywords: Array.isArray(contest.tags) ? contest.tags.slice(0, 12) : undefined,
    });
}

export default async function ContestDetailLayout({
    children,
    params,
}: RouteParams & { children: React.ReactNode }) {
    const contest = await loadContest(decodeURIComponent(params.slug || ""));
    if (!contest) return <>{children}</>;

    const path = `/contests/${contest.slug}`;
    const ld = contestJsonLd({
        name: contest.title,
        description: contest.shortDescription || contest.description || "",
        path,
        image: contest.thumbnailURL || null,
        startDate: toIso(contest.startTime),
        endDate: toIso(contest.endTime),
    });
    const crumb = breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Contests", path: "/contests" },
        { name: contest.title, path },
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
