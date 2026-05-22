import type { MetadataRoute } from "next";
import { adminDb } from "@/lib/firebase/admin";
import { siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/**
 * Static, always-on routes.
 * Order is roughly by importance — Google reads priority loosely but it
 * still helps weight discovery.
 */
const STATIC_ROUTES: Array<{
    path: string;
    changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority?: number;
}> = [
    { path: "/", changeFrequency: "daily", priority: 1.0 },
    { path: "/for-teachers", changeFrequency: "weekly", priority: 0.9 },
    { path: "/for-institutes", changeFrequency: "weekly", priority: 0.9 },
    { path: "/articles", changeFrequency: "daily", priority: 0.9 },
    { path: "/courses", changeFrequency: "daily", priority: 0.9 },
    { path: "/tests", changeFrequency: "daily", priority: 0.9 },
    { path: "/quizzes", changeFrequency: "daily", priority: 0.9 },
    { path: "/contests", changeFrequency: "daily", priority: 0.8 },
    { path: "/marketplace", changeFrequency: "daily", priority: 0.8 },
    { path: "/products", changeFrequency: "weekly", priority: 0.7 },
    { path: "/help", changeFrequency: "monthly", priority: 0.5 },
    { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
    { path: "/refund-policy", changeFrequency: "yearly", priority: 0.2 },
    { path: "/shipping-policy", changeFrequency: "yearly", priority: 0.2 },
];

function toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof (value as any)?.toDate === "function") return (value as any).toDate();
    if (typeof (value as any)?.seconds === "number") {
        return new Date((value as any).seconds * 1000);
    }
    if (typeof value === "string" || typeof value === "number") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

async function fetchPublishedSlugs(collection: string, slugField = "slug") {
    try {
        const snap = await adminDb.collection(collection).where("status", "==", "published").get();
        return snap.docs.map((d) => {
            const data = d.data() || {};
            const slug = (data[slugField] || data.slug || d.id) as string;
            const updatedAt = toDate(data.updatedAt) || toDate(data.publishedAt) || toDate(data.createdAt);
            return { slug, updatedAt };
        });
    } catch (err) {
        console.warn(`sitemap: failed to load ${collection}`, err);
        return [];
    }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const origin = siteOrigin();
    const now = new Date();

    const [articles, courses, tests, quizzes, contests, products] = await Promise.all([
        fetchPublishedSlugs("articles"),
        fetchPublishedSlugs("courses"),
        fetchPublishedSlugs("tests"),
        fetchPublishedSlugs("quizzes"),
        fetchPublishedSlugs("contests"),
        fetchPublishedSlugs("products"),
    ]);

    const dynamicEntries: MetadataRoute.Sitemap = [
        ...articles.map((a) => ({
            url: `${origin}/articles/${a.slug}`,
            lastModified: a.updatedAt || now,
            changeFrequency: "weekly" as const,
            priority: 0.7,
        })),
        ...courses.map((c) => ({
            url: `${origin}/courses/${c.slug}`,
            lastModified: c.updatedAt || now,
            changeFrequency: "weekly" as const,
            priority: 0.8,
        })),
        ...tests.map((t) => ({
            url: `${origin}/tests/${t.slug}`,
            lastModified: t.updatedAt || now,
            changeFrequency: "weekly" as const,
            priority: 0.8,
        })),
        ...quizzes.map((q) => ({
            url: `${origin}/quizzes/${q.slug}`,
            lastModified: q.updatedAt || now,
            changeFrequency: "weekly" as const,
            priority: 0.7,
        })),
        ...contests.map((c) => ({
            url: `${origin}/contests/${c.slug}`,
            lastModified: c.updatedAt || now,
            changeFrequency: "daily" as const,
            priority: 0.6,
        })),
        ...products.map((p) => ({
            url: `${origin}/products/${p.slug}`,
            lastModified: p.updatedAt || now,
            changeFrequency: "weekly" as const,
            priority: 0.6,
        })),
    ];

    const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
        url: `${origin}${r.path}`,
        lastModified: now,
        changeFrequency: r.changeFrequency,
        priority: r.priority,
    }));

    return [...staticEntries, ...dynamicEntries];
}
