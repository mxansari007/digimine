import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import {
    breadcrumbJsonLd,
    buildMetadata,
    contestJsonLd,
    jsonLdScript,
} from "@/lib/seo";

interface RouteParams {
    params: { slug: string };
}

function toIso(value: any): string | null {
    if (!value) return null;
    if (typeof value?.toDate === "function") return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return value;
    if (typeof value?.seconds === "number") return new Date(value.seconds * 1000).toISOString();
    return null;
}

async function loadContest(slug: string) {
    if (!slug) return null;
    try {
        const snap = await adminDb
            .collection("contests")
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
