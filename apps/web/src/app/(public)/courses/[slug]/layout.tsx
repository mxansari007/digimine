import type { Metadata } from "next";
import {
    breadcrumbJsonLd,
    buildMetadata,
    courseJsonLd,
    jsonLdScript,
} from "@/lib/seo";
import { getCachedDocBySlug } from "@/lib/server/slugCache";

interface RouteParams {
    params: { slug: string };
}

async function loadCourse(slug: string) {
    // Cached + slug-fast-path + public-catalog gate (see slugCache.ts).
    return getCachedDocBySlug("courses", slug).catch(() => null);
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
    const course = await loadCourse(decodeURIComponent(params.slug || ""));
    if (!course) {
        return buildMetadata({
            title: "Course not found",
            description: "The course you’re looking for isn’t available.",
            path: `/courses/${params.slug}`,
            noIndex: true,
        });
    }
    return buildMetadata({
        title: course.title,
        description:
            course.shortDescription ||
            course.description?.slice(0, 160) ||
            "Self-paced online course on PlacementRanker.",
        path: `/courses/${course.slug}`,
        ogImage: course.thumbnailURL || null,
        keywords: Array.isArray(course.tags) ? course.tags.slice(0, 12) : undefined,
    });
}

export default async function CourseDetailLayout({
    children,
    params,
}: RouteParams & { children: React.ReactNode }) {
    const course = await loadCourse(decodeURIComponent(params.slug || ""));
    if (!course) return <>{children}</>;

    const path = `/courses/${course.slug}`;
    const ld = courseJsonLd({
        name: course.title,
        description: course.shortDescription || course.description || "",
        path,
        image: course.thumbnailURL || null,
        accessType: course.accessType,
        priceINR: typeof course.price === "number" ? course.price : 0,
        estimatedHours: course.estimatedHours,
        difficulty: course.difficulty,
    });
    const crumb = breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Courses", path: "/courses" },
        { name: course.title, path },
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
