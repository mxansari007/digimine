"use client";

import { ProductCard } from "@/components/products/ProductCard";
import type { Product } from "@digimine/types";
import type { StoreCardItem } from "@/lib/server/catalog";

/**
 * Featured-products grid for the homepage — seeded with `items` fetched on
 * the server (cached). No client-side data fetch, no loading skeleton — the
 * grid is fully rendered in the SSR HTML so it's part of LCP / search-engine
 * crawl, not something that pops in after hydration.
 *
 * Ratings/review counts are intentionally omitted on the homepage to keep
 * this island weight-zero; the products' own detail pages show ratings.
 */
export default function HomeFeaturedProducts({ items }: { items: StoreCardItem[] }) {
    if (items.length === 0) {
        return (
            <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
                No featured content yet — check back soon.
            </div>
        );
    }

    return (
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
                <ProductCard key={item.id} product={item as unknown as Product} />
            ))}
        </div>
    );
}
