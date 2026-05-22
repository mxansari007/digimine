import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import {
    absoluteUrl,
    breadcrumbJsonLd,
    buildMetadata,
    courseJsonLd,
    jsonLdScript,
} from "@/lib/seo";

interface RouteParams {
    params: { slug: string };
}

async function loadCourse(slug: string) {
    if (!slug) return null;
    try {
        const snap = await adminDb
            .collection("courses")
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
            "Self-paced online course on Digimine.",
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
