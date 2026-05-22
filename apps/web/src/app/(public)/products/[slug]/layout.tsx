import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import {
    breadcrumbJsonLd,
    buildMetadata,
    jsonLdScript,
    productJsonLd,
} from "@/lib/seo";

interface RouteParams {
    params: { slug: string };
}

async function loadProduct(slug: string) {
    if (!slug) return null;
    try {
        const snap = await adminDb
            .collection("products")
            .where("slug", "==", slug)
            .limit(1)
            .get();
        if (snap.empty) return null;
        const d = snap.docs[0];
        const data = d.data() || {};
        if ((data.status || "draft") !== "published") return null;
        return { id: d.id, ...data } as any;
    } catch {
        return null;
    }
}

async function loadReviewStats(productId: string) {
    try {
        const snap = await adminDb.collection("reviews").where("productId", "==", productId).get();
        if (snap.empty) return { averageRating: 0, reviewCount: 0 };
        let sum = 0;
        let count = 0;
        snap.docs.forEach((d) => {
            const r = Number(d.data()?.rating);
            if (Number.isFinite(r) && r >= 0) {
                sum += r;
                count += 1;
            }
        });
        return { averageRating: count > 0 ? Math.round((sum / count) * 10) / 10 : 0, reviewCount: count };
    } catch {
        return { averageRating: 0, reviewCount: 0 };
    }
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
    const product = await loadProduct(decodeURIComponent(params.slug || ""));
    if (!product) {
        return buildMetadata({
            title: "Product not found",
            description: "The product you’re looking for isn’t available.",
            path: `/products/${params.slug}`,
            noIndex: true,
        });
    }
    return buildMetadata({
        title: product.title || product.name,
        description:
            product.shortDescription ||
            product.description?.slice(0, 160) ||
            "Digital product on Digimine.",
        path: `/products/${product.slug}`,
        ogImage: product.thumbnailURL || product.imageURL || null,
        keywords: Array.isArray(product.tags) ? product.tags.slice(0, 12) : undefined,
    });
}

export default async function ProductDetailLayout({
    children,
    params,
}: RouteParams & { children: React.ReactNode }) {
    const product = await loadProduct(decodeURIComponent(params.slug || ""));
    if (!product) return <>{children}</>;

    const path = `/products/${product.slug}`;
    const stats = await loadReviewStats(product.id);
    const ld = productJsonLd({
        name: product.title || product.name,
        description: product.shortDescription || product.description || "",
        path,
        image: product.thumbnailURL || product.imageURL || null,
        sku: product.id,
        priceINR: typeof product.price === "number" ? product.price : 0,
        averageRating: stats.averageRating,
        reviewCount: stats.reviewCount,
    });
    const crumb = breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Products", path: "/products" },
        { name: product.title || product.name, path },
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
